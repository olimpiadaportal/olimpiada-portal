// Parsing the TRTYPE 90 ("Əməliyyat statusu") response — the pure half.
//
// This is the ONLY thing the platform is allowed to believe about whether an
// order was paid. The callback is an unauthenticated ping whose signature does
// not cover ORDER (see callback.ts); this response is the answer to a question
// we asked, over a server-to-server connection we opened, about an order we
// named. Everything downstream keys off `reconcileStatus` below.
//
// WHY THE PARSER IS TOLERANT. Spec §8.2 says only "Response can be in HTML, XML
// and JSON format according to Merchant request" and then describes the fields
// in PROSE ("Banks approval code", "Transaction RRN") rather than naming the
// JSON keys. We ask for JSON and parse JSON first, but we also accept a
// form-encoded body and a flat XML-ish body, and we map a small alias table
// onto the canonical names. Being tolerant about the SHAPE costs nothing;
// being tolerant about the VERDICT would cost everything, so `reconcileStatus`
// is strict and conjunctive.
import { amountsMatch } from "./format";
import { outcomeFromCodes, type PaymentOutcome } from "./codes";
import { isForbiddenFieldName } from "./callback";

/** Cap on the response body we will read at all. */
export const STATUS_RESPONSE_MAX_BYTES = 64 * 1024;

/** Canonical field names we normalise onto. */
export type StatusFieldName =
  | "ACTION"
  | "RC"
  | "STATUSMSG"
  | "TERMINAL"
  | "AMOUNT"
  | "CURRENCY"
  | "ORDER"
  | "APPROVAL"
  | "RRN"
  | "INT_REF"
  | "TRTYPE"
  | "TRAN_TRTYPE"
  | "TIMESTAMP"
  | "NONCE"
  | "P_SIGN"
  | "TRANSACTION_STATE"
  | "TRANSACTION_DATE";

/**
 * Alias table. The left-hand side is what a response might call a field (after
 * upper-casing and stripping spaces/hyphens); the right-hand side is our
 * canonical name. Extend this from the OWNER'S LIVE TEST output rather than
 * from guesswork — the route logs the canonical keys it recognised and the
 * count of the ones it did not, precisely so this table can be finished with
 * evidence.
 */
const ALIASES: Record<string, StatusFieldName> = {
  ACTION: "ACTION",
  RC: "RC",
  RESPONSECODE: "RC",
  RESPONSE_CODE: "RC",
  STATUSMSG: "STATUSMSG",
  STATUSMESSAGE: "STATUSMSG",
  TRANSACTIONSTATUSMESSAGE: "STATUSMSG",
  MESSAGE: "STATUSMSG",
  TERMINAL: "TERMINAL",
  TERMINALID: "TERMINAL",
  AMOUNT: "AMOUNT",
  TRANSACTIONAMOUNT: "AMOUNT",
  CURRENCY: "CURRENCY",
  TRANSACTIONCURRENCY: "CURRENCY",
  ORDER: "ORDER",
  ORDERID: "ORDER",
  MERCHANTORDERID: "ORDER",
  APPROVAL: "APPROVAL",
  APPROVALCODE: "APPROVAL",
  BANKSAPPROVALCODE: "APPROVAL",
  RRN: "RRN",
  TRANSACTIONRRN: "RRN",
  INT_REF: "INT_REF",
  INTREF: "INT_REF",
  INTERNALREFERENCE: "INT_REF",
  TRTYPE: "TRTYPE",
  ORIGINALTRANSACTIONTRTYPE: "TRTYPE",
  TRAN_TRTYPE: "TRAN_TRTYPE",
  TRANTRTYPE: "TRAN_TRTYPE",
  TIMESTAMP: "TIMESTAMP",
  NONCE: "NONCE",
  P_SIGN: "P_SIGN",
  PSIGN: "P_SIGN",
  TRANSACTIONSTATE: "TRANSACTION_STATE",
  STATE: "TRANSACTION_STATE",
  TRANSACTIONDATE: "TRANSACTION_DATE",
};

