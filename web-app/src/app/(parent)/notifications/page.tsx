import { redirect } from "next/navigation";
import { requireParent } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { getInboxSnapshot } from "@/lib/notifications/inbox";
import { NOTIF_KEYS, PAGE_LIMIT } from "@/lib/notifications/types";
import { NotificationsPanel } from "@/components/NotificationsPanel";

// Full notification center for the parent. Gated by the `notifications` feature
// flag — when off, the whole surface is hidden (bounce to the dashboard).
export default async function ParentNotificationsPage() {
  const parent = await requireParent();
  if (!(await isFeatureEnabled("notifications"))) redirect("/dashboard");

  const t = await getT();
  const { items, unread } = await getInboxSnapshot(PAGE_LIMIT);

  const dict: Record<string, string> = {};
  for (const k of NOTIF_KEYS) dict[k] = t(k);

  return (
    <NotificationsPanel
      me={parent.profileId}
      initialItems={items}
      initialUnread={unread}
      strings={dict}
    />
  );
}
