// Leaderboard percentage display (spec 17.10): the RPC value is an UNROUNDED
// weighted percentage — render it with exactly TWO decimals and the locale's
// decimal separator (e.g. en "87.35%", az/ru "87,35%"). Never round it into an
// integer and never re-derive rank from the formatted value.
export function formatPercent(value: number, locale: string): string {
  return (
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) + "%"
  );
}
