// Shared percentage formatter (Round 36): leaderboard values are UNROUNDED
// 0..100 percentages and must render with exactly TWO decimals and the
// locale's decimal separator (87.35% in en, 87,35% in az/ru) — never
// Math.round into an integer, never re-derive rank from the rounded value.
//
// Locale tags (Round 51 audit): a bare "az"/"ru" tag is the same root-locale
// trap src/lib/formatDate.ts documents — a runtime without that locale's data
// resolves it to CLDR root. Full BCP-47 tags (mirroring formatDate's
// INTL_TAGS) resolve correctly wherever the data exists; if the runtime
// rejects the tag outright, fall back to en-GB rather than throwing.
const INTL_TAGS: Record<string, string> = {
  az: "az-Latn-AZ",
  en: "en-GB",
  ru: "ru-RU",
};

const FRACTION = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

const formatters = new Map<string, Intl.NumberFormat>();

export function formatPercent(value: number, locale: string): string {
  let fmt = formatters.get(locale);
  if (!fmt) {
    const tag = INTL_TAGS[locale] ?? INTL_TAGS.en;
    try {
      fmt = new Intl.NumberFormat(tag, FRACTION);
    } catch {
      fmt = new Intl.NumberFormat(INTL_TAGS.en, FRACTION);
    }
    formatters.set(locale, fmt);
  }
  return `${fmt.format(Number.isFinite(value) ? value : 0)}%`;
}
