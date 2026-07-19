import { requireAdmin } from "@/lib/admin/guards";
import { getAdminInboxSnapshot } from "@/lib/admin/notif-inbox";
import { PAGE_LIMIT } from "@/lib/admin/notif-types";
import { getLocale } from "@/i18n/server";
import { localStrings } from "./labels";
import { AlertsList } from "./AlertsList";

// Full received-alerts page (Administrator's own notification inbox) — the
// bell dropdown's "see all" target. Only administrators receive these
// operational events today (admin_new_parent/admin_new_purchase/
// admin_new_subscription are addressed to administrator profiles only), so
// this stays admin-only like the other operations-group pages.
export default async function AlertsPage() {
  await requireAdmin();
  const locale = await getLocale();
  const lt = localStrings(locale);
  const { items, unread } = await getAdminInboxSnapshot(PAGE_LIMIT);

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
      />
    </div>
  );
}
