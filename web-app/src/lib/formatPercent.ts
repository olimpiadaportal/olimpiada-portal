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

export function formatPercent(value: number | null | undefined, locale: Locale): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe)}%`;
}