function canonicalName(raw: string): StatusFieldName | null {
  const key = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  // Try the de-punctuated form first, then the literal one (INT_REF, P_SIGN).
  return ALIASES[key] ?? ALIASES[String(raw).trim().toUpperCase()] ?? null;
}

export type ParsedStatusResponse = {
  /** Canonical fields we recognised. */
  fields: Partial<Record<StatusFieldName, string>>;
  /** How many keys we saw but could not map — a signal, never a payload. */
  unrecognisedCount: number;
  /** Which parser produced this. Useful in the live-test report. */
  format: "json" | "form" | "xml" | "none";
};

/**
 * Parse a status-inquiry response body. Never throws: an unparseable body is an
 * empty field bag, and `reconcileStatus` then refuses to approve — which is the
 * correct outcome for "we could not read the gateway's answer".
 */
export function parseStatusResponse(body: string): ParsedStatusResponse {
  const empty: ParsedStatusResponse = { fields: {}, unrecognisedCount: 0, format: "none" };
  if (typeof body !== "string") return empty;
  const text = body.slice(0, STATUS_RESPONSE_MAX_BYTES).trim();
  if (text === "") return empty;

  const collected = collectJson(text) ?? collectXml(text) ?? collectForm(text);
  if (!collected) return empty;

  const fields: Partial<Record<StatusFieldName, string>> = {};
  let unrecognisedCount = 0;
  for (const [rawKey, rawValue] of collected.pairs) {
    // Card data must not survive a parse, whatever the gateway chose to send.
    if (isForbiddenFieldName(rawKey)) continue;
    const name = canonicalName(rawKey);
    if (!name) {
      unrecognisedCount += 1;
      continue;
    }
    if (fields[name] === undefined) fields[name] = rawValue.trim().slice(0, 512);
  }
  return { fields, unrecognisedCount, format: collected.format };
}

type Collected = { pairs: [string, string][]; format: "json" | "form" | "xml" };

function collectJson(text: string): Collected | null {
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const pairs: [string, string][] = [];
  const walk = (node: unknown, depth: number): void => {
    if (depth > 4 || pairs.length > 200) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "object") {
        walk(v, depth + 1);
        continue;
      }
      pairs.push([k, String(v)]);
    }
  };
  walk(parsed, 0);
  return { pairs, format: "json" };
}

function collectXml(text: string): Collected | null {
  if (!text.startsWith("<")) return null;
  const pairs: [string, string][] = [];
  const re = /<\s*([A-Za-z_][\w.:-]*)\s*>([^<]*)<\s*\/\s*\1\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && pairs.length < 200) {
    pairs.push([m[1] as string, decodeXmlEntities(m[2] as string)]);
  }
  return pairs.length > 0 ? { pairs, format: "xml" } : null;
}

function decodeXmlEntities(value: string): string {
  return value
    .split("&lt;").join("<")
    .split("&gt;").join(">")
    .split("&quot;").join('"')
    .split("&apos;").join("'")
    .split("&amp;").join("&");
}

function collectForm(text: string): Collected | null {
  if (!text.includes("=")) return null;
  const pairs: [string, string][] = [];
  for (const part of text.split(/[&\r\n]+/)) {
    if (pairs.length >= 200) break;
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx);
    const v = part.slice(idx + 1);
    try {
      pairs.push([decodeURIComponent(k.replace(/\+/g, " ")), decodeURIComponent(v.replace(/\+/g, " "))]);
    } catch {
      pairs.push([k, v]);
    }
  }
  return pairs.length > 0 ? { pairs, format: "form" } : null;
}

/** What we expect the gateway to be talking about. */
export type StatusExpectation = {
  order: string;
  terminal: string;
  /** Formatted exactly as we sent it, e.g. "3.00". Compared numerically. */
  amount: string;
  currency: string;
};

export type StatusReconciliation = {
  outcome: PaymentOutcome;
  /** Every expectation matched AND the gateway approved it. */
  approved: boolean;
  /** Machine-readable reasons the reconciliation was not clean. */
  mismatches: StatusMismatch[];
  rrn: string | null;
  intRef: string | null;
  approval: string | null;
  action: string | null;
  rc: string | null;
};

