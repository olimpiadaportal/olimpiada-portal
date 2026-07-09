import { redirect } from "next/navigation";
import { requireChild } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { getInboxSnapshot } from "@/lib/notifications/inbox";
import { NOTIF_KEYS, PAGE_LIMIT } from "@/lib/notifications/types";
import { NotificationsPanel } from "@/components/NotificationsPanel";

// Full notification center for the child (arena). The child only READS the
// inbox — preferences are managed by the parent. Gated by the `notifications`
// feature flag (bounce to the arena home when off).
export default async function ChildNotificationsPage() {
  const child = await requireChild();
  if (!(await isFeatureEnabled("notifications"))) redirect("/child");

  const t = await getT();
  const { items, unread } = await getInboxSnapshot(PAGE_LIMIT);

  const dict: Record<string, string> = {};
  for (const k of NOTIF_KEYS) dict[k] = t(k);

  return (
    <NotificationsPanel
      me={child.profileId}
      initialItems={items}
      initialUnread={unread}
      strings={dict}
    />
  );
}
