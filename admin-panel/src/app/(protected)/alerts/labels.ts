import type { Locale } from "@/i18n/config";

// Local trilingual strings for the admin notification BELL (topbar dropdown)
// and the full /alerts page — not yet in the shared dictionary
// (admin-panel/src/i18n/messages.ts). Mirrors the settings/locations/pricing
// labels.ts pattern; these should be migrated into messages.ts by the agent
// that owns admin message additions (reported in followups).
//
// Distinct from ntfadmin.* (the /notifications BROADCAST COMPOSER strings,
// admin-panel/src/app/(protected)/notifications/labels.ts) — "alerts.*" is the
// admin's own RECEIVED inbox of operational events.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "nav.alerts": "Bildirişlərim",
    "alerts.bell": "Bildirişlər",
    "alerts.markAllRead": "Hamısını oxunmuş et",
    "alerts.seeAll": "Hamısına bax",
    "alerts.empty": "Bildiriş yoxdur",
    "alerts.emptyHint": "Yeni əməliyyatlar (qeydiyyat, satış, abunəlik) burada görünəcək.",
    "alerts.timeNow": "indi",
    "alerts.timeMin": "dəq əvvəl",
    "alerts.timeHour": "saat əvvəl",
    "alerts.timeDay": "gün əvvəl",
    "alerts.pageTitle": "Bildirişlərim",
    "alerts.pageSubtitle":
      "Platformadakı yeni əməliyyatlar (valideyn qeydiyyatı, olimpiada satışı, abunəlik) barədə bildirişlər.",
    "alerts.markRead": "Oxundu et",
    "alerts.delete": "Sil",
    "alerts.unreadCount": "{n} oxunmamış",
    "alerts.type.admin_new_parent": "Yeni valideyn",
    "alerts.type.admin_new_purchase": "Yeni satış",
    "alerts.type.admin_new_subscription": "Yeni abunəlik",
    "alerts.type.default": "Bildiriş",
  },
  en: {
    "nav.alerts": "My Alerts",
    "alerts.bell": "Notifications",
    "alerts.markAllRead": "Mark all read",
    "alerts.seeAll": "See all",
    "alerts.empty": "No notifications",
    "alerts.emptyHint": "New operational events (registrations, sales, subscriptions) will appear here.",
    "alerts.timeNow": "just now",
    "alerts.timeMin": "min ago",
    "alerts.timeHour": "h ago",
    "alerts.timeDay": "d ago",
    "alerts.pageTitle": "My Alerts",
    "alerts.pageSubtitle":
      "Notifications about new operational events on the platform (parent registrations, olympiad sales, subscriptions).",
    "alerts.markRead": "Mark read",
    "alerts.delete": "Delete",
    "alerts.unreadCount": "{n} unread",
    "alerts.type.admin_new_parent": "New parent",
    "alerts.type.admin_new_purchase": "New sale",
    "alerts.type.admin_new_subscription": "New subscription",
    "alerts.type.default": "Notification",
  },
  ru: {
    "nav.alerts": "Мои уведомления",
    "alerts.bell": "Уведомления",
    "alerts.markAllRead": "Отметить все как прочитанные",
    "alerts.seeAll": "Смотреть все",
    "alerts.empty": "Уведомлений нет",
    "alerts.emptyHint": "Здесь появятся новые операционные события (регистрации, продажи, подписки).",
    "alerts.timeNow": "только что",
    "alerts.timeMin": "мин назад",
    "alerts.timeHour": "ч назад",
    "alerts.timeDay": "дн назад",
    "alerts.pageTitle": "Мои уведомления",
    "alerts.pageSubtitle":
      "Уведомления о новых операционных событиях на платформе (регистрации родителей, продажи олимпиад, подписки).",
    "alerts.markRead": "Отметить прочитанным",
    "alerts.delete": "Удалить",
    "alerts.unreadCount": "Непрочитано: {n}",
    "alerts.type.admin_new_parent": "Новый родитель",
    "alerts.type.admin_new_purchase": "Новая продажа",
    "alerts.type.admin_new_subscription": "Новая подписка",
    "alerts.type.default": "Уведомление",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
