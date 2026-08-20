// Parsing and validating the callback the gateway POSTs to our BACKREF — the
// pure half. No env, no keys, no database.
//
// WHAT A VERIFIED CALLBACK ACTUALLY PROVES, and why this module refuses to
// pretend otherwise:
//
// The gateway signs only AMOUNT, TERMINAL, APPROVAL, RRN and INT_REF (see
// MAC_FIELDS_CALLBACK in mac.ts). **ORDER is not signed.** A valid P_SIGN
// therefore proves that some transaction happened on our terminal for that
// amount — it does NOT prove which of our orders it belongs to. Anyone who ever
// obtains one valid tuple can post it back against a different ORDER and the
// signature still verifies.
//
// So the callback is a "go and check" ping and nothing more. The route verifies
// the signature, looks OUR order up, then asks the gateway directly (TRTYPE 90)
// about that order and believes only the answer. This module's job is to make
// the callback safe to *handle* — bounded, well-shaped, and stripped of
// anything we must never store — not to make it trustworthy.
import { isValidNonce, isValidOrder, isValidReference, isValidTerminal, parseAmount } from "./format";

/** Hard caps so a hostile POST cannot make us allocate. */
export const CALLBACK_MAX_FIELDS = 40;
export const CALLBACK_MAX_VALUE_LENGTH = 512;
export const CALLBACK_MAX_BODY_BYTES = 16 * 1024;

/**
 * Fields we are willing to read off a callback. Anything else is dropped before
 * it reaches the rest of the system.
 *
 * CARD, TOKEN, PAN, CVV and expiry are deliberately ABSENT and are additionally
 * blocked by `FORBIDDEN_FIELDS` below. We never receive a PAN (the cardholder
 * types it on the acquirer's hosted page, which is what keeps us on PCI SAQ A),
 * and the masked card number the gateway may include is of no use to us. The
 * cheapest way to guarantee we never log or store card data is to never carry
 * it past the request boundary. TOKEN is dropped too: card-on-file is not
 * approved for this merchant and a token we cannot use is a liability we can.
 */
export const CALLBACK_ALLOWED_FIELDS = [
  "AMOUNT",
  "CURRENCY",
  "ORDER",
  "ACTION",
  "RC",
  "APPROVAL",
  "RRN",
  "INT_REF",
  "TERMINAL",
  "TRTYPE",
  "TIMESTAMP",
  "NONCE",
  "P_SIGN",
  "STATUSMSG",
  "LANG",
] as const;

export type CallbackFieldName = (typeof CALLBACK_ALLOWED_FIELDS)[number];

/**
 * Names that must never survive into a log line, a database row or an error
 * message. Matched as substrings, case-insensitively, so `CARD_NUMBER`,
 * `card`, `PAN`, `EXP_MONTH`, `CVC` and friends are all caught.
 */
export const FORBIDDEN_FIELD_SUBSTRINGS = [
  "CARD",
  "PAN",
  "CVV",
  "CVC",
  "EXP",
  "TOKEN",
  "SECRET",
  "PASSWORD",
] as const;

export function isForbiddenFieldName(name: string): boolean {
  const upper = String(name).toUpperCase();
  return FORBIDDEN_FIELD_SUBSTRINGS.some((needle) => upper.includes(needle));
}

/**
 * Normalise an incoming form/JSON body into an upper-cased, bounded field bag
 * containing only allowed names.
 *
 * Bounded first, filtered second: the field cap applies to the RAW entries so a
 * body stuffed with 100k unknown keys is refused by size, not survived by
 * filtering.
 */
