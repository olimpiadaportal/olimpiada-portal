// Pure money maths for the store price sync — no I/O, no server-only import,
// so the rules can be unit-tested directly and read by both store clients.
//
// THE SOURCE OF TRUTH IS THE AZN AMOUNT IN subjects_pricing. Owner decision,
// 2026-10-10: "whatever price is set in Admin → Subjects, the mobile apps must
// display that." Both stores are FOLLOWERS of that number; nothing here ever
// reads a store price back into our database.
//
// WHY THE TWO STORES ARE TREATED DIFFERENTLY.
//   * Apple bills the Azerbaijan storefront (territory AZE) in USD and only at
//     fixed price points. So iOS follows the NEAREST point to AZN ÷ rate. It
//     can never be exact, and "in sync" for Apple means "on the nearest point",
//     not "equal to the AZN amount".
//   * Google accepts arbitrary amounts per region. Azerbaijan (AZ) is priced in
//     whatever currency Google uses for that region: the exact AZN amount when
//     that currency is AZN, otherwise AZN ÷ rate rounded to the cent.
//
// THE RATE is system setting `store.fx.azn_per_usd` (AZN per 1 USD). The manat
// has been pegged at 1.70 since 2017, which is the default when the setting is
// absent or malformed.

export const DEFAULT_AZN_PER_USD = 1.7;
export const FX_SETTING_KEY = "store.fx.azn_per_usd";

/**
 * Reads the rate from a system_settings.value_json payload. Accepts a bare
 * number or a numeric string. Anything outside a sane band falls back to the
 * default rather than pricing 21 products off a typo: a rate of 17 would sell
 * a year of access for $4.
 */
export function parseFxRate(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;
  if (!Number.isFinite(n) || n < 0.5 || n > 5) return DEFAULT_AZN_PER_USD;
  return n;
}

/** AZN → USD at the configured rate, unrounded (rounding is the store's job). */
export function aznToUsd(amountAzn: number, aznPerUsd: number): number {
  return amountAzn / aznPerUsd;
}

/** Decimal string → integer cents. Never compares money as floats. */
export function toCents(value: string | number): number | null {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Integer cents → "1.19". */
export function centsToText(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type PricePointLike = { id: string; customerPrice: string };

/**
 * The Apple price point nearest to the target USD amount.
 *
 * Distance is measured against the UNROUNDED target (2 / 1.70 = 1.17647…), so
 * the choice is the true nearest point rather than the nearest to a value that
 * was already rounded once. A TIE goes to the LOWER price: when two points are
 * equally far, charging a family the smaller one is the conservative choice and
 * the only one we could defend.
 *
 * customerPrice arrives as a string ("1.19"). It is converted to cents for the
 * comparison; a point whose price does not parse is ignored rather than
 * treated as zero (which would win every comparison).
 */
export function chooseNearestPricePoint<P extends PricePointLike>(
  points: readonly P[],
  targetUsd: number,
): P | null {
  if (!Number.isFinite(targetUsd) || targetUsd <= 0) return null;
  const targetCents = targetUsd * 100;
  let best: P | null = null;
  let bestCents = 0;
  let bestDistance = Infinity;
  for (const p of points) {
    const cents = toCents(p.customerPrice);
    if (cents === null || cents <= 0) continue;
    const distance = Math.abs(cents - targetCents);
    // 1e-6 cent tolerance: an exact tie computed through floats must still be
    // recognised as a tie.
    if (
      distance < bestDistance - 1e-6 ||
      (Math.abs(distance - bestDistance) <= 1e-6 && cents < bestCents)
    ) {
      best = p;
      bestCents = cents;
      bestDistance = distance;
    }
  }
  return best;
}

/** Google's Money type: units is an int64 STRING, nanos an int32. */
export type GoogleMoney = { currencyCode: string; units: string; nanos: number };

/** A 2-decimal amount as Google Money ("41.18" → units "41", nanos 180000000). */
export function toGoogleMoney(amount: number, currencyCode: string): GoogleMoney {
  const cents = Math.round(amount * 100);
  const units = Math.floor(cents / 100);
  return {
    currencyCode,
    units: String(units),
    nanos: (cents - units * 100) * 10_000_000,
  };
}

/** Google Money → number (for display and comparison only). */
export function fromGoogleMoney(m: {
  units?: string | number | null;
  nanos?: number | null;
}): number {
  const units = Number(m.units ?? 0);
  const nanos = Number(m.nanos ?? 0);
  return (Number.isFinite(units) ? units : 0) + (Number.isFinite(nanos) ? nanos : 0) / 1e9;
}

/**
 * The amount to put on Google Play's AZ region, in AZ's own currency.
 * AZN → the admin amount exactly; USD → AZN ÷ rate to the cent; any other
 * currency → null (refused: we have no rate for it, and guessing one would put
 * a wrong price on sale).
 */
export function googleAzTarget(
  amountAzn: number,
  currencyCode: string,
  aznPerUsd: number,
): number | null {
  if (currencyCode === "AZN") return Math.round(amountAzn * 100) / 100;
  if (currencyCode === "USD") return Math.round(aznToUsd(amountAzn, aznPerUsd) * 100) / 100;
  return null;
}

export type SyncIndicator = "inSync" | "outOfSync" | "notCreated" | "unknown";

/** Same amount to the cent. */
export function sameCents(a: number | string, b: number | string): boolean {
  const ca = toCents(a);
  const cb = toCents(b);
  return ca !== null && cb !== null && ca === cb;
}
