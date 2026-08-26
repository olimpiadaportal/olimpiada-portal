// The finance view's vocabulary — pure, so the page and the data module agree
// and so the rules are testable without a database.
//
// THE PROBLEM THIS FILE EXISTS TO SOLVE. Reading `payments` alone MISLEADS a
// support agent, in five distinct ways:
//
//   * A session can be PAID and never DELIVERED. A payments-only view shows
//     "succeeded" and the agent tells the family they have access.
//   * A subscription can be ACTIVE with no payment at all — comped, giveaway,
//     school licence, or the 1-day free trial.
//   * An entitlement can exist with no subscription behind it.
//   * A protocol test carries a real amount and is not a customer charge.
//   * One checkout ATTEMPT can mint several orders, so an order-per-row list
//     makes one attempt look like several charges.
//
// So a row is never "a payment". It is a (session, payment) pair carrying a
// DELIVERY state beside a MONEY state, and every row renders TWO pills. A single
// pill is how the first four of those become wrong answers.
import type { Locale } from "@/i18n/config";

/** Rows per page in the finance lists. */
export const FINANCE_PAGE_SIZE = 25;

/** An AzeriCard order id: digits only, as minted by the gateway. */
export const ORDER_RE = /^\d{6,32}$/;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** The child's public 8-digit login id. */
export const CHILD_ID_RE = /^\d{8}$/;

// ---------------------------------------------------------------------------
// The two axes
// ---------------------------------------------------------------------------

/** What happened to the MONEY. Derived from `payments.status`, never a note. */
export type MoneyState =
  | "pending"
  | "succeeded"
  | "failed"
  | "canceled"
  | "refunded"
  | "no_payment_row"
  | "not_a_charge";

/** What happened to the THING BOUGHT. Derived from the session's redemption. */
export type DeliveryState =
  | "not_delivered"
  | "delivered"
  | "held_for_review"
  | "delivered_then_flagged"
  | "revoked"
  | "not_applicable";

/** Why a row exists at all. Not every row is a charge. */
export type RowKind =
  | "charge"
  | "free_apply"
  | "grant"
  | "access_window"
  | "protocol_test";

export type PillTone = "pill-ok" | "pill-warn" | "pill-muted";

export function moneyTone(s: MoneyState): PillTone {
  if (s === "succeeded") return "pill-ok";
  if (s === "pending" || s === "failed" || s === "canceled" || s === "refunded") {
    return "pill-warn";
  }
  return "pill-muted"; // no_payment_row, not_a_charge — absence, not alarm
}

export function deliveryTone(s: DeliveryState): PillTone {
  if (s === "delivered") return "pill-ok";
  if (s === "not_delivered" || s === "held_for_review" || s === "delivered_then_flagged") {
    return "pill-warn";
  }
  return "pill-muted"; // revoked, not_applicable
}

/**
 * REFUNDED-NESS COMES FROM `payments.status`, NEVER FROM A NOTE.
 *
 * This is not a style preference. The checkout-review queue once read the
 * redemption note instead and kept telling operators "we are holding this
 * family's money" about money that had already been returned — and the obvious
 * response to that, granting access by hand, gives the product away free.
 * `checkout_revoke_reversed` sets `payments.status='refunded'` unconditionally
 * and BEFORE it revokes anything, so the column is authoritative and earlier.
 */
export function moneyState(input: {
  kind: string | null | undefined;
  paymentStatus: string | null | undefined;
}): MoneyState {
  if (input.kind === "protocol_test") return "not_a_charge";
  const s = input.paymentStatus;
  if (!s) return "no_payment_row";
  if (s === "succeeded" || s === "pending" || s === "failed" || s === "canceled") return s;
  if (s === "refunded") return "refunded";
  return "no_payment_row";
}

export function deliveryState(input: {
  kind: string | null | undefined;
  intentKind: string | null | undefined;
  redeemedAt: string | null | undefined;
  redemptionStatus: string | null | undefined;
  redemptionNote: string | null | undefined;
}): DeliveryState {
  // A protocol test carries no intent and can never deliver anything. Saying
  // "not delivered" about it would put it in the attention list forever.
  if (input.kind === "protocol_test" || !input.intentKind) return "not_applicable";
  const note = input.redemptionNote ?? "";
  if (note.startsWith("reversed:")) return "revoked";
  if (!input.redeemedAt) return "not_delivered";
  if (input.redemptionStatus === "needs_review") return "held_for_review";
  if (input.redemptionStatus === "applied") {
    return note ? "delivered_then_flagged" : "delivered";
  }
  return "not_delivered";
}

