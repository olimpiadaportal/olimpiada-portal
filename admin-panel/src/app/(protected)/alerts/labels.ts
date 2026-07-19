import type { Locale } from "@/i18n/config";

// Local trilingual strings for the admin notification BELL (topbar dropdown)
// and the full /alerts page — not yet in the shared dictionary
// (admin-panel/src/i18n/messages.ts). Mirrors the settings/locations/pricing
// labels.ts pattern; these should be migrated into messages.ts by the agent
// that owns admin message additions (reported in followups).
//
// Distinct from ntfadmin.* (the /notifications BROADCAST COMPOSER strings,
// admin-panel/src/app/(protected)/notifications/labels.ts) — "alerts.*" is the
// admin's own RECEIVED inbox: notifications sent to administrators/content
// managers from the composer, plus "your olympiad package is live" notices.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "nav.alerts": "Bildirişlərim",
    "alerts.bell": "Bildirişlər",
    "alerts.markAllRead": "Hamısını oxunmuş et",
    "alerts.seeAll": "Hamısına bax",
    "alerts.empty": "Bildiriş yoxdur",
    "alerts.emptyHint": "Sizə göndərilən bildirişlər (məs. dərc olunan olimpiada paketləri) burada görünəcək.",
    "alerts.timeNow": "indi",
    "alerts.timeMin": "dəq əvvəl",
    "alerts.timeHour": "saat əvvəl",
    "alerts.timeDay": "gün əvvəl",
    "alerts.pageTitle": "Bildirişlərim",
    "alerts.pageSubtitle":
      "Sizə ünvanlanmış bildirişlər — bildiriş mərkəzindən göndərilənlər və dərc olunan olimpiada paketləriniz.",
    "alerts.markRead": "Oxundu et",
    "alerts.delete": "Sil",
    "alerts.unreadCount": "{n} oxunmamış",
    "alerts.type.admin_new_parent": "Yeni valideyn",
    "alerts.type.admin_new_purchase": "Yeni satış",
    "alerts.type.admin_new_subscription": "Yeni abunəlik",
    "alerts.type.olympiad_package_published": "Paket dərc edildi",
    "alerts.type.default": "Bildiriş",
  },
  en: {
    "nav.alerts": "My Alerts",
    "alerts.bell": "Notifications",
    "alerts.markAllRead": "Mark all read",
    "alerts.seeAll": "See all",
    "alerts.empty": "No notifications",
    "alerts.emptyHint": "Notifications sent to you (e.g. your published olympiad packages) will appear here.",
    "alerts.timeNow": "just now",
    "alerts.timeMin": "min ago",
    "alerts.timeHour": "h ago",
    "alerts.timeDay": "d ago",
    "alerts.pageTitle": "My Alerts",
    "alerts.pageSubtitle":
      "Notifications addressed to you — sends from the notification center, plus your published olympiad packages.",
    "alerts.markRead": "Mark read",
    "alerts.delete": "Delete",
    "alerts.unreadCount": "{n} unread",
    "alerts.type.admin_new_parent": "New parent",
    "alerts.type.admin_new_purchase": "New sale",
    "alerts.type.admin_new_subscription": "New subscription",
    "alerts.type.olympiad_package_published": "Package published",
    "alerts.type.default": "Notification",
  },
  ru: {
    "nav.alerts": "Мои уведомления",
    "alerts.bell": "Уведомления",
    "alerts.markAllRead": "Отметить все как прочитанные",
    "alerts.seeAll": "Смотреть все",
    "alerts.empty": "Уведомлений нет",
    "alerts.emptyHint": "Здесь появятся адресованные вам уведомления (например, о публикации ваших олимпиадных пакетов).",
    "alerts.timeNow": "только что",
    "alerts.timeMin": "мин назад",
    "alerts.timeHour": "ч назад",
    "alerts.timeDay": "дн назад",
    "alerts.pageTitle": "Мои уведомления",
    "alerts.pageSubtitle":
      "Уведомления, адресованные вам — рассылки из центра уведомлений и публикация ваших олимпиадных пакетов.",
    "alerts.markRead": "Отметить прочитанным",
    "alerts.delete": "Удалить",
    "alerts.unreadCount": "Непрочитано: {n}",
    "alerts.type.admin_new_parent": "Новый родитель",
    "alerts.type.admin_new_purchase": "Новая продажа",
    "alerts.type.admin_new_subscription": "Новая подписка",
    "alerts.type.olympiad_package_published": "Пакет опубликован",
    "alerts.type.default": "Уведомление",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
