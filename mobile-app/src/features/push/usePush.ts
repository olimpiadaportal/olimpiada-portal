// Push hooks mounted once from RootGate. Registration is triple-gated:
// signed-in session + resolved role + the admin notifications_push flag —
// flag OFF means ZERO registration calls (and therefore zero prompts).
// Tap payloads route their action_url through the SAME allowlist as every
// other deep link: payloads are display data, never authorization.
import { useCallback, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { usePathname, useRouter } from "expo-router";
import { useMobileConfig } from "@/lib/configQueries";
import { isSafeRelativeUrl, resolveDeepLink, storePendingLink } from "@/lib/deeplink";
import { openTarget } from "@/lib/navigation";
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
  // Read through a ref: handleTap must NOT change identity when the user
  // navigates, or the effect below would tear down and re-attach the
  // notification-response listener on every screen change.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

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
        // openTarget(), not push(): most action_urls resolve to a TAB, and a
        // tap arriving while a secondary screen is open would otherwise stack
        // a second tab navigator whose back press goes Home (lib/navigation.ts).
        openTarget(router, resolved.target, pathnameRef.current);
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
