// A GOOGLE PLAY PURCHASE, AS GOOGLE REPORTS IT -> WHAT THE ENTITLEMENT NEEDS.
// Pure, total, and the only place that decision is made — the twin of
// apple/transaction.ts.
//
// THE DOCTRINE IS THE APPLE ONE. A purchase token from the app, or from a
// Pub/Sub notification, is a QUESTION, not evidence. The only thing that can
// become access is the `ProductPurchase` Google returns to a request WE made,
// authenticated as our service account, about that token — which is what the
// `source: "requery"` tag below records, and `toGoogleGrant` refuses anything
// else at its first line.
//
// WHAT THE PRODUCTS ARE. One-time CONSUMABLE products, one per subject per cycle
// (`ai.olympiq.app.sub.<slug>.<week|month|year>`) plus olympiad packages
// (`ai.olympiq.app.oly.<slug>`), with the SAME ids as the iOS catalogue. A
// subject purchase grants a window computed exactly as the iOS non-renewing
// subscription computes it (apple/expiry.ts — one implementation, so a month
// bought on Android and a month bought on iOS end on the same day); a package
// grants lifetime access. Consumable rather than a Play subscription for the
// reason iOS is non-renewing: this platform sells PER CHILD, and one Google
// account cannot hold three concurrent subscriptions to one product.
//
// WHICH CHILD. `obfuscatedExternalAccountId` is the twin of Apple's
// appAccountToken: the app passes the server-issued intent id as
// `obfuscatedAccountIdAndroid` when it launches the billing flow, Google stores
// it with the purchase and returns it here. It is the only thing that knows
// which child a purchase was for.
//
// EVERY OUTCOME IS A VALUE. The rejection reasons are internal codes, safe to
// log server-side and never returned to a client.
import { createHash } from "node:crypto";
import { isUuid } from "@/lib/uuid";
import type { PlanInterval } from "@/lib/pricingConfigurator";
import { computeEndsAt, isPlausiblePurchaseDateMs } from "@/lib/payments/apple/expiry";

/**
 * The store product id shape, identical to `ck_iap_product_id_shape`. Checked
 * before a product id is placed in a Google API URL or a database query.
 */
export const PLAY_PRODUCT_ID_RE =
  /^ai\.olympiq\.app\.(sub\.[a-z0-9]+\.(week|month|year)|oly\.[a-z0-9]+)$/;

/**
 * Purchase tokens are opaque. Google documents no format beyond "a string";
 * in practice they are ~150-200 characters of [A-Za-z0-9._-]. Bounded and
 * charset-checked before one reaches a URL path.
 */
export const PURCHASE_TOKEN_RE = /^[A-Za-z0-9._-]{10,1000}$/;

/** Google order ids: `GPA.1234-5678-9012-34567`, with `..N` suffixes for repeats. */
const ORDER_ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

/** Every Google ref starts here, so the rail is greppable in entitlements. */
export const GOOGLE_REF_PREFIX = "gp:";
/** License-tester purchases: namespaced so they never collide with a real order. */
export const GOOGLE_TEST_REF_PREFIX = "gp:test:";
/** Ref built from the token when Google returned no orderId. */
const TOKEN_REF_MARKER = "tok:";
/** Hex characters of sha256(token) kept in a token ref. 160 bits; ample. */
const TOKEN_HASH_CHARS = 40;

/** ProductPurchase.purchaseState */
export const PLAY_PURCHASE_STATE = { PURCHASED: 0, CANCELED: 1, PENDING: 2 } as const;
/** ProductPurchase.purchaseType — 0 is a license-tester purchase. */
export const PLAY_PURCHASE_TYPE_TEST = 0;

/**
 * The parts of Google's `ProductPurchase` resource this rail reads. Everything
 * is `unknown`: it is parsed defensively so a shape change arrives as a refusal
 * rather than a TypeError inside a payment endpoint.
 */
export type ProductPurchase = {
  readonly purchaseTimeMillis?: unknown;
  readonly purchaseState?: unknown;
  readonly consumptionState?: unknown;
  readonly acknowledgementState?: unknown;
  readonly orderId?: unknown;
  readonly purchaseType?: unknown;
  readonly quantity?: unknown;
  readonly obfuscatedExternalAccountId?: unknown;
  readonly productId?: unknown;
  readonly regionCode?: unknown;
};

