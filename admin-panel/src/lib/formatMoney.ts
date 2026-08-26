// Money, formatted once, in one place.
//
// Four inline copies of this had already drifted across the panel and disagreed
// about the two cases that matter: whether a NULL amount and a ZERO amount look
// the same. They must not — "—" means we hold no figure, "0.00 AZN" means we
// hold a figure and it is zero, and a comped grant is the second, not the first.
//
// Beside formatPercent.ts, and the same shape: Intl when it is available, a
// deterministic fallback when it is not.
import type { Locale } from "@/i18n/config";

/**
 * `null`/`undefined`/non-finite → an em dash. A zero → "0.00 AZN".
 *
 * The currency is whatever the row stored, never assumed to be AZN: a row that
 * somehow carries another currency must display as that currency rather than be
 * silently relabelled.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
  locale: Locale,
): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const code = (currency ?? "AZN").toUpperCase();

  try {
    // Deliberately NOT style:"currency": Intl renders AZN as "₼" in some
    // locales, and CLAUDE.md forbids the manat sign reaching store-adjacent
    // surfaces. The code is unambiguous everywhere and screenshots safely.
    const digits = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
    return `${digits} ${code}`;
  } catch {
    return `${n.toFixed(2)} ${code}`;
  }
}
