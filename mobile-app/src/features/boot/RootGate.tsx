// The root state machine (master plan §3), evaluated at boot and on config /
// auth / deep-link changes, in strict priority order:
//   1. force-update  2. maintenance  3. no session -> public stack
//   4/5. role tabs   6. unknown role -> retry + logout escape
// Renders the router Stack only once every gate has passed. The OPTIONAL
// update prompt is not in that list on purpose: it is an overlay over the
// mounted Stack, so it can never block the app the way the gates do.
import React, { useEffect, useRef } from "react";
import { AppState, Platform, View } from "react-native";
import { Stack, useRouter, usePathname } from "expo-router";
import * as ExpoLinking from "expo-linking";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import { useMobileConfig } from "@/lib/configQueries";
import { evaluateVersionGate } from "@/lib/mobileConfig";
import {
  consumePendingLink,
  resolveDeepLink,
  storePendingLink,
} from "@/lib/deeplink";
import { isSupabaseConfigured } from "@/lib/env";
import { GROUP_ENTRY_PARAMS, openTarget, popToOrReplace } from "@/lib/navigation";
import { clampLocale, useLocaleStore } from "@/i18n";
import { useAuthStore } from "@/features/auth/authStore";
import { ensureAndroidChannels, initPushDisplay } from "@/features/push/registration";
import { usePushRegistration, usePushTapRouting } from "@/features/push/usePush";
import { useAppLockStore } from "@/features/applock/appLockStore";
import { useAppLock } from "@/features/applock/useAppLock";
import { LockOverlay } from "@/features/applock/LockOverlay";
import { shouldPromptOptionalUpdate, useUpdatePrompt } from "@/lib/updatePrompt";
import { useSeenWelcome } from "./seenWelcome";
import {
  BootErrorView,
  ForceUpdateScreen,
  MaintenanceScreen,
  SplashView,
  UpdateAvailableOverlay,
} from "./screens";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const PLATFORM: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";

