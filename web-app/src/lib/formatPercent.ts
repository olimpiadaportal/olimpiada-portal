// ONE shared percentage formatter for every leaderboard surface (Round 36).
//
// The DB sends the UNROUNDED weighted percentage (0..100, 4 decimals) and its
// rank/order is authoritative — surfaces must never Math.round the value into
// an integer or re-derive ranks from a rounded number. Display is always
// exactly TWO decimals with the locale's decimal separator (az/ru "87,35%",
// en "87.35%").
//
// Pure/iso (no server deps) so both server and client components can share it.
import type { Locale } from "@/i18n/config";

// Round 51 (audit): full BCP-47 tags, never a bare "az"/"ru" — the same
// root-locale fallback that printed "M08" dates makes a limited-ICU engine
// format az/ru numbers with "." instead of ",". Mirrors lib/formatDate.ts.
const INTL_TAGS: Record<Locale, string> = {
  az: "az-Latn-AZ",
  en: "en-GB",
  ru: "ru-RU",
};

export function formatPercent(value: number | null | undefined, locale: Locale): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const tag = INTL_TAGS[locale] ?? INTL_TAGS.en;
  try {
    return `${new Intl.NumberFormat(tag, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe)}%`;
  } catch {
    // Manual fallback with the locale's decimal separator.
    const fixed = safe.toFixed(2);
    return `${locale === "en" ? fixed : fixed.replace(".", ",")}%`;
  }
}
