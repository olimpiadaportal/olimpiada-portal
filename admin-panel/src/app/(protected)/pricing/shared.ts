// Plain shared module for the Subscription Pricing screen (importable from both
// the "use server" action and the client cell — no server-only imports here).

export const PRICE_INTERVALS = ["week", "month", "year"] as const;
export type PriceInterval = (typeof PRICE_INTERVALS)[number];

// Business bounds enforced by the admin_upsert_subject_price RPC; mirrored
// here for client UX and re-checked server-side in the action.
export const PRICE_MIN_EXCLUSIVE = 0;
export const PRICE_MAX = 10000;

// Digits with an optional 1–2 decimal fraction ("3", "9.5", "90.00").
// The string shape (not float math) is what guarantees ≤ 2 decimals.
const AMOUNT_SHAPE = /^\d{1,5}(\.\d{1,2})?$/;

// Parses a raw amount string; returns the numeric value or null when the text
// is not a valid price (shape, finiteness or 0 < x ≤ 10000 fails).
export function parsePriceAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > 12 || !AMOUNT_SHAPE.test(trimmed)) {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= PRICE_MIN_EXCLUSIVE || n > PRICE_MAX) {
    return null;
  }
  return n;
}