export type StatusMismatch =
  | "no_response"
  | "order_missing"
  | "order_mismatch"
  | "terminal_mismatch"
  | "amount_mismatch"
  | "currency_mismatch";

/**
 * Compare a parsed status response against what we expect, and decide.
 *
 * STRICT AND CONJUNCTIVE ON PURPOSE. `approved` is true only when the gateway
 * says ACTION=0 (with an RC of "00" if it sends one) *and* the response is
 * about our ORDER, on our TERMINAL, for our AMOUNT, in our CURRENCY. A missing
 * field is a mismatch, not a pass: "the gateway did not tell us which order
 * this is" must never resolve to "so it is probably ours".
 *
 * TERMINAL and CURRENCY are compared only when present, because the spec allows
 * a sparse response; ORDER and AMOUNT are required, because they are the two
 * facts that make the answer about this payment and no other.
 */
export function reconcileStatus(
  parsed: ParsedStatusResponse,
  expected: StatusExpectation,
): StatusReconciliation {
  const f = parsed.fields;
  const mismatches: StatusMismatch[] = [];

  if (parsed.format === "none" || Object.keys(f).length === 0) {
    mismatches.push("no_response");
  }

  const order = f.ORDER ?? null;
  if (order === null) mismatches.push("order_missing");
  else if (order !== expected.order) mismatches.push("order_mismatch");

  if (f.TERMINAL !== undefined && f.TERMINAL !== expected.terminal) {
    mismatches.push("terminal_mismatch");
  }

  const amount = f.AMOUNT ?? null;
  if (amount === null || !amountsMatch(amount, expected.amount)) {
    mismatches.push("amount_mismatch");
  }

  if (f.CURRENCY !== undefined && f.CURRENCY.toUpperCase() !== expected.currency) {
    mismatches.push("currency_mismatch");
  }

  const outcome = outcomeFromCodes(f.ACTION ?? null, f.RC ?? null);

  return {
    outcome,
    approved: outcome === "approved" && mismatches.length === 0,
    mismatches,
    rrn: f.RRN ?? null,
    intRef: f.INT_REF ?? null,
    approval: f.APPROVAL ?? null,
    action: f.ACTION ?? null,
    rc: f.RC ?? null,
  };
}

/**
 * The outcome the LEDGER is allowed to record — which is not always
 * `reconciliation.outcome`.
 *
 * The case that matters, and the one a naive `approved ? "approved" : outcome`
 * gets wrong: the gateway answers ACTION=0 but the response is about a
 * different order, a different amount or a different terminal. `outcome` is
 * still "approved" (that is what the codes said) while `approved` is false (the
 * facts did not line up). Passing `outcome` through in that branch would write
 * `succeeded` into `payments` for a payment we have no evidence belongs to this
 * order. It collapses to "unknown" instead, which maps to `pending`: something
 * happened, we do not know that it was ours, and a human reconciles it.
 */
export function settledOutcome(reconciliation: StatusReconciliation): PaymentOutcome {
  if (reconciliation.approved) return "approved";
  // SYMMETRY IS THE POINT. The rule is about the EVIDENCE, not the direction of
  // the verdict: if the answer does not demonstrably describe THIS order, we do
  // not get to record what it said — in either direction.
  //
  // Collapsing only the positive case was worse than inconsistent, it was
  // lossy. `failed` is terminal in the ledger, so a `declined`/`failed` written
  // off a mismatched answer permanently closes the payment, and a later,
  // cleanly reconciled `approved` for the same order is then silently
  // discarded: the parent is charged and the record says failed forever.
  // "Unknown" is the honest verdict for untrustworthy evidence, it maps to
  // `pending`, and it leaves the row open for the reconciliation job.
  if (reconciliation.mismatches.length > 0) return "unknown";
  return reconciliation.outcome === "approved" ? "unknown" : reconciliation.outcome;
}
