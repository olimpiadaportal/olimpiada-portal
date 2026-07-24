// Shared percentage formatter (Round 36): leaderboard values are UNROUNDED
// 0..100 percentages and must render with exactly TWO decimals and the
// locale's decimal separator (87.35% in en, 87,35% in az/ru) — never
// Math.round into an integer, never re-derive rank from the rounded value.
const formatters = new Map<string, Intl.NumberFormat>();

export function formatPercent(value: number, locale: string): string {
  let fmt = formatters.get(locale);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(locale, fmt);
  }
  return `${fmt.format(Number.isFinite(value) ? value : 0)}%`;
}