export function normalizeCallbackFields(
  entries: Iterable<readonly [string, string]>,
): Record<string, string> {
  const allowed = new Set<string>(CALLBACK_ALLOWED_FIELDS);
  const out: Record<string, string> = {};
  let seen = 0;
  for (const [rawKey, rawValue] of entries) {
    seen += 1;
    if (seen > CALLBACK_MAX_FIELDS) break;
    if (typeof rawKey !== "string" || typeof rawValue !== "string") continue;
    const key = rawKey.trim().toUpperCase();
    if (!allowed.has(key)) continue;
    if (isForbiddenFieldName(key)) continue; // belt and braces
    const value = rawValue.trim();
    if (value.length > CALLBACK_MAX_VALUE_LENGTH) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Strip everything we must not persist, then cap what remains. Used for the
 * `payment_events.payload_json` audit copy.
 *
 * P_SIGN is kept: it is a signature over data the gateway already gave us, it
 * is not a credential, and having it makes a disputed callback re-verifiable
 * months later. The private key is what must never appear, and it never
 * touches this path.
 */
export function sanitizeCallbackForStorage(
  fields: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isForbiddenFieldName(key)) continue;
    out[key] = value.slice(0, CALLBACK_MAX_VALUE_LENGTH);
  }
  return out;
}

/** Why a callback was refused. Internal vocabulary — never sent to a client. */
export type CallbackRejectReason =
  | "malformed"
  | "missing_signature"
  | "missing_order"
  | "invalid_order"
  | "invalid_terminal"
  | "terminal_mismatch"
  | "invalid_amount"
  | "invalid_reference"
  | "invalid_nonce";

export type CallbackShape = {
  order: string;
  amount: string;
  currency: string | null;
  action: string | null;
  rc: string | null;
  approval: string | null;
  rrn: string | null;
  intRef: string | null;
  terminal: string;
  trtype: string | null;
  timestamp: string | null;
  nonce: string | null;
  signatureHex: string;
};

export type CallbackShapeResult =
  | { ok: true; shape: CallbackShape }
  | { ok: false; reason: CallbackRejectReason };

/**
 * Structural validation, run BEFORE any signature check and before any database
 * access. Everything here is a cheap local test, which is the point: an
 * unauthenticated public endpoint must reject rubbish without spending a key
 * operation or a query on it.
 *
 * `expectedTerminal` is checked here because a callback for a different
 * terminal is not our business at all, and the terminal is one of the five
 * signed fields — refusing early keeps a foreign-terminal replay from even
 * reaching the verifier.
 */
export function validateCallbackShape(
  fields: Record<string, string>,
  expectedTerminal: string,
): CallbackShapeResult {
  const get = (name: CallbackFieldName): string | null => {
    const v = fields[name];
    return typeof v === "string" && v !== "" ? v : null;
  };

  const signatureHex = get("P_SIGN");
  if (!signatureHex) return { ok: false, reason: "missing_signature" };

  const order = get("ORDER");
  if (!order) return { ok: false, reason: "missing_order" };
  if (!isValidOrder(order)) return { ok: false, reason: "invalid_order" };

  const terminal = get("TERMINAL");
  if (!terminal || !isValidTerminal(terminal)) {
    return { ok: false, reason: "invalid_terminal" };
  }
  if (terminal !== expectedTerminal) {
    return { ok: false, reason: "terminal_mismatch" };
  }

  const amount = get("AMOUNT");
  if (!amount || parseAmount(amount) === null) {
    return { ok: false, reason: "invalid_amount" };
  }

  const rrn = get("RRN");
  const intRef = get("INT_REF");
  // RRN is ISO-8583 field 37 (12 chars in practice); INT_REF is the gateway's
  // own reference, spec'd 1–128. Both are bounded here because both become part
  // of a database uniqueness key downstream.
  if (rrn !== null && !isValidReference(rrn, 32)) {
    return { ok: false, reason: "invalid_reference" };
  }
  if (intRef !== null && !isValidReference(intRef, 128)) {
    return { ok: false, reason: "invalid_reference" };
  }

  const nonce = get("NONCE");
  if (nonce !== null && !isValidNonce(nonce)) {
    return { ok: false, reason: "invalid_nonce" };
  }

  const approval = get("APPROVAL");
  if (approval !== null && !isValidReference(approval, 16)) {
    return { ok: false, reason: "invalid_reference" };
  }

  return {
    ok: true,
    shape: {
      order,
      amount,
      currency: get("CURRENCY"),
      action: get("ACTION"),
      rc: get("RC"),
      approval,
      rrn,
      intRef,
      terminal,
      trtype: get("TRTYPE"),
      timestamp: get("TIMESTAMP"),
      nonce,
      signatureHex,
    },
  };
}
