// A VERIFIED APPLE TRANSACTION -> WHAT THE ENTITLEMENT NEEDS. Pure, total, and
// the only place that decision is made.
//
// READ THE DOCTRINE FIRST (it is the same one `azericard/callback.ts` states):
// a signature proves a message is GENUINE. It does not make the message an
// AUTHORITY. An App Store Server Notification is a "go and check" ping, exactly
// like the bank's BACKREF post — so this function refuses anything whose
// `source` is not `requery`. The only transaction that can become access is one
// we asked Apple about, by transaction id, over a connection we opened.
//
// That refusal is the first check below and it is not a formality. Apple's
// notification body carries a fully valid `signedTransactionInfo`; believing it
// would work in testing and would be wrong the first time a notification is
// replayed, arrives out of order, or is delivered twice.
//
// EVERY OUTCOME IS A VALUE. No throw, no partial object, no "probably fine".
// The rejection reasons are internal codes, safe to log SERVER-SIDE and never to
// be returned to a client — the caller answers with a generic trilingual message
// (project rule: never leak internals).
import { isUuid } from "@/lib/uuid";
import type { PlanInterval } from "@/lib/pricingConfigurator";
import { computeEndsAt, isPlausiblePurchaseDateMs } from "./expiry";
import {
  APPLE_PRODUCT_TYPE,
  type AppleEnvironment,
  type AppleTransactionPayload,
  type VerifiedTransaction,
} from "./environment";

/**
 * What our catalog says a store product is.
 *
 *   subscription -> a per-child, per-subject NON-RENEWING subscription. Has an
 *                   interval and therefore an `endsAt` we compute.
 *   lifetime     -> an olympiad package. A NON-CONSUMABLE in App Store terms;
 *                   `endsAt` is null because the platform rule is that a
 *                   purchaser keeps access forever.
 */
export type AppleGrantKind = "subscription" | "lifetime";

export type AppleGrant<E extends AppleEnvironment = AppleEnvironment> = {
  /** The rail this was verified on. `Sandbox` may NEVER reach a real entitlement. */
  readonly environment: E;
  readonly kind: AppleGrantKind;
  /** The App Store Connect product id. Maps to a subject+interval or a package. */
  readonly productId: string;
  /**
   * OUR checkout intent id. Apple calls it `appAccountToken`; the app sets it
   * when it starts the purchase, so this is how a payment finds the child and
   * the basket it was opened for. Lower-cased, because Apple normalises it.
   */
  readonly intentId: string;
  readonly transactionId: string;
  readonly originalTransactionId: string;
  readonly purchaseDate: Date;
  /** Null for a lifetime purchase. Computed by us for a subscription. */
  readonly endsAt: Date | null;
  readonly inAppOwnershipType: string;
  readonly storefront: string | null;
};

export type AppleGrantRejection =
  | "not_requeried"
  | "revoked"
  | "environment_mismatch"
  | "bundle_id_mismatch"
  | "product_type_unexpected"
  | "product_id_malformed"
  | "transaction_id_malformed"
  | "original_transaction_id_malformed"
  | "app_account_token_missing"
  | "app_account_token_malformed"
  | "purchase_date_out_of_range"
  | "quantity_unexpected"
  | "interval_missing"
  | "interval_unexpected"
  | "expiry_uncomputable";

export type AppleGrantResult<E extends AppleEnvironment = AppleEnvironment> =
  | { readonly ok: true; readonly grant: AppleGrant<E> }
  | { readonly ok: false; readonly reason: AppleGrantRejection };

export type AppleGrantRequest<E extends AppleEnvironment> = {
  readonly transaction: VerifiedTransaction<E>;
  /** Our own bundle id, from config. A payload naming another app is not ours. */
  readonly expectedBundleId: string;
  /** What OUR catalog says this product id is. Never read from the payload. */
  readonly expectedKind: AppleGrantKind;
  /** Required for `subscription`, and must be null for `lifetime`. */
  readonly interval: PlanInterval | null;
};