/**
 * A purchase Google reported to a request we made. The ONLY constructor is the
 * re-query in grantEntitlement.ts, which tags it `requery`.
 */
export type VerifiedPlayPurchase = {
  readonly source: "requery" | "notification";
  /** The product id WE asked about (it is in the request path). */
  readonly productId: string;
  readonly purchaseToken: string;
  readonly purchase: ProductPurchase;
};

export type GoogleGrantKind = "subscription" | "lifetime";

export type GoogleGrant = {
  readonly productId: string;
  /** Our intent id, lower-cased — from obfuscatedExternalAccountId. */
  readonly intentId: string;
  readonly orderId: string | null;
  /** entitlements.external_ref and iap_purchase_intents.original_transaction_id. */
  readonly externalRef: string;
  /** A license-tester purchase (purchaseType 0). */
  readonly test: boolean;
  readonly purchaseDate: Date;
  /** Null for a lifetime (package) grant. */
  readonly endsAt: Date | null;
  /** Google already shows it consumed (consumptionState 1). */
  readonly consumed: boolean;
  /** Google already shows it acknowledged (acknowledgementState 1). */
  readonly acknowledged: boolean;
};

export type GoogleGrantRejection =
  | "not_requeried"
  | "product_id_malformed"
  | "token_malformed"
  | "account_id_missing"
  | "account_id_malformed"
  | "canceled"
  | "state_unexpected"
  | "quantity_unexpected"
  | "purchase_date_out_of_range"
  | "order_id_malformed"
  | "interval_missing"
  | "interval_unexpected"
  | "expiry_uncomputable";

export type GoogleGrantDecision =
  | { readonly ok: true; readonly state: "purchased"; readonly grant: GoogleGrant }
  /** Paid with a delayed method (cash, bank transfer): record, never grant. */
  | { readonly ok: true; readonly state: "pending"; readonly intentId: string }
  | { readonly ok: false; readonly reason: GoogleGrantRejection };

export type GoogleGrantRequest = {
  readonly purchase: VerifiedPlayPurchase;
  /** What OUR catalogue says the product is. Never read from the payload. */
  readonly expectedKind: GoogleGrantKind;
  /** Required for `subscription`, and must be null for `lifetime`. */
  readonly interval: PlanInterval | null;
};

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d{1,16}$/.test(value)) return Number(value);
  return null;
}

/** sha256(token), truncated — the token itself is never stored or logged. */
export function purchaseTokenDigest(purchaseToken: string): string {
  return createHash("sha256").update(purchaseToken, "utf8").digest("hex").slice(0, TOKEN_HASH_CHARS);
}

/**
 * The idempotency key a Google purchase is granted and revoked under.
 *
 * Google's orderId when there is one — it is unique per purchase and is what a
 * refund (a voided purchase) names. When Google returns no orderId (some test
 * purchases) the key is a digest of the purchase token, which is equally
 * unique and never reveals the token. Test purchases carry their own prefix.
 * At most 8 + 80 = 88 characters, inside the 100 that
 * iap_purchase_intents.original_transaction_id allows.
 */
export function googleExternalRef(input: {
  readonly orderId: string | null;
  readonly purchaseToken: string;
  readonly test: boolean;
}): string {
  const prefix = input.test ? GOOGLE_TEST_REF_PREFIX : GOOGLE_REF_PREFIX;
  return input.orderId
    ? `${prefix}${input.orderId}`
    : `${prefix}${TOKEN_REF_MARKER}${purchaseTokenDigest(input.purchaseToken)}`;
}

/**
 * Every ref a voided purchase could have been granted under. A void names an
 * orderId and a token but not whether the purchase was a test or whether Google
 * had returned its orderId to us; revoking a ref that was never granted is a
 * no-op, so all four candidates are asked rather than guessing.
 */
export function candidateRefsForVoided(input: {
  readonly orderId: string | null;
  readonly purchaseToken: string | null;
}): string[] {
  const refs: string[] = [];
  if (input.orderId && ORDER_ID_RE.test(input.orderId)) {
    refs.push(`${GOOGLE_REF_PREFIX}${input.orderId}`, `${GOOGLE_TEST_REF_PREFIX}${input.orderId}`);
  }
  if (input.purchaseToken && PURCHASE_TOKEN_RE.test(input.purchaseToken)) {
    const digest = purchaseTokenDigest(input.purchaseToken);
    refs.push(
      `${GOOGLE_REF_PREFIX}${TOKEN_REF_MARKER}${digest}`,
      `${GOOGLE_TEST_REF_PREFIX}${TOKEN_REF_MARKER}${digest}`,
    );
  }
  return refs;
}