export function RootGate() {
  const router = useRouter();
  // The screen currently on top, as a URL (no `(group)` segments). openTarget()
  // needs it to tell "open this" from "you are already looking at this".
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const config = useMobileConfig();

  const authStatus = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const restore = useAuthStore((s) => s.restore);

  const locale = useLocaleStore((s) => s.locale);
  const localeHydrated = useLocaleStore((s) => s.hydrated);
  const hydrateLocale = useLocaleStore((s) => s.hydrate);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const seenHydrated = useSeenWelcome((s) => s.hydrated);
  const hydrateSeenWelcome = useSeenWelcome((s) => s.hydrate);

  const lockHydrated = useAppLockStore((s) => s.hydrated);
  const hydrateAppLock = useAppLockStore((s) => s.hydrate);

  // Skipped-version memory for the OPTIONAL update prompt. Deliberately NOT in
  // the splash condition below: the prompt is non-blocking, so holding boot for
  // it would trade a real cost (a slower cold start for everyone) against none.
  // Until it hydrates the decider simply answers "do not prompt".
  const updateHydrated = useUpdatePrompt((s) => s.hydrated);
  const dismissedVersion = useUpdatePrompt((s) => s.dismissedVersion);
  const hydrateUpdatePrompt = useUpdatePrompt((s) => s.hydrate);
  const dismissUpdate = useUpdatePrompt((s) => s.dismiss);

  // Boot: restore the session + persisted locale + welcome-once/app-lock
  // flags, and set the push display policy (foreground pushes stay silent —
  // the Realtime inbox refresh covers foreground; no registration here).
  useEffect(() => {
    void hydrateLocale();
    void hydrateSeenWelcome();
    void hydrateAppLock();
    void hydrateUpdatePrompt();
    void restore();
    void initPushDisplay();
  }, [hydrateLocale, hydrateSeenWelcome, hydrateAppLock, hydrateUpdatePrompt, restore]);

  // Android notification channels (processor sends channelId = category);
  // re-running on a locale switch just renames them in the OS settings UI.
  useEffect(() => {
    if (localeHydrated) void ensureAndroidChannels(locale);
  }, [localeHydrated, locale]);

  // Foreground: refresh config + session state (maintenance/force-update can
  // interrupt a running session; staleTime keeps this cheap).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void queryClient.invalidateQueries({ queryKey: ["mobile-config"] });
      }
    });
    return () => sub.remove();
  }, [queryClient]);

  // Clamp the locale to the admin-enabled set whenever config lands.
  useEffect(() => {
    if (!config.data || !localeHydrated) return;
    const clamped = clampLocale(
      locale,
      config.data.locales.supported,
      config.data.locales.default,
    );
    if (clamped !== locale) setLocale(clamped);
  }, [config.data, locale, localeHydrated, setLocale]);

  // Deep links: initial + subsequent URLs run through the allowlist router.
  // Auth-required links while signed out are DEFERRED and replayed on login.
  const url = ExpoLinking.useLinkingURL();
  const handledUrl = useRef<string | null>(null);
  const booted =
    localeHydrated && authStatus !== "restoring" && (config.data !== undefined || config.isError);
  useEffect(() => {
    if (!booted || !url || handledUrl.current === url) return;
    handledUrl.current = url;
    const { path } = ExpoLinking.parse(url);
    if (!path) return;
    const authedRole = authStatus === "signedIn" && (role === "parent" || role === "student") ? role : null;
    const resolved = resolveDeepLink(`/${path.replace(/^\/+/, "")}`, authedRole);
    if (!resolved) return;
    if (resolved.kind === "open") {
      // openTarget(), not push(): a tab target pushed onto a group stack that is
      // already showing a secondary screen mounts a SECOND tab navigator, and
      // back then lands on Home instead of that screen (lib/navigation.ts).
      // `pathname` is what lets it skip a link for the screen already on top,
      // which push() answered with an identical copy and a dead back press.
      openTarget(router, resolved.target, pathname);
    } else if (resolved.kind === "deferred") {
      storePendingLink(resolved.path, resolved.audience);
      // popToOrReplace(), not push(): the link may well have arrived WHILE the
      // user is looking at Login (it is the screen a signed-out session lands
      // on), and pushing it again left `[…, login, login]` — the same screen
      // re-rendered, under a back arrow that only pops the copy. POP_TO finds
      // the Login already in the stack and stays on it; when there is none it
      // replaces, which is how the welcome screen already exits.
      popToOrReplace(router, "/(public)/login" as never);
    }
    // "mismatch": the link belongs to the other role — stay on the own home.
  }, [booted, url, authStatus, role, router, pathname]);

  // Replay a deferred link right after sign-in resolves the matching role.
  useEffect(() => {
    if (authStatus !== "signedIn" || (role !== "parent" && role !== "student")) return;
    const target = consumePendingLink(role);
    if (target) openTarget(router, target, pathname);
  }, [authStatus, role, router, pathname]);

  // Push: register behind signed-in + role + notifications_push flag (flag
  // OFF = zero registration calls); notification taps route action_url
  // through the same allowlist as URL deep links.
  usePushRegistration();
  usePushTapRouting(booted);

  // Biometric app-lock lifecycle (cold-start / long-background relock).
  useAppLock();

  // ---- gates, in priority order ----

  if (!localeHydrated || !seenHydrated || !lockHydrated || authStatus === "restoring") {
    return <SplashView />;
  }

  if (!isSupabaseConfigured) {
    return <BootErrorView onRetry={() => void config.refetch()} />;
  }
  if (config.isPending) return <SplashView />;
  if (config.isError && !config.data) {
    return <BootErrorView onRetry={() => void config.refetch()} />;
  }

  const cfg = config.data;
  const gate = cfg ? evaluateVersionGate(cfg, PLATFORM, APP_VERSION) : null;
  if (gate?.forceUpdate) {
    return <ForceUpdateScreen message={gate.message} storeUrl={gate.storeUrl} locale={locale} />;
  }
  if (cfg?.maintenance.on) {
    return <MaintenanceScreen message={cfg.maintenance.message} locale={locale} />;
  }

  // The OPTIONAL update is decided here but rendered BELOW, with the Stack —
  // never `return`ed in its place. Returning would unmount navigation and
  // disable Android back, i.e. make a suggestion behave exactly like the
  // mandatory gate two lines above. No config (`gate === null`, a failed fetch
  // with no cache) means no prompt, like every other unknown here.
  const optionalUpdate =
    cfg &&
    gate &&
    shouldPromptOptionalUpdate({
      hydrated: updateHydrated,
      forceUpdate: gate.forceUpdate,
      updateAvailable: gate.updateAvailable,
      latestVersion: cfg.version[PLATFORM].latest,
      storeUrl: gate.storeUrl,
      dismissedVersion,
    })
      ? { latest: cfg.version[PLATFORM].latest, storeUrl: gate.storeUrl }
      : null;

  // The lock overlay sits ON TOP of the navigator — the Stack never unmounts,
  // so navigation state survives a lock/unlock cycle. The update card is
  // painted BEFORE the lock so a locked app never shows an update prompt over
  // its own lock screen.
  //
  // The two authenticated groups are the ONLY root screens declared here, and
  // only so GROUP_ENTRY_PARAMS can be seeded onto them — every other root route
  // (index, (public), gallery) is still picked up from the file system and
  // keeps its options, because expo-router appends whatever a layout did not
  // list. Read THE CROSS-GROUP HALF in lib/navigation.ts for why the seed
  // exists: `pop` is what makes the nested NAVIGATE that React Navigation
  // derives from these routes' params POP BACK to the mounted `(tabs)` instead
  // of pushing a second copy of the whole tab navigator, when a deep link or a
  // notification jumps to a tab while a `(public)` screen sits over the group.
  // Without it, back lands on the secondary screen the user had already left.
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(parent)" initialParams={GROUP_ENTRY_PARAMS} />
        <Stack.Screen name="(student)" initialParams={GROUP_ENTRY_PARAMS} />
      </Stack>
      {optionalUpdate ? (
        <UpdateAvailableOverlay
          storeUrl={optionalUpdate.storeUrl}
          onLater={() => dismissUpdate(optionalUpdate.latest)}
        />
      ) : null}
      <LockOverlay />
    </View>
  );
}
