// Talking to the AzeriCard gateway — SERVER ONLY.
//
// This is the only module that combines the pure protocol rules with the real
// keys. It signs what we send, verifies what they send, and performs the one
// server-to-server call the whole design rests on: the TRTYPE 90 status query.
//
// WHAT IS DELIBERATELY NOT HERE
//   * No card fields, ever. The cardholder types the PAN on the acquirer's
//     hosted page after a FULL HTTP REDIRECT (never an iframe, never a form of
//     ours) — that is what keeps us on PCI DSS SAQ A, and it is a binding rule
//     in docs/STORE_PAYMENTS_COMPLIANCE.md §8.3.
//   * No card-on-file / recurring. The protocol has it (TOKEN_ACTION=REGISTER,
//     MERCH_TRAN_STATE, TOKEN, EXT_NET_REF) but the bank has not approved it for
//     this merchant. The seam is `config.tokenUrl`; nothing reads it.
//   * No entitlement, no subscription, no access. This layer records facts about
//     money. Granting access is a separate producer that does not exist yet.
import "server-only";
import {
  getAzericardConfig,
  getMpiPublicKeyPem,
  getPrivateKeyPem,
  type AzericardConfig,
} from "./config";
import {
  formatAmount,
  formatTimestamp,
  generateNonce,
  isQueryableOrder,
} from "./format";
import { authMacSource, callbackMacSource, statusMacSource } from "./mac";
import { signMacSource, verifyMacSignature } from "./signing";
import type { CallbackShape } from "./callback";
import {
  parseStatusResponse,
  reconcileStatus,
  STATUS_RESPONSE_MAX_BYTES,
  type ParsedStatusResponse,
  type StatusExpectation,
  type StatusReconciliation,
} from "./statusResponse";

/** Transaction types we use. 0/21/22/24 are named for completeness. */
export const TRTYPE = {
  PRE_AUTH: "0",
  AUTH: "1",
  COMPLETION: "21",
  REVERSAL_ONLINE: "22",
  REVERSAL_OFFLINE: "24",
  STATUS_QUERY: "90",
} as const;

/** Spec field-length caps for the free-text fields we send. */
const DESC_MAX = 50;
const MERCH_NAME_MAX = 50;

/**
 * Strip a free-text field down to printable ASCII and cap it. These values are
 * shown to the cardholder on the bank's page and travel through a CGI form
 * post; anything else invites an encoding mismatch that would break nothing
 * visibly and break the MAC invisibly.
 */
