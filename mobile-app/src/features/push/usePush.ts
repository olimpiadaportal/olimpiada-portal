// Push hooks mounted once from RootGate. Registration is triple-gated:
// signed-in session + resolved role + the admin notifications_push flag —
// flag OFF means ZERO registration calls (and therefore zero prompts).
// Tap payloads route their action_url through the SAME allowlist as every
// other deep link: payloads are display data, never authorization.
import { useCallback, useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useMobileConfig } from "@/lib/configQueries";
import { isSafeRelativeUrl, resolveDeepLink, storePendingLink } from "@/lib/deeplink";
import { useAuthStore } from "@/features/auth/authStore";
import { registerForPush } from "./registration";

export function usePushRegistration(): void {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const config = useMobileConfig();
  const flagOn = config.data?.flags.notificationsPush === true;

  useEffect(() => {
    if (!flagOn || status !== "signedIn" || (role !== "parent" && role !== "student")) return;
    void registerForPush();
  }, [flagOn, status, role]);
}

/** Pull the relative action_url out of a push response's data payload. */
export function actionUrlFromResponse(resp: Notifications.NotificationResponse): string | null {
  const data: unknown = resp.notification?.request?.content?.data;
  if (!data || typeof data !== "object") return null;
  const url = (data as Record<string, unknown>).action_url;
  return typeof url === "string" ? url : null;
}

// A cold-start tap must be handled exactly once per process — module flag so
// RootGate remounts (theme/gate churn) never replay it.
let handledColdStartTap = false;

export function usePushTapRouting(ready: boolean): void {
  const router = useRouter();

  const handleTap = useCallback(
    (rawUrl: string | null) => {
      if (!rawUrl || !isSafeRelativeUrl(rawUrl)) return;
      // Read auth fresh: the listener closure outlives login/logout.
      const auth = useAuthStore.getState();
      const role =
        auth.status === "signedIn" && (auth.role === "parent" || auth.role === "student")
          ? auth.role
          : null;
      const resolved = resolveDeepLink(rawUrl, role);
      if (!resolved) return;
      if (resolved.kind === "open") {
        router.push(resolved.target as never);
      } else if (resolved.kind === "deferred") {
        // Existing replay-after-login mechanism (RootGate consumes it).
        storePendingLink(resolved.path, resolved.audience);
      }
      // "mismatch": the payload targets the other role — ignore.
    },
    [router],
  );

  useEffect(() => {
    if (!ready) return;
    if (!handledColdStartTap) {
      handledColdStartTap = true;
      // The tap may have LAUNCHED the app before any listener attached.
      Notifications.getLastNotificationResponseAsync()
        .then((resp) => {
          if (resp) handleTap(actionUrlFromResponse(resp));
        })
        .catch(() => {});
    }
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      handleTap(actionUrlFromResponse(resp));
    });
    return () => sub.remove();
  }, [ready, handleTap]);
}