/** Apple product ids are reverse-DNS-ish; cap and charset before any DB lookup. */
const PRODUCT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
/**
 * Apple's ids are ~16-digit numeric strings today; stay permissive but bounded.
 * The 100-character cap is not arbitrary — it matches
 * `iap_purchase_intents.original_transaction_id`'s own check constraint
 * (migration 164), so an id this layer accepts is always one the database can
 * store. A tighter bound here would reject a purchase that the schema was
 * willing to record, which is the worse of the two failures.
 */
const TRANSACTION_ID_RE = /^[A-Za-z0-9._-]{1,100}$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * Did Apple refund or revoke this transaction?
 *
 * Exported on its own because REFUND / REVOKE is the one server notification a
 * non-renewing product genuinely has — there are no renewal, grace-period or
 * billing-retry events to handle — and the route that receives it must revoke
 * access whether or not a grant is being computed.
 */
export function isRevoked(payload: AppleTransactionPayload): boolean {
  return typeof payload.revocationDate === "number" && Number.isFinite(payload.revocationDate);
}

/**
 * Turn a re-queried, signature-verified transaction into a grant, or say why not.
 *
 * Checks run cheapest-and-most-structural first, and every one of them is a
 * refusal rather than a repair: there is no branch below that fills in a missing
 * field with a default.
 */
export function toAppleGrant<E extends AppleEnvironment>(
  request: AppleGrantRequest<E>,
): AppleGrantResult<E> {
  const { transaction, expectedBundleId, expectedKind, interval } = request;
  const payload = transaction.payload;

  // 1. THE DOCTRINE. A notification body is a ping, not an authority.
  if (transaction.source !== "requery") return { ok: false, reason: "not_requeried" };

  // 2. A refunded transaction is not a grant, whatever else it looks like.
  if (isRevoked(payload)) return { ok: false, reason: "revoked" };

  // 3. The payload must agree with the rail it was verified on. The certificate
  //    chain check already separates the two environments; this catches the case
  //    where our own code routed a payload to the wrong rail.
  if (payload.environment !== transaction.environment) {
    return { ok: false, reason: "environment_mismatch" };
  }

  // 4. Someone else's app is not our sale.
  if (payload.bundleId !== expectedBundleId) return { ok: false, reason: "bundle_id_mismatch" };

  // 5. The product TYPE must be the one our catalog expects. A subscription
  //    product that comes back as auto-renewable means the App Store Connect
  //    configuration drifted from the owner's decision, and the expiry we are
  //    about to compute would be a fiction.
  const expectedType =
    expectedKind === "subscription"
      ? APPLE_PRODUCT_TYPE.NON_RENEWING_SUBSCRIPTION
      : APPLE_PRODUCT_TYPE.NON_CONSUMABLE;
  if (payload.type !== expectedType) return { ok: false, reason: "product_type_unexpected" };

  if (!isNonEmptyString(payload.productId) || !PRODUCT_ID_RE.test(payload.productId)) {
    return { ok: false, reason: "product_id_malformed" };
  }
  if (!isNonEmptyString(payload.transactionId) || !TRANSACTION_ID_RE.test(payload.transactionId)) {
    return { ok: false, reason: "transaction_id_malformed" };
  }
  if (
    !isNonEmptyString(payload.originalTransactionId) ||
    !TRANSACTION_ID_RE.test(payload.originalTransactionId)
  ) {
    return { ok: false, reason: "original_transaction_id_malformed" };
  }

  // 6. THE INTENT. Without it a payment cannot be attributed to a child or a
  //    basket, and guessing is how a family gets someone else's subscription.
  //    Absent and malformed are separate reasons because they are separate
  //    bugs: absent means the app never set it, malformed means something else
  //    did.
  if (payload.appAccountToken === undefined || payload.appAccountToken === "") {
    return { ok: false, reason: "app_account_token_missing" };
  }
  if (typeof payload.appAccountToken !== "string" || !isUuid(payload.appAccountToken)) {
    return { ok: false, reason: "app_account_token_malformed" };
  }

  if (!isPlausiblePurchaseDateMs(payload.purchaseDate)) {
    return { ok: false, reason: "purchase_date_out_of_range" };
  }

  // 7. Quantity is a StoreKit field, and "buy three at once" is a business
  //    decision nobody has made. Refuse rather than silently grant one period
  //    for three payments — or three periods for one.
  if (payload.quantity !== undefined && payload.quantity !== 1) {
    return { ok: false, reason: "quantity_unexpected" };
  }

  let endsAt: Date | null = null;
  if (expectedKind === "subscription") {
    if (interval === null) return { ok: false, reason: "interval_missing" };
    endsAt = computeEndsAt(payload.purchaseDate, interval);
    if (endsAt === null || endsAt.getTime() <= payload.purchaseDate) {
      return { ok: false, reason: "expiry_uncomputable" };
    }
  } else if (interval !== null) {
    // A lifetime product carrying an interval means the catalog row is wrong.
    // Do not pick one of the two meanings on its behalf.
    return { ok: false, reason: "interval_unexpected" };
  }

  return {
    ok: true,
    grant: {
      environment: transaction.environment,
      kind: expectedKind,
      productId: payload.productId,
      intentId: payload.appAccountToken.toLowerCase(),
      transactionId: payload.transactionId,
      originalTransactionId: payload.originalTransactionId,
      purchaseDate: new Date(payload.purchaseDate),
      endsAt,
      inAppOwnershipType: payload.inAppOwnershipType ?? "PURCHASED",
      storefront: isNonEmptyString(payload.storefront) ? payload.storefront : null,
    },
  };
}

