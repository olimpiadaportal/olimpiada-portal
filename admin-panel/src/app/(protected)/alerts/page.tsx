import { requirePanelAccess } from "@/lib/admin/guards";
import { getAdminInboxSnapshot } from "@/lib/admin/notif-inbox";
import { PAGE_LIMIT } from "@/lib/admin/notif-types";
import { getLocale } from "@/i18n/server";
import { localStrings } from "./labels";
import { AlertsList } from "./AlertsList";

// The signed-in panel user's OWN received-notification inbox — the bell
// dropdown's "see all" target. Open to any panel user (requirePanelAccess),
// NOT admin-only: content managers legitimately receive staff sends + their
// package-published alerts, and this page shows only the caller's own rows
// (self-scoped RLS + the explicit recipient filter), so there is nothing
// admin-private here.
export default async function AlertsPage() {
  const ctx = await requirePanelAccess();
  const locale = await getLocale();
  const lt = localStrings(locale);
  const { items, unread } = await getAdminInboxSnapshot(PAGE_LIMIT, ctx.profileId);

  const stringKeys = [
    "alerts.bell",
    "alerts.markAllRead",
    "alerts.seeAll",
    "alerts.empty",
    "alerts.emptyHint",
    "alerts.markRead",
    "alerts.delete",
    "alerts.unreadCount",
    "alerts.type.admin_new_parent",
    "alerts.type.admin_new_purchase",
    "alerts.type.admin_new_subscription",
    "alerts.type.olympiad_package_published",
    "alerts.type.default",
  ] as const;
  const strings: Record<string, string> = {};
  for (const k of stringKeys) strings[k] = lt(k);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{lt("alerts.pageTitle")}</h1>
        <p className="muted">{lt("alerts.pageSubtitle")}</p>
      </div>
      <AlertsList
        initialItems={items}
        initialUnread={unread}
        locale={locale}
        strings={strings}
        profileId={ctx.profileId}
      />
    </div>
  );
}