/**
 * The one state that has no other home.
 *
 * `listCheckoutReviews` filters `redeemed_at is not null`, so a session whose
 * money landed and whose basket was NEVER delivered is structurally invisible to
 * the review queue and raises no notification. Its only witnesses today are a
 * pg_cron sweep and a validation script somebody runs when they already suspect
 * a problem. The grace window keeps a checkout that is merely mid-flight out of
 * the list.
 */
export const UNDELIVERED_GRACE_MINUTES = 30;

export function isMoneyTakenNothingDelivered(row: {
  money: MoneyState;
  delivery: DeliveryState;
  paidAt?: string | null;
  now?: number;
}): boolean {
  if (row.money !== "succeeded") return false;
  if (row.delivery !== "not_delivered") return false;
  if (!row.paidAt) return true;
  const at = new Date(row.paidAt).getTime();
  if (!Number.isFinite(at)) return true;
  const now = row.now ?? Date.now();
  return now - at > UNDELIVERED_GRACE_MINUTES * 60_000;
}

// ---------------------------------------------------------------------------
// payment_events
// ---------------------------------------------------------------------------

export type EventKind =
  | "cb"        // the bank's signed callback verified
  | "recon"     // the reconcile sweep settled it; there was no usable callback
  | "redeem"
  | "reversed"
  | "note"
  | "rrn"
  | "intref"
  | "unknown";

export function parseEventId(eventId: string | null | undefined): {
  kind: EventKind;
  order: string | null;
} {
  const id = (eventId ?? "").trim();
  const at = id.indexOf(":");
  if (at <= 0) return { kind: "unknown", order: null };
  const head = id.slice(0, at);
  const rest = id.slice(at + 1);
  const order = ORDER_RE.test(rest.split(":")[0]) ? rest.split(":")[0] : null;
  switch (head) {
    case "cb":
    case "recon":
    case "redeem":
    case "reversed":
    case "note":
    case "rrn":
    case "intref":
      return { kind: head, order };
    default:
      return { kind: "unknown", order };
  }
}

/**
 * The ONLY payload fields that may ever be rendered.
 *
 * `payment_events.payload_json` has no CHECK, no trigger and no shape
 * constraint. Everything keeping card data out of it lives in web-app
 * TypeScript, which THIS DEPLOYMENT DOES NOT INHERIT. So the admin panel
 * allowlists on the way out as well: an allowlist fails closed when the bank
 * adds a field, a blocklist fails open.
 *
 * P_SIGN and NONCE are absent deliberately — zero support value, and they exist
 * only so a disputed callback stays re-verifiable. A screenshot must not carry
 * them.
 */
export const PAYLOAD_ALLOWLIST: readonly string[] = [
  "RC",
  "ACTION",
  "RRN",
  "INT_REF",
  "APPROVAL",
  "AMOUNT",
  "CURRENCY",
  "TERMINAL",
  "ORDER",
  "TIMESTAMP",
  "STATUS",
  "outcome",
  "approved",
  "source",
];

/** Flatten an event payload to label/value pairs, allowlisted and stringified. */
export function projectPayload(
  payload: unknown,
): { label: string; value: string }[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  // The callback fields sit one level down; the sweep writes status_query instead.
  const sources = [root, root.callback, root.status_query].filter(
    (x): x is Record<string, unknown> => !!x && typeof x === "object",
  );
  const out: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    for (const key of PAYLOAD_ALLOWLIST) {
      if (seen.has(key)) continue;
      const v = src[key];
      if (v === undefined || v === null) continue;
      if (typeof v === "object") continue; // never a nested dump
      const s = String(v);
      if (s.length > 120) continue; // a long value is not a reference
      seen.add(key);
      out.push({ label: key, value: s });
    }
  }
  return out;
}

/**
 * How the money figure should read for a row that is not a charge.
 * Returning a bare "0.00 AZN" for a comped grant invites it into a revenue sum.
 */
export function isCountableTowardRevenue(kind: RowKind, money: MoneyState): boolean {
  if (kind !== "charge") return false;
  return money === "succeeded";
}

/** Which search branch a term belongs to. Order matters: 8 digits is both. */
export function classifySearch(term: string): ("child" | "order" | "text")[] {
  const t = term.trim();
  if (!t) return [];
  const out: ("child" | "order" | "text")[] = [];
  if (CHILD_ID_RE.test(t)) out.push("child");
  if (ORDER_RE.test(t)) out.push("order");
  if (out.length === 0) out.push("text");
  return out;
}

export type FinanceLocale = Locale;