/**
 * THE ONE DOOR from "some grant" to "a grant that may create real access".
 *
 * The entitlement writer takes `AppleGrant<"Production">`, so a sandbox grant
 * cannot reach it by assignment — only through this function, which is a single
 * greppable name in a code review. Sandbox grants are still worth RECORDING
 * (App Review's own purchases are sandbox, and a support case needs to see
 * them); they are never worth granting.
 */
export function requireProductionGrant(grant: AppleGrant): AppleGrant<"Production"> | null {
  return grant.environment === "Production" ? (grant as AppleGrant<"Production">) : null;
}

/** The prefix that keeps a sandbox transaction id out of the production id space. */
export const SANDBOX_REF_PREFIX = "sbx:";

/**
 * THE SECOND DOOR, and the only other one: a sandbox grant made grantable.
 *
 * WHY THIS EXISTS AT ALL. App Review signs a SANDBOX Apple ID into the
 * PRODUCTION build, so a reviewer's purchase arrives marked Sandbox. Refusing it
 * — which this module did until 2026-09-01 — means the reviewer pays, receives
 * nothing, and rejects the app for a purchase that does not work. That is a
 * worse outcome than the abuse the refusal guarded against, and it defeats the
 * entire purpose of building the rail.
 *
 * WHAT MAKES IT SAFE. The hazard was never "sandbox access exists"; it was id
 * COLLISION. `uq_iap_intent_original_txn` is global and unique, and sandbox and
 * production are separate id spaces with no guarantee of distinctness — so an
 * unprefixed sandbox id could permanently block the real transaction that
 * happens to share its digits. Prefixing removes that entirely, and leaves every
 * sandbox grant greppable, auditable and revocable.
 *
 * It lives HERE, beside requireProductionGrant, so the environment crossing
 * remains what the invariant test says it is: a small number of named functions
 * in one file, rather than a cast somewhere in the writer.
 */
export function sandboxGrantAsProduction(grant: AppleGrant): AppleGrant<"Production"> {
  return {
    ...grant,
    originalTransactionId: `${SANDBOX_REF_PREFIX}${grant.originalTransactionId}`,
  } as AppleGrant<"Production">;
}
