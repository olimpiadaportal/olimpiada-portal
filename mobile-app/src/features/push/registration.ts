// Push token lifecycle (master plan §10 + docs/NOTIFICATIONS_MOBILE_CONTRACT.md).
// Registration runs ONLY behind the notifications_push flag (the hook gates it);
// every native call is wrapped so a push failure can never crash the app.
// Writes go through the SECURITY DEFINER upsert_push_token RPC (RLS allows the
// client only SELECT/DELETE on own rows); payloads stay display data — the
// token is the single credential-adjacent value and lives in SecureStore.
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { supabase } from "@/lib/supabase";
import { createT, type Locale } from "@/i18n";
import { PUSH_CHANNELS } from "./channels";
import { setAppBadge } from "./badge";

const TOKEN_KEY = "olympiq.pushToken";

// Module state: the token registered in THIS process + a re-entrancy guard.
let registeredToken: string | null = null;
let registering = false;
let tokenListenerAttached = false;

function devLog(msg: string): void {
  if (__DEV__) console.log(`[push] ${msg}`);
}

/**
 * Foreground display policy + iOS categories. Foreground pushes stay SILENT
 * (no banner/list/sound) — the in-app Realtime toast in useNotifications.ts
 * already covers the foreground case; only the badge is kept in sync.
 */
export async function initPushDisplay(): Promise<void> {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
    if (Platform.OS === "ios") {
      // Matching iOS categories for the engine's category set (no custom
      // actions in v1 — tap = open, routed through the allowlist).
      await Promise.all(
        PUSH_CHANNELS.map((c) => Notifications.setNotificationCategoryAsync(c.id, [])),
      );
    }
  } catch {
    devLog("display init failed (ignored)");
  }
}

/**
 * Android notification channels for the engine's categories (the processor
 * sends channelId = category, "default" otherwise). Re-running on a locale
 * switch only renames — importance is fixed at creation by the OS.
 */
export async function ensureAndroidChannels(locale: Locale): Promise<void> {
  if (Platform.OS !== "android") return;
  const t = createT(locale);
  try {
    await Promise.all(
      PUSH_CHANNELS.map((c) =>
        Notifications.setNotificationChannelAsync(c.id, {
          name: t(c.nameKey),
          importance:
            c.importance === "high"
              ? Notifications.AndroidImportance.HIGH
              : Notifications.AndroidImportance.DEFAULT,
          sound: "default",
          lightColor: "#7c3aed",
        }),
      ),
    );
  } catch {
    devLog("channel setup failed (ignored)");
  }
}

function easProjectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)
    ?.eas?.projectId;
  const id = fromExtra ?? Constants.easConfig?.projectId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Provisional (iOS) counts as granted — quiet delivery is still delivery. */
function isGranted(p: Notifications.NotificationPermissionsStatus): boolean {
  return (
    p.granted ||
    p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    p.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

/**
 * Register this device for push: permission (iOS provisional-first, never
 * re-nag after a denial) → Expo push token → upsert_push_token RPC (upserts
 * by token; reassigns the row to the caller on account switch). Every guard
 * is a graceful silent skip.
 */
export async function registerForPush(): Promise<void> {
  if (registering) return;
  registering = true;
  try {
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      devLog("skip: unsupported platform");
      return;
    }
    if (!Device.isDevice) {
      devLog("skip: not a physical device");
      return;
    }
    // SDK 53+ removed Android remote push from Expo Go — dev-client/EAS only.
    if (
      Platform.OS === "android" &&
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ) {
      devLog("skip: Expo Go on Android has no remote push");
      return;
    }
    const projectId = easProjectId();
    if (!projectId) {
      devLog("skip: no EAS projectId (run `eas init` to enable push)");
      return;
    }

    let perm = await Notifications.getPermissionsAsync();
    if (perm.status === "undetermined") {
      perm = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true, allowProvisional: true },
      });
    }
    if (!isGranted(perm)) {
      devLog("skip: permission not granted");
      return;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return;

    const { error } = await supabase.rpc("upsert_push_token", {
      p_token: token,
      p_platform: Platform.OS,
      // Small, non-PII device info only (contract: {model,…}).
      p_device: {
        model: Device.modelName,
        os: Device.osVersion,
        appVersion: Constants.expoConfig?.version,
      },
    });
    if (error) {
      devLog("skip: upsert_push_token failed");
      return;
    }

    registeredToken = token;
    // Persisted so a post-restart logout can still de-register this device.
    await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {});

    if (!tokenListenerAttached) {
      tokenListenerAttached = true;
      // Native token rotation → mint + upsert a fresh Expo token.
      Notifications.addPushTokenListener(() => {
        void registerForPush();
      });
    }
  } catch {
    devLog("registration failed (ignored)");
  } finally {
    registering = false;
  }
}

/**
 * Best-effort de-registration for logout. MUST run while the session is still
 * valid: the push_tokens DELETE is the caller's own-row RLS policy. Also
 * clears the stored token and the app badge; never throws.
 */
export async function deregisterPushToken(): Promise<void> {
  try {
    const token = registeredToken ?? (await SecureStore.getItemAsync(TOKEN_KEY));
    if (token) {
      await supabase.from("push_tokens").delete().eq("token", token);
    }
  } catch {
    // orphaned rows are invalidated server-side on DeviceNotRegistered
  }
  registeredToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  await setAppBadge(0);
}