/**
 * Turn a re-queried Google purchase into a grant, a pending record, or a
 * refusal. Checks run cheapest-and-most-structural first; none of them repairs
 * a missing field with a default.
 */
export function toGoogleGrant(request: GoogleGrantRequest): GoogleGrantDecision {
  const { purchase, expectedKind, interval } = request;

  // 1. THE DOCTRINE. Only an answer to our own question.
  if (purchase.source !== "requery") return { ok: false, reason: "not_requeried" };

  if (!PLAY_PRODUCT_ID_RE.test(purchase.productId)) {
    return { ok: false, reason: "product_id_malformed" };
  }
  if (!PURCHASE_TOKEN_RE.test(purchase.purchaseToken)) {
    return { ok: false, reason: "token_malformed" };
  }
  const p = purchase.purchase;

  // 2. WHICH CHILD. Without the intent a payment cannot be attributed, and
  //    guessing is how a family gets someone else's subscription.
  const account = p.obfuscatedExternalAccountId;
  if (account === undefined || account === null || account === "") {
    return { ok: false, reason: "account_id_missing" };
  }
  if (typeof account !== "string" || !isUuid(account)) {
    return { ok: false, reason: "account_id_malformed" };
  }
  const intentId = account.toLowerCase();

  // 3. STATE. 0 purchased, 1 canceled (which includes refunded), 2 pending.
  const state = asInt(p.purchaseState);
  if (state === PLAY_PURCHASE_STATE.CANCELED) return { ok: false, reason: "canceled" };
  if (state === PLAY_PURCHASE_STATE.PENDING) return { ok: true, state: "pending", intentId };
  if (state !== PLAY_PURCHASE_STATE.PURCHASED) return { ok: false, reason: "state_unexpected" };

  // 4. One purchase, one period. Multi-quantity is a business decision nobody
  //    has made, exactly as on iOS.
  if (p.quantity !== undefined && asInt(p.quantity) !== 1) {
    return { ok: false, reason: "quantity_unexpected" };
  }

  const purchaseMs = asInt(p.purchaseTimeMillis);
  if (purchaseMs === null || !isPlausiblePurchaseDateMs(purchaseMs)) {
    return { ok: false, reason: "purchase_date_out_of_range" };
  }

  let orderId: string | null = null;
  if (p.orderId !== undefined && p.orderId !== null && p.orderId !== "") {
    if (typeof p.orderId !== "string" || !ORDER_ID_RE.test(p.orderId)) {
      return { ok: false, reason: "order_id_malformed" };
    }
    orderId = p.orderId;
  }

  // 5. THE WINDOW, from OUR catalogue's interval — never from the payload.
  let endsAt: Date | null = null;
  if (expectedKind === "subscription") {
    if (interval === null) return { ok: false, reason: "interval_missing" };
    endsAt = computeEndsAt(purchaseMs, interval);
    if (endsAt === null || endsAt.getTime() <= purchaseMs) {
      return { ok: false, reason: "expiry_uncomputable" };
    }
  } else if (interval !== null) {
    return { ok: false, reason: "interval_unexpected" };
  }

  const test = asInt(p.purchaseType) === PLAY_PURCHASE_TYPE_TEST;
  return {
    ok: true,
    state: "purchased",
    grant: {
      productId: purchase.productId,
      intentId,
      orderId,
      externalRef: googleExternalRef({ orderId, purchaseToken: purchase.purchaseToken, test }),
      test,
      purchaseDate: new Date(purchaseMs),
      endsAt,
      consumed: asInt(p.consumptionState) === 1,
      acknowledged: asInt(p.acknowledgementState) === 1,
    },
  };
}

/**
 * A token, shortened for a log line. The full token is a credential-shaped
 * value that answers questions about a purchase; a log aggregator never gets it.
 */
export function redactToken(purchaseToken: string): string {
  return `${purchaseTokenDigest(purchaseToken).slice(0, 12)}…`;
}
