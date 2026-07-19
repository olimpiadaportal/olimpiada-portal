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
  },
  en: {
    "accounts.avatar.boy": "Boy",
    "accounts.avatar.girl": "Girl",
    "accounts.avatar.photo": "Photo set",
  },
  ru: {
    "accounts.avatar.boy": "Мальчик",
    "accounts.avatar.girl": "Девочка",
    "accounts.avatar.photo": "Своё фото",
  },
};

// Standalone lookup (az fallback, then the key itself) — same contract as the
// other labels.ts files.
export function localStrings(locale: Locale): (key: string) => string {
  const dict = STRINGS[locale] ?? STRINGS.az;
  const fallback = STRINGS.az;
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
