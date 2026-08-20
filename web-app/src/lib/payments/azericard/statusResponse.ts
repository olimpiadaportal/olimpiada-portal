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
import { amountsMatch, currenciesMatch } from "./format";
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
  // Learned from the live TEST gateway on 2026-08-20, not from the spec, which
  // never names these keys. The reply is camelCase and shares almost no
  // spelling with the request: terminal, actionCode, responseCode, statusMsg,
  // card, amount, currency, tranDate, rrn, intRef, nonce, signature, timestamp.
  // Missing ACTIONCODE is why `action` came back null and the outcome had to be
  // inferred from RC alone.
  ACTIONCODE: "ACTION",
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
  // The live reply spells it `approval_id`. Confirmed on the test terminal
  // 2026-08-20: it is present on an APPROVED status reply and absent on a
  // declined one, which is what made it the last unmapped field. This is the
  // bank's authorisation code and the strongest single piece of evidence in a
  // dispute, so losing it silently was worth fixing.
  APPROVAL_ID: "APPROVAL",
  APPROVALID: "APPROVAL",
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
  TRANDATE: "TRANSACTION_DATE",
  // Their reply is itself SIGNED. We do not yet verify it — the spec does not
  // document the field order of the response MAC — but recognising the field
  // keeps it out of the unrecognised bucket and makes it available the moment
  // ABB confirms the order. `card` is deliberately absent from this table: it
  // is the masked PAN and must never be mapped, stored or logged.
  SIGNATURE: "P_SIGN",
};

function canonicalName(raw: string): StatusFieldName | null {
  // Underscores are stripped too. They were not, which is exactly how
  // `approval_id` slipped through while `approvalCode` would have matched. The
  // literal fallback below still catches the canonical spellings that CONTAIN
  // an underscore (INT_REF, P_SIGN), and both also appear de-punctuated in the
  // table (INTREF, PSIGN), so nothing is lost by normalising harder here.
  const key = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]+/g, "");
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
  /**
   * The references from the SIGNED callback that triggered this query.
   *
   * These are the only unforgeable transaction identity we hold: the callback
   * MAC covers AMOUNT, TERMINAL, APPROVAL, RRN and INT_REF — but NOT ORDER. So
   * when the status reply names a transaction, these are what it must name.
   * Optional because a reconciliation sweep may query with no callback in hand.
   */
  rrn?: string | null;
  intRef?: string | null;
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
  | "order_mismatch"
  // The status answer names a DIFFERENT transaction than the signed callback
  // that triggered this query. See the reference check in reconcileStatus.
  | "reference_mismatch"
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
 * a sparse response.
 *
 * ORDER used to be required here. It cannot be: the live gateway's status reply
 * contains no order field at all, so requiring it meant nothing could ever
 * settle. Its job — proving the answer is about THIS payment — is now done by
 * the callback's gateway-SIGNED RRN/INT_REF, which is a stronger guarantee than
 * the unsigned ORDER echo ever was. AMOUNT is still required.
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

  // ORDER: BINDING COMES FROM THE QUERY, NOT FROM AN ECHO.
  //
  // The original rule — a missing ORDER is a mismatch, because "the gateway did
  // not tell us which order this is" must never become "so it is probably ours"
  // — is the right instinct and was written before we had ever seen a reply.
  // The live TEST gateway settles the question: its status response contains NO
  // order field at all (terminal, actionCode, responseCode, statusMsg, card,
  // amount, currency, tranDate, rrn, intRef, nonce, signature, timestamp). So
  // that rule could never pass, and no payment could ever settle.
  //
  // What binds the answer instead is that WE keyed the request: the query is a
  // POST carrying ORDER=<ours>, so the reply is about that order by
  // construction, over TLS, and it must additionally agree with us on terminal,
  // amount and currency below. An echoed ORDER that DISAGREES is still fatal —
  // that is a real contradiction rather than a silent protocol characteristic.
  //
  // This is deliberately weaker than the original and it is the weakest link in
  // the chain. The response carries a `signature` field, so the proper
  // hardening is to verify it; the spec does not document that MAC's field
  // order, so it is an open question with ABB rather than something to guess.
  const order = f.ORDER ?? null;
  if (order !== null && order !== expected.order) mismatches.push("order_mismatch");

  if (f.TERMINAL !== undefined && f.TERMINAL !== expected.terminal) {
    mismatches.push("terminal_mismatch");
  }

  const amount = f.AMOUNT ?? null;
  if (amount === null || !amountsMatch(amount, expected.amount)) {
    mismatches.push("amount_mismatch");
  }

  // They answer with the ISO-4217 NUMERIC code while we send the alphabetic one
  // — the live callback echoed CURRENCY="944" for the "AZN" we posted. A plain
  // string compare made every single reply a currency_mismatch, which then
  // blocked every settlement.
  if (f.CURRENCY !== undefined && !currenciesMatch(f.CURRENCY, expected.currency)) {
    mismatches.push("currency_mismatch");
  }

  // THE ANSWER MUST NAME THE SAME TRANSACTION THE SIGNED CALLBACK NAMED.
  //
  // This replaces the binding that dropping the ORDER echo removed, and it is
  // strictly stronger than what it replaces: ORDER was never covered by the
  // callback MAC, while RRN and INT_REF are — so an attacker cannot forge them,
  // whereas ORDER was always attacker-supplied.
  //
  // Without it, "we queried by our order" was only an ASSUMPTION about how the
  // gateway keys its lookup, and the live run never tested it (we only ever
  // queried orders the terminal really had). If that assumption is ever wrong —
  // a gateway that answers about the terminal's most recent transaction when it
  // does not recognise an order — then two of our own orders for the same
  // amount are indistinguishable, and a DECLINED payer gets credited with a
  // different parent's approved one while that parent's real payment is
  // permanently blocked by the reference claim.
  //
  // Compared only when BOTH sides carry the value: a blank is legal under the
  // MAC rules, and a sweep may run with no callback at hand.
  const refPairs: [string | null | undefined, string | null | undefined][] = [
    [expected.rrn, f.RRN],
    [expected.intRef, f.INT_REF],
  ];
  for (const [ours, theirs] of refPairs) {
    if (ours && theirs && ours !== theirs) {
      mismatches.push("reference_mismatch");
      break;
    }
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
