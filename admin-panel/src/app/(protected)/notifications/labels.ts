import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Notifications composer's two NEW audiences
// (all_users / olympiad_buyers) and the olympiad-package picker — not yet in
// the shared dictionary (admin-panel/src/i18n/messages.ts). Mirrors the
// cities/districts labels.ts pattern; these should be migrated into
// messages.ts by the agent that owns admin message additions (reported in
// followups).

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "ntfadmin.audience.all_users": "Bütün istifadəçilər",
    "ntfadmin.audience.olympiad_buyers": "Olimpiada paketlərini alanlar",
    "ntfadmin.pkg.label": "Olimpiada paketləri",
    "ntfadmin.pkg.search": "Paket axtar…",
    "ntfadmin.pkg.empty": "Aktiv olimpiada paketi tapılmadı.",
    "ntfadmin.pkg.noMatch": "Axtarışa uyğun paket yoxdur.",
    "ntfadmin.pkg.chosen": "{n} paket seçilib",
    "ntfadmin.pkg.selectAll": "Hamısını seç",
    "ntfadmin.pkg.clear": "Hamısını təmizlə",
    "ntfadmin.pkg.remove": "Paketi çıxar",
    "ntfadmin.pkg.hint":
      "Ən azı bir aktiv paket seçin. Bildirişi alıcı valideynlər və onların uşaqları alacaq.",
    "ntfadmin.zeroRecipients":
      "Diqqət: bu seçimə uyğun heç bir alıcı yoxdur — bildiriş heç kimə çatmayacaq.",
    "ntfadmin.err.packages":
      "Ən azı bir aktiv olimpiada paketi seçilməlidir.",
    "ntfadmin.history.packagesLabel": "Seçilmiş paketlər",
  },
  en: {
    "ntfadmin.audience.all_users": "All users",
    "ntfadmin.audience.olympiad_buyers": "Olympiad package buyers",
    "ntfadmin.pkg.label": "Olympiad packages",
    "ntfadmin.pkg.search": "Search packages…",
    "ntfadmin.pkg.empty": "No active olympiad packages found.",
    "ntfadmin.pkg.noMatch": "No packages match your search.",
    "ntfadmin.pkg.chosen": "{n} package(s) selected",
    "ntfadmin.pkg.selectAll": "Select all",
    "ntfadmin.pkg.clear": "Clear all",
    "ntfadmin.pkg.remove": "Remove package",
    "ntfadmin.pkg.hint":
      "Pick at least one active package. Purchasing parents and their children will be notified.",
    "ntfadmin.zeroRecipients":
      "Warning: no recipients match this selection — the notification would reach no one.",
    "ntfadmin.err.packages":
      "At least one active olympiad package must be selected.",
    "ntfadmin.history.packagesLabel": "Selected packages",
  },
  ru: {
    "ntfadmin.audience.all_users": "Все пользователи",
    "ntfadmin.audience.olympiad_buyers": "Купившие олимпиадные пакеты",
    "ntfadmin.pkg.label": "Олимпиадные пакеты",
    "ntfadmin.pkg.search": "Поиск пакетов…",
    "ntfadmin.pkg.empty": "Активные олимпиадные пакеты не найдены.",
    "ntfadmin.pkg.noMatch": "Нет пакетов, соответствующих поиску.",
    "ntfadmin.pkg.chosen": "Выбрано пакетов: {n}",
    "ntfadmin.pkg.selectAll": "Выбрать все",
    "ntfadmin.pkg.clear": "Очистить все",
    "ntfadmin.pkg.remove": "Убрать пакет",
    "ntfadmin.pkg.hint":
      "Выберите хотя бы один активный пакет. Уведомление получат купившие родители и их дети.",
    "ntfadmin.zeroRecipients":
      "Внимание: получателей по этому выбору нет — уведомление никому не придёт.",
    "ntfadmin.err.packages":
      "Нужно выбрать хотя бы один активный олимпиадный пакет.",
    "ntfadmin.history.packagesLabel": "Выбранные пакеты",
  },
};

export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
