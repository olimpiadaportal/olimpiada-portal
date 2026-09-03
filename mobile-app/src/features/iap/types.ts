// Shared vocabulary for the Apple in-app-purchase rail.
//
// NOTHING HERE IMPORTS expo-iap, react-native OR react. That is deliberate: the
// purchase SEQUENCE is the part a mistake is expensive in (an order swap loses a
// paid-for transaction), so it has to be testable without a native module, a
// renderer or a device. `store.ts` is the only file in the app that touches
// StoreKit; everything else in this directory talks in the types below.
//
// NO PRICE TYPE APPEARS IN THIS FILE except `displayPrice`, and that is a STRING
// that came out of StoreKit already localised and currency-correct. The app must
// never hold a number it could format itself: a price formatted by us is wrong
// the day Apple changes a tier, wrong in every storefront but one, and wrong
// about tax.

/** One sellable row of `public.iap_products` (platform = ios, active = true). */
export type IapCatalogRow = {
  /** The App Store Connect product id. Also the SKU handed to StoreKit. */
  productId: string;
  scope: "subject" | "olympiad_package";
  subjectId: string | null;
  packageId: string | null;
  /** week/month/year for a subject product; null for a package. */
  interval: "week" | "month" | "year" | null;
  subjectCode: string | null;
  subjectName: string | null;
};

/** What StoreKit knows about one product. `displayPrice` is Apple's own string. */
export type StoreProduct = {
  id: string;
  /** e.g. "₺129,99" / "$4.99" — rendered VERBATIM, never parsed, never rebuilt. */
  displayPrice: string;
  title: string | null;
};

/** A completed StoreKit transaction, reduced to what our server needs. */
export type StorePurchase = {
  /** PurchaseIOS.transactionId — the id `/iap/apple/redeem` asks Apple about. */
  transactionId: string;
  productId: string;
  /** The appAccountToken StoreKit echoed back; our intent id when it is ours. */
  appAccountToken: string | null;
  /** 'pending' = Ask-to-Buy awaiting a guardian; nothing is charged yet. */
  purchaseState: "pending" | "purchased" | "unknown";
  /** The untouched payload, passed straight back to finishTransaction. */
  raw: unknown;
};

/** Why a StoreKit call failed, in terms this app makes decisions on. */
export type StoreFailureKind =
  /** The user dismissed the sheet. NOT an error — nothing is shown. */
  | "cancelled"
  /** Ask-to-Buy / SCA deferral: no money moved, the answer comes later. */
  | "deferred"
  /** Purchases are switched off for this device or Apple ID (Screen Time). */
  | "notAllowed"
  /** The SKU is unknown to the store, or the store could not be reached. */
  | "unavailable"
  /** We stopped waiting. We do NOT know whether money moved. */
  | "timeout"
  /** Anything else. */
  | "unknown";

export class StoreError extends Error {
  readonly kind: StoreFailureKind;
  constructor(kind: StoreFailureKind, message?: string) {
    super(message ?? kind);
    this.name = "StoreError";
    this.kind = kind;
  }
}

export function storeFailureKind(err: unknown): StoreFailureKind {
  return err instanceof StoreError ? err.kind : "unknown";
}

/**
 * The StoreKit seam. `store.ts` provides the real one; tests provide a fake.
 * Every method may reject with a StoreError.
 */
export type IapStore = {
  /** Idempotent. Resolves once the billing client is connected. */
  connect(): Promise<void>;
  /** Unknown SKUs are omitted rather than thrown — a short list is normal. */
  fetchProducts(productIds: string[]): Promise<StoreProduct[]>;
  /**
   * Open the store sheet. `appAccountToken` IS our intent id — the only thing
   * that ties an Apple purchase to one CHILD.
   */
  buy(args: { productId: string; appAccountToken: string }): Promise<StorePurchase>;
  /** Settle a transaction. Called ONLY after our server acknowledged it. */
  finish(purchase: StorePurchase): Promise<void>;
  /** AppStore.sync() — may prompt for the Apple ID password. Best effort. */
  sync(): Promise<void>;
  /** Every transaction id StoreKit still knows about on THIS device. */
  transactionIds(): Promise<string[]>;
};

/** The three BFF calls, injected so the flows can be tested without a network. */
export type IapApi = {
  openIntent(
    studentProfileId: string,
    productId: string,
  ): Promise<
    | { ok: true; data: { intent_id: string } }
    | { ok: false; error: string; retryable: boolean }
  >;
  redeem(
    intentId: string,
    transactionId: string,
  ): Promise<
    | {
        ok: true;
        data: {
          granted: boolean;
          already?: boolean;
          message?: string;
          ends_at?: string | null;
        } | null;
      }
    | { ok: false; error: string; retryable: boolean }
  >;
  restore(
    transactionIds: string[],
  ): Promise<
    | { ok: true; data: { checked: number; granted: number } | null }
    | { ok: false; error: string; retryable: boolean }
  >;
};

/**
 * WHAT HAPPENED, from the family's point of view. The distinction that matters
 * most is `pending` vs `failed`:
 *   pending — money may be gone and we could not confirm the grant. The
 *             transaction is deliberately LEFT UNFINISHED so StoreKit keeps it,
 *             Restore can find it and the reconcile sweep can settle it.
 *   failed  — nothing was charged. Saying "failed" after a real charge is the
 *             one outcome this whole module exists to prevent.
 */
export type PurchaseOutcome =
  | { status: "granted"; already: boolean; endsAt: string | null }
  /** Verified by Apple, acknowledged by our server, no access yet (sandbox). */
  | { status: "recorded"; messageKey: string }
  | { status: "pending"; detailKey: string | null }
  | { status: "deferred" }
  | { status: "cancelled" }
  | { status: "failed"; messageKey: string };

export type RestoreOutcome =
  | { status: "restored"; granted: number }
  /** Ran fine, found nothing to give back. Calm, not an error. */
  | { status: "nothing" }
  | { status: "failed"; messageKey: string };

/** Ordered trace of the purchase sequence, for tests and dev logging. */
export type PurchaseStep = "intent" | "buy" | "redeem" | "finish";
