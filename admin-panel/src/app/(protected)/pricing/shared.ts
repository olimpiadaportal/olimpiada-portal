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

function parseAmount(raw: string, allowZero: boolean): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > 12 || !AMOUNT_SHAPE.test(trimmed)) {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n > PRICE_MAX) return null;
  // AMOUNT_SHAPE admits no sign, so a negative cannot reach here — the explicit
  // test stays because it is the property being promised, not an implementation
  // detail of the regex above.
  if (allowZero ? n < 0 : n <= PRICE_MIN_EXCLUSIVE) return null;
  return n;
}

// Parses a raw amount string; returns the numeric value or null when the text
// is not a valid price (shape, finiteness or 0 < x ≤ 10000 fails).
export function parsePriceAmount(raw: string): number | null {
  return parseAmount(raw, false);
}

/**
 * Same shape, finiteness and ≤ 2-decimal guarantees, but ZERO IS VALID.
 *
 * A subscription price of 0 is meaningless — a free subject is delivered
 * through the free-access rail, and admin_upsert_subject_price refuses 0
 * outright. A zero-priced OLYMPIAD PACKAGE is a live product concept: the
 * purchase_olympiad_if_free RPC exists precisely to deliver one. So the two
 * rails need different floors and the same everything-else, which is why this
 * shares parseAmount rather than being a second hand-written parser that can
 * drift.
 */
export function parsePackagePriceAmount(raw: string): number | null {
  return parseAmount(raw, true);
}
