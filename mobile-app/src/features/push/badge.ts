// Safe app-icon badge setter. Every call is wrapped: off-device, web export
// and launchers without badge support all no-op instead of throwing. Deduped
// module-side because useNotifications() has several simultaneous consumers
// reporting the same unread count.
import * as Notifications from "expo-notifications";

let lastBadge: number | null = null;

export async function setAppBadge(count: number): Promise<void> {
  const next = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (next === lastBadge) return;
  try {
    await Notifications.setBadgeCountAsync(next);
    lastBadge = next;
  } catch {
    // badge is cosmetic — never surface a failure
  }
}
