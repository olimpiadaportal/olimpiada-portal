// The root state machine (master plan §3), evaluated at boot and on config /
// auth / deep-link changes, in strict priority order:
//   1. force-update  2. maintenance  3. no session -> public stack
//   4/5. role tabs   6. unknown role -> retry + logout escape
// Renders the router Stack only once every gate has passed.
import React, { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
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
import { clampLocale, useLocaleStore } from "@/i18n";
import { useAuthStore } from "@/features/auth/authStore";
import {
  BootErrorView,
  ForceUpdateScreen,
  MaintenanceScreen,
  SplashView,
} from "./screens";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const PLATFORM: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";

export function RootGate() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const config = useMobileConfig();

  const authStatus = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const restore = useAuthStore((s) => s.restore);

  const locale = useLocaleStore((s) => s.locale);
  const localeHydrated = useLocaleStore((s) => s.hydrated);
  const hydrateLocale = useLocaleStore((s) => s.hydrate);
  const setLocale = useLocaleStore((s) => s.setLocale);

  // Boot: restore the session + persisted locale once.
  useEffect(() => {
    void hydrateLocale();
    void restore();
  }, [hydrateLocale, restore]);

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
      router.push(resolved.target as never);
    } else if (resolved.kind === "deferred") {
      storePendingLink(resolved.path, resolved.audience);
      router.push("/(public)/login" as never);
    }
    // "mismatch": the link belongs to the other role — stay on the own home.
  }, [booted, url, authStatus, role, router]);

  // Replay a deferred link right after sign-in resolves the matching role.
  useEffect(() => {
    if (authStatus !== "signedIn" || (role !== "parent" && role !== "student")) return;
    const target = consumePendingLink(role);
    if (target) router.push(target as never);
  }, [authStatus, role, router]);

  // ---- gates, in priority order ----

  if (!localeHydrated || authStatus === "restoring") return <SplashView />;

  if (!isSupabaseConfigured) {
    return <BootErrorView onRetry={() => void config.refetch()} />;
  }
  if (config.isPending) return <SplashView />;
  if (config.isError && !config.data) {
    return <BootErrorView onRetry={() => void config.refetch()} />;
  }

  const cfg = config.data;
  if (cfg) {
    const gate = evaluateVersionGate(cfg, PLATFORM, APP_VERSION);
    if (gate.forceUpdate) {
      return (
        <ForceUpdateScreen message={gate.message} storeUrl={gate.storeUrl} locale={locale} />
      );
    }
    if (cfg.maintenance.on) {
      return <MaintenanceScreen message={cfg.maintenance.message} locale={locale} />;
    }
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
