// AzeriCard field FORMATTING and VALIDATION — the pure half.
//
// No `server-only`, no env, no key material (same rule as mac.ts). The only
// non-pure thing here is the CSPRNG, which is drawn from `node:crypto` and is
// injectable so tests can pin a value without pinning randomness.
//
// Everything the gateway rejects, it rejects with the same opaque failure, so
// each constraint below is enforced BEFORE we send rather than discovered as an
// unexplained decline.
import { randomBytes, randomInt } from "node:crypto";

// ---------------------------------------------------------------------------
// AMOUNT
// ---------------------------------------------------------------------------

/** Field length cap from the spec table (AMOUNT is 1–12 characters). */
export const AMOUNT_MAX_LENGTH = 12;

/**
 * Render an amount the way the gateway's tables describe it — "sürüklənən
 * nöqtəli formatda", a plain decimal-point number, e.g. `11.48`.
 *
 * We always emit exactly two decimals. The spec's own examples show both
 * `AMOUNT=10` and `AMOUNT=11.48`, so either is accepted; a single fixed shape
 * is chosen because the MAC is computed over the exact characters we send, and
 * "sometimes 3, sometimes 3.00" is precisely the kind of drift that produces an
 * invalid-signature error with nothing to debug.
 *
 * Returns null for anything that is not a finite, non-negative, representable
 * amount — the caller must treat that as "do not send", never as zero.
 */
export function formatAmount(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  // Guard against float dust turning 3 into 2.9999999999999996 before rounding.
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(rounded)) return null;
  const text = rounded.toFixed(2);
  if (text.length > AMOUNT_MAX_LENGTH) return null;
  return text;
}

/**
 * Parse an amount the gateway sent back. Tolerant of `10`, `10.0`, `10.00` and
 * of a leading `+`; rejects anything else (a comma decimal separator, currency
 * suffixes, exponent notation) rather than guessing.
 */
export function parseAmount(text: string): number | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!/^\+?\d{1,12}(\.\d{1,4})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Do two amount strings denote the same money? Compared NUMERICALLY, to the
 * minor unit — never by string equality, because we send "3.00" and the gateway
 * is free to echo "3".
 */
export function amountsMatch(a: string, b: string): boolean {
  const x = parseAmount(a);
  const y = parseAmount(b);
  if (x === null || y === null) return false;
  return Math.round(x * 100) === Math.round(y * 100);
}

// ---------------------------------------------------------------------------
// TIMESTAMP
// ---------------------------------------------------------------------------

/**
 * GMT timestamp, `YYYYMMDDHHMMSS`.
 *
 * The gateway REFUSES a transaction whose timestamp is more than ONE HOUR from
 * its own clock, so this is generated from UTC at send time and never cached,
 * never derived from a local-time formatter, and never reused across a retry.
 */
export function formatTimestamp(date: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
  );
}

/** Parse a `YYYYMMDDHHMMSS` GMT timestamp. Null when malformed or unreal. */
export function parseTimestamp(text: string): Date | null {
  if (typeof text !== "string" || !/^\d{14}$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const hour = Number(text.slice(8, 10));
  const minute = Number(text.slice(10, 12));
  const second = Number(text.slice(12, 14));
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  // Reject 20260231: Date.UTC rolls it over instead of failing.
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day ||
    d.getUTCHours() !== hour ||
    d.getUTCMinutes() !== minute ||
    d.getUTCSeconds() !== second
  ) {
    return null;
  }
  return d;
}

export function isValidTimestamp(text: string): boolean {
  return parseTimestamp(text) !== null;
}

/** The gateway's own tolerance: ±1 hour between its clock and ours. */
export const TIMESTAMP_MAX_SKEW_SECONDS = 60 * 60;

/** Absolute skew in seconds, or null when the timestamp is unparseable. */
export function timestampSkewSeconds(
  text: string,
  now: Date = new Date(),
): number | null {
  const parsed = parseTimestamp(text);
  if (!parsed) return null;
  return Math.abs(Math.round((now.getTime() - parsed.getTime()) / 1000));
}

// ---------------------------------------------------------------------------
// NONCE
// ---------------------------------------------------------------------------

