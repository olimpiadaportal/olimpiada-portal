// Shared vocabulary for the in-app-purchase rails: Apple StoreKit on iOS and,
// since the owner decision of 2026-10-10, Google Play Billing on Android.
//
// NOTHING HERE IMPORTS expo-iap, react-native OR react. That is deliberate: the
// purchase SEQUENCE is the part a mistake is expensive in (an order swap loses a
// paid-for transaction), so it has to be testable without a native module, a
// renderer or a device. `store.ts` is the only file in the app that touches a
// billing library; everything else in this directory talks in the types below,
// and the SAME sequence drives both stores.
//
// NO PRICE TYPE APPEARS IN THIS FILE except `displayPrice`, and that is a STRING
// that came out of the store (StoreKit or Play Billing) already localised and
// currency-correct. The app must never hold a number it could format itself: a
// price formatted by us is wrong the day a store changes a tier, wrong in every
// storefront but one, and wrong about tax.

/** One sellable row of `public.iap_products` (this build's platform, active). */
export type IapCatalogRow = {
  /** The store product id — identical on iOS and Android. Also the SKU. */
  productId: string;
  scope: "subject" | "olympiad_package";
  subjectId: string | null;
  packageId: string | null;
  /** week/month/year for a subject product; null for a package. */
  interval: "week" | "month" | "year" | null;
  subjectCode: string | null;
  subjectName: string | null;
};

/** What the store knows about one product. `displayPrice` is the store's own
 *  string (StoreKit's displayPrice / Play's formattedPrice). */
export type StoreProduct = {
  id: string;
  /** e.g. "₺129,99" / "$4.99" — rendered VERBATIM, never parsed, never rebuilt. */
  displayPrice: string;
  title: string | null;
};

/** A completed store transaction, reduced to what our server needs. */
export type StorePurchase = {
  /**
   * The id our server verifies with the store:
   *   Apple  — PurchaseIOS.transactionId (asked of the App Store Server API);
   *   Google — the Play `purchaseToken` (asked of the Android Publisher API).
   */
  transactionId: string;
  productId: string;
  /**
   * Our intent id as the store echoed it back: StoreKit's `appAccountToken`,
   * Play's `obfuscatedAccountIdAndroid`. The only thing tying a purchase to
   * ONE child.
   */
  appAccountToken: string | null;
  /**
   * 'pending' = no money has moved yet: Ask-to-Buy awaiting a guardian on iOS,
   * a slow payment method (cash, bank transfer) awaiting Google on Android.
   */
  purchaseState: "pending" | "purchased" | "unknown";
  /** Google's order id (GPA.…), sent alongside the token for support/audit.
   *  Absent on iOS. Never used as the verification key. */
  orderId?: string | null;
  /** The untouched payload, passed straight back to finishTransaction. */
  raw: unknown;
};

/** One purchase the device still holds, as Restore sends it to the server. */
export type RestoreItem = { transactionId: string; productId: string | null };

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
  /**
   * GOOGLE ONLY: Play still holds an UNCONSUMED earlier purchase of this SKU on
   * this account (the server could not consume it yet), so Play refuses to sell
   * it again. Nothing was charged now; Restore settles the earlier one.
   */
  | "alreadyOwned"
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
 * The billing seam. `store.ts` provides the real ones (Apple and Google); tests
 * provide a fake. Every method may reject with a StoreError.
 */
export type IapStore = {
  /**
   * WHEN `finish` MAY RUN. Absent/false = the Apple rule: after ANY answer the
   * server acknowledged (granted or recorded). True = the Google rule: only
   * after the server GRANTED. On Play, `finish` CONSUMES the purchase, and a
   * consumed purchase disappears from getAvailablePurchases() — so a purchase
   * the server acknowledged without granting must stay on the device where
   * Restore can still find it.
   */
  finishOnlyWhenGranted?: boolean;
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
  /** Every transaction id the store still knows about on THIS device. */
  transactionIds(): Promise<string[]>;
  /**
   * The same list WITH the product each id is for. Optional: Apple's restore
   * needs only the ids; Google's restore must name the product of every token.
   */
  restorableItems?(): Promise<RestoreItem[]>;
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
    /** Google's redeem needs the product and (optionally) the order id. */
    context?: { productId: string; orderId: string | null },
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
    /** The same ids with their products — what Google's restore requires. */
    items?: readonly RestoreItem[],
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
  /** Verified by the store, acknowledged by our server, no access yet (sandbox
   *  / license-tester purchase). */
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