function asciiField(value: string, max: number): string {
  return value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function backrefWithLang(base: string, lang: "az" | "en" | "ru"): string {
  try {
    const url = new URL(base);
    url.searchParams.set("lang", lang);
    return url.toString();
  } catch {
    return base;
  }
}

export type AuthRequestInput = {
  /** Our minted merchant order id. */
  order: string;
  /** Amount in major units (e.g. 3 for 3.00 AZN). Re-read server-side, never from a client. */
  amount: number;
  /** Short order description shown to the cardholder. */
  description: string;
  /** UI language for the hosted page: az | en | ru. */
  lang: "az" | "en" | "ru";
};

export type AuthRequest = {
  /** Where the browser must be redirected by a full-page form POST. */
  action: string;
  /** The exact fields to post, P_SIGN included. */
  fields: Record<string, string>;
  /** The amount string we signed, kept so the callback can be compared to it. */
  amount: string;
  timestamp: string;
  nonce: string;
};

/**
 * Build a signed TRTYPE 1 (authorisation) request.
 *
 * TIMESTAMP is generated HERE, at send time, from UTC: the gateway refuses a
 * transaction whose timestamp is more than one hour off its own clock, so a
 * value computed earlier (at session creation, say) is a latent failure. NONCE
 * comes from the CSPRNG for the same reason it always does.
 *
 * Returns null when the module is not configured or the inputs are unusable —
 * the caller reports a generic failure and logs the detail server-side.
 */
export function buildAuthRequest(input: AuthRequestInput): AuthRequest | null {
  const config = getAzericardConfig();
  const privateKeyPem = getPrivateKeyPem();
  if (!config || !privateKeyPem) return null;

  const amount = formatAmount(input.amount);
  if (!amount) return null;
  if (!isQueryableOrder(input.order)) return null;

  const timestamp = formatTimestamp();
  const nonce = generateNonce();

  const fields: Record<string, string> = {
    AMOUNT: amount,
    CURRENCY: config.currency,
    ORDER: input.order,
    DESC: asciiField(input.description, DESC_MAX),
    MERCH_NAME: asciiField(config.merchantName, MERCH_NAME_MAX),
    MERCH_URL: config.merchantUrl,
    TERMINAL: config.terminal,
    TRTYPE: TRTYPE.AUTH,
    COUNTRY: config.country,
    TIMESTAMP: timestamp,
    NONCE: nonce,
    // The locale rides on BACKREF because the callback is a CROSS-SITE POST:
    // our `locale` cookie is SameSite-protected and will not be sent with it,
    // so the result page would otherwise have to guess. A query parameter we
    // wrote ourselves, whitelisted on the way back in, is the honest fix.
    BACKREF: backrefWithLang(config.backrefUrl, input.lang),
    LANG: input.lang.toUpperCase(),
  };
  if (config.merchGmt) fields.MERCH_GMT = config.merchGmt;

  // The MAC covers AMOUNT, CURRENCY, TERMINAL, TRTYPE, TIMESTAMP, NONCE,
  // MERCH_URL — in that order, and nothing else (§2.2.1).
  const macSource = authMacSource(fields);
  let signature: string;
  try {
    signature = signMacSource(privateKeyPem, macSource);
  } catch {
    return null;
  }
  fields.P_SIGN = signature;

  return { action: config.gatewayUrl, fields, amount, timestamp, nonce };
}

/**
 * Verify the gateway's signature on a callback.
 *
 * Read the note on MAC_FIELDS_CALLBACK before drawing any conclusion from a
 * `true` here: the signed set is AMOUNT, TERMINAL, APPROVAL, RRN, INT_REF, and
 * ORDER is NOT among them. A true result means "a real transaction on our
 * terminal for this amount produced these references" — it does not identify
 * the order. It is a reason to go and ask; it is not a reason to grant.
 */
export function verifyCallbackSignature(shape: CallbackShape): boolean {
  const publicKeyPem = getMpiPublicKeyPem();
  if (!publicKeyPem) return false;
  const macSource = callbackMacSource({
    AMOUNT: shape.amount,
    TERMINAL: shape.terminal,
    APPROVAL: shape.approval,
    RRN: shape.rrn,
    INT_REF: shape.intRef,
  });
  return verifyMacSignature(publicKeyPem, macSource, shape.signatureHex);
}

export type StatusQueryInput = {
  order: string;
  /** The TRTYPE of the transaction being asked about (1 for a normal sale). */
  tranTrtype?: string;
  expectation: StatusExpectation;
};

export type StatusQueryResult =
  | { ok: true; parsed: ParsedStatusResponse; reconciliation: StatusReconciliation }
  | { ok: false; error: StatusQueryError };

export type StatusQueryError =
  | "not_configured"
  | "invalid_order"
  | "sign_failed"
  | "network"
  | "http_error"
  | "empty_response";

/** The gateway answers a status query for 24 hours after the original request. */
export const STATUS_QUERY_WINDOW_HOURS = 24;

const STATUS_QUERY_TIMEOUT_MS = 15_000;

/**
 * Ask the gateway what actually happened to OUR order (TRTYPE 90), and
 * reconcile the answer against what we expect.
 *
 * This is the authoritative step. The callback that triggers it is
 * unauthenticated client data whose signature does not cover ORDER; this call
 * is one we initiate, to a URL we control, naming an order we minted. Nothing
 * in the platform may treat a payment as real on any weaker evidence.
 *
 * The response body is parsed but NEVER logged: §8.2 says it carries the masked
 * card number, and a masked PAN in an application log is still card data in an
 * application log.
 */
export async function queryTransactionStatus(
  input: StatusQueryInput,
): Promise<StatusQueryResult> {
  const config = getAzericardConfig();
  const privateKeyPem = getPrivateKeyPem();
  if (!config || !privateKeyPem) return { ok: false, error: "not_configured" };
  // The status-inquiry table narrows ORDER to 6–20 characters.
  if (!isQueryableOrder(input.order)) return { ok: false, error: "invalid_order" };

  const fields: Record<string, string> = {
    TRAN_TRTYPE: input.tranTrtype ?? TRTYPE.AUTH,
    ORDER: input.order,
    TERMINAL: config.terminal,
    TRTYPE: TRTYPE.STATUS_QUERY,
    TIMESTAMP: formatTimestamp(),
    NONCE: generateNonce(),
  };

  const macSource = statusMacSource(fields, config.statusMacIncludesTranTrtype);
  try {
    fields.P_SIGN = signMacSource(privateKeyPem, macSource);
  } catch {
    return { ok: false, error: "sign_failed" };
  }

  let response: Response;
  try {
    response = await fetch(config.gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // §8.2: the response format follows the merchant's request. JSON is the
        // one the parser prefers; it also reads form and XML bodies.
        Accept: "application/json",
      },
      body: new URLSearchParams(fields).toString(),
      // A gateway that answers with a redirect is not answering our question.
      redirect: "manual",
      signal: AbortSignal.timeout(STATUS_QUERY_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "network" };
  }

  if (!response.ok) return { ok: false, error: "http_error" };

  let body: string;
  try {
    body = (await response.text()).slice(0, STATUS_RESPONSE_MAX_BYTES);
  } catch {
    return { ok: false, error: "network" };
  }
  if (body.trim() === "") return { ok: false, error: "empty_response" };

  const parsed = parseStatusResponse(body);
  const reconciliation = reconcileStatus(parsed, input.expectation);
  return { ok: true, parsed, reconciliation };
}

/** Re-export so callers do not have to reach into config.ts for the terminal. */
export function getConfiguredTerminal(): string | null {
  const config: AzericardConfig | null = getAzericardConfig();
  return config?.terminal ?? null;
}