/** Spec: 8–32 random BYTES, hex-encoded, i.e. 16–64 hex characters. */
export const NONCE_MIN_BYTES = 8;
export const NONCE_MAX_BYTES = 32;

/**
 * A fresh nonce from the CSPRNG. 16 bytes / 32 hex characters by default —
 * comfortably inside the range and well past collision relevance.
 * Uppercase, matching the spec's own example (`F2B2DD7E603A7ADA`); the gateway
 * accepts either case.
 */
export function generateNonce(bytes: number = 16): string {
  const n = Math.min(NONCE_MAX_BYTES, Math.max(NONCE_MIN_BYTES, Math.trunc(bytes)));
  return randomBytes(n).toString("hex").toUpperCase();
}

export function isValidNonce(text: string): boolean {
  if (typeof text !== "string") return false;
  if (!/^[0-9a-fA-F]+$/.test(text)) return false;
  if (text.length % 2 !== 0) return false;
  const bytes = text.length / 2;
  return bytes >= NONCE_MIN_BYTES && bytes <= NONCE_MAX_BYTES;
}

// ---------------------------------------------------------------------------
// ORDER
// ---------------------------------------------------------------------------

/** Spec: ORDER is numeric, 6–32 characters. */
export const ORDER_MIN_LENGTH = 6;
export const ORDER_MAX_LENGTH = 32;

/**
 * The TRTYPE 90 status-inquiry table narrows ORDER to 6–20. We mint 14, so both
 * limits hold; this constant exists so a future longer format cannot silently
 * become un-queryable.
 */
export const ORDER_MAX_LENGTH_STATUS_QUERY = 20;

export function isValidOrder(text: string): boolean {
  return (
    typeof text === "string" &&
    new RegExp(`^\\d{${ORDER_MIN_LENGTH},${ORDER_MAX_LENGTH}}$`).test(text)
  );
}

export function isQueryableOrder(text: string): boolean {
  return (
    isValidOrder(text) && text.length <= ORDER_MAX_LENGTH_STATUS_QUERY
  );
}

/** The `YYYYMMDD` day-part every minted ORDER starts with, in UTC. */
export function orderDatePart(date: Date = new Date()): string {
  return formatTimestamp(date).slice(0, 8);
}

/**
 * Mint an ORDER candidate: `YYYYMMDD` (UTC) + 6 digits.
 *
 * The spec says the LAST SIX DIGITS are used as the system trace audit number
 * and "must be unique per terminal per day". Embedding the UTC date makes the
 * uniqueness requirement a per-day one by construction; the six random digits
 * are the part that must not collide, and collision is settled by the DATABASE
 * (a unique index on `checkout_sessions (provider, provider_session_id)`), not
 * by hoping. `session.ts` retries on a unique violation.
 *
 * `randomSuffix` is injectable so tests can pin the output without pinning the
 * CSPRNG; production uses `randomInt`, which is rejection-sampled and uniform.
 */
export function mintOrderCandidate(
  date: Date = new Date(),
  randomSuffix: () => number = () => randomInt(0, 1_000_000),
): string {
  const suffix = Math.abs(Math.trunc(randomSuffix())) % 1_000_000;
  return `${orderDatePart(date)}${String(suffix).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Small shared shapes
// ---------------------------------------------------------------------------

/** Spec: TERMINAL is exactly 8 characters, assigned by the bank. */
export function isValidTerminal(text: string): boolean {
  return typeof text === "string" && /^\d{8}$/.test(text);
}

/** ISO-4217 alphabetic code, 3 uppercase letters. */
export function isValidCurrency(text: string): boolean {
  return typeof text === "string" && /^[A-Z]{3}$/.test(text);
}

/** ISO-3166-1 alpha-2, 2 uppercase letters. */
export function isValidCountry(text: string): boolean {
  return typeof text === "string" && /^[A-Z]{2}$/.test(text);
}

/**
 * RRN (ISO-8583 field 37) and INT_REF are opaque references we store and must
 * never let a caller stuff with arbitrary text — they end up in a MAC source
 * and in a database uniqueness key. Printable ASCII, bounded length.
 */
export function isValidReference(text: string, maxLength: number): boolean {
  return (
    typeof text === "string" &&
    text.length > 0 &&
    text.length <= maxLength &&
    /^[\x20-\x7E]+$/.test(text)
  );
}
