import type { Locale } from "@/i18n/config";

// Local trilingual strings for the Accounts page's child-avatar column that
// are NOT yet in the shared dictionary (admin-panel/src/i18n/messages.ts).
// Mirrors the established labels.ts pattern (cities/settings/olympiad); these
// should be migrated into messages.ts by the agent that owns admin message
// additions (reported in followups).
//
// Avatar display is READ-ONLY here: preset avatars render the shared boy/girl
// art (public/avatars, same files as the web-app); a custom photo (PRIVATE
// child-avatars bucket) renders as a plain indicator — the panel deliberately
// does not fetch the private object.

type Dict = Record<string, string>;

const STRINGS: Record<Locale, Dict> = {
  az: {
    "accounts.avatar.boy": "Oğlan",
    "accounts.avatar.girl": "Qız",
    "accounts.avatar.photo": "Öz şəkli",
    "accounts.access.manage": "Ortaq giriş",
    "accounts.access.title": "Uşağın ortaq girişi",
    "accounts.access.owner": "Hesab sahibi",
    "accounts.access.none": "Başqa valideyn qoşulmayıb.",
    "accounts.access.remove": "Girişi ləğv et",
    "accounts.access.back": "Hesablara qayıt",
    "accounts.access.saved": "Ortaq giriş ləğv edildi.",
    "accounts.access.error": "Ortaq girişi ləğv etmək mümkün olmadı.",
  },
  en: {
    "accounts.avatar.boy": "Boy",
    "accounts.avatar.girl": "Girl",
    "accounts.avatar.photo": "Photo set",
    "accounts.access.manage": "Shared access",
    "accounts.access.title": "Shared child access",
    "accounts.access.owner": "Account owner",
    "accounts.access.none": "No other parent is linked.",
    "accounts.access.remove": "Remove access",
    "accounts.access.back": "Back to accounts",
    "accounts.access.saved": "Shared access was removed.",
    "accounts.access.error": "Shared access could not be removed.",
  },
  ru: {
    "accounts.avatar.boy": "Мальчик",
    "accounts.avatar.girl": "Девочка",
    "accounts.avatar.photo": "Своё фото",
    "accounts.access.manage": "Общий доступ",
    "accounts.access.title": "Общий доступ к ребёнку",
    "accounts.access.owner": "Владелец аккаунта",
    "accounts.access.none": "Другие родители не подключены.",
    "accounts.access.remove": "Закрыть доступ",
    "accounts.access.back": "Назад к аккаунтам",
    "accounts.access.saved": "Общий доступ закрыт.",
    "accounts.access.error": "Не удалось закрыть общий доступ.",
  },
};

// Standalone lookup (az fallback, then the key itself) — same contract as the
// other labels.ts files.
export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
