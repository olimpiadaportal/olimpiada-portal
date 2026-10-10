// THE ONLY FILE IN THIS APP THAT TOUCHES A BILLING LIBRARY (expo-iap).
//
// TWO IMPLEMENTATIONS OF ONE SEAM. Everything else — screens, flows, hooks —
// talks to the `IapStore` interface in ./types:
//   * `appleStore`  — StoreKit, iOS. Approved by Apple on 2026-09-09.
//   * `googleStore` — Google Play Billing, Android. Owner decision 2026-10-10:
//     Android sells exactly like iOS (same subjects × week/month/year, bound to
//     one child, verified by our server before access exists).
// Each one refuses to run unless the build's store (platform.ts, a BUILD-TIME
// constant) is its own, so neither can be reached on the wrong platform even by
// mistake. `platformStore` is the one a screen's rail uses.
//
// The purchase SEQUENCE is testable without a native module (see
// purchaseFlow.ts / restoreFlow.ts, which import nothing from here) and is the
// same sequence for both stores.
//
// IMPORT SAFETY. expo-iap resolves its native module lazily behind a Proxy
// (build/ExpoIapModule.js), so importing this file in Expo Go, where the native
// module does not exist, does NOT throw — only CALLING would, and every call
// below is guarded and wrapped. That property is load-bearing: an import-time
// crash here would take down the whole app on the owner's Expo Go test device.
//
// NO PRICE IS COMPUTED, PARSED OR FORMATTED IN THIS FILE. displayPrice comes out
// of the store (StoreKit's displayPrice, Play's formattedPrice) already
// localised, already in the viewer's storefront currency, and is passed through
// as an opaque string.
import {
  ErrorCode,
  finishTransaction,
  fetchProducts,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from "expo-iap";
import {
  StoreError,
  type IapStore,
  type StoreFailureKind,
  type RestoreItem,
  type StoreProduct,
  type StorePurchase,
} from "./types";
import { IAP_PLATFORM_SUPPORTED, IAP_STORE } from "./platform";

export { IAP_PLATFORM_SUPPORTED };

const IS_APPLE = IAP_STORE === "apple";
const IS_GOOGLE = IAP_STORE === "google";

/**
 * How long we wait for the store sheet before we stop believing an answer is
 * coming. Generous: Face ID, a password prompt, a card update and a slow
 * network all happen inside this window, and the cost of being wrong is a
 * hedged "we could not confirm" instead of a settled outcome. A promise with no
 * timeout at all is worse — that is the spinner that never ends.
 */
const BUY_TIMEOUT_MS = 5 * 60_000;

function unsupported(): StoreError {
  return new StoreError("unavailable", "this store is not the store of this build");
}

/** StoreKit's error vocabulary → the four decisions this app actually makes. */
export function kindFromErrorCode(code: unknown): StoreFailureKind {
  switch (code) {
    case ErrorCode.UserCancelled:
      return "cancelled";
    case ErrorCode.DeferredPayment:
    case ErrorCode.Pending:
      return "deferred";
    // Purchases switched off for this Apple ID or device (Screen Time,
    // "Allow In-App Purchases: Off", a managed device). Worth its own sentence:
    // nothing the user does inside this app can fix it.
    case ErrorCode.IapNotAvailable:
    case ErrorCode.FeatureNotSupported:
    case ErrorCode.BillingUnavailable:
      return "notAllowed";
    case ErrorCode.ItemUnavailable:
    case ErrorCode.SkuNotFound:
    case ErrorCode.QueryProduct:
    case ErrorCode.NetworkError:
    case ErrorCode.ServiceError:
    case ErrorCode.ServiceTimeout:
    case ErrorCode.ServiceDisconnected:
    case ErrorCode.NotPrepared:
    case ErrorCode.InitConnection:
    case ErrorCode.ConnectionClosed:
      return "unavailable";
    default:
      return "unknown";
  }
}

function toStoreError(err: unknown): StoreError {
  if (err instanceof StoreError) return err;
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  return new StoreError(kindFromErrorCode(code));
}

/** Reads a StoreKit product without trusting any single field to exist. */
function toStoreProduct(raw: unknown): StoreProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  // displayPrice is the ONLY price this app is allowed to show. A product
  // without one is DROPPED rather than rendered with a blank or a guess: a
  // purchase row with no price is not a row a store reviewer should ever see.
  const displayPrice = typeof o.displayPrice === "string" ? o.displayPrice : null;
  if (!id || !displayPrice || displayPrice.length === 0) return null;
  return { id, displayPrice, title: typeof o.title === "string" ? o.title : null };
}

function toStorePurchase(raw: unknown): StorePurchase | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const productId = typeof o.productId === "string" ? o.productId : "";
  // PurchaseIOS.transactionId is the id our server asks Apple about. `id` holds
  // the same value on iOS; it is read as a fallback rather than losing a real
  // transaction to a field-name change.
  const transactionId =
    typeof o.transactionId === "string" && o.transactionId.length > 0
      ? o.transactionId
      : typeof o.id === "string"
        ? o.id
        : "";
  const state = o.purchaseState;
  return {
    transactionId,
    productId,
    appAccountToken: typeof o.appAccountToken === "string" ? o.appAccountToken : null,
    purchaseState:
      state === "pending" || state === "purchased" || state === "unknown" ? state : "unknown",
    raw,
  };
}

/** Apple lowercases the appAccountToken it echoes back and our intent id is a
 *  lowercase Postgres uuid, but the comparison is case-insensitive anyway so a
 *  genuine match is never mistaken for somebody else's transaction. */
function sameToken(a: string | null, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

let connected = false;

export const appleStore: IapStore = {
  async connect() {
    if (!IS_APPLE) throw unsupported();
    if (connected) return;
    try {
      await initConnection();
      connected = true;
    } catch (err) {
      throw toStoreError(err);
    }
  },

  async fetchProducts(productIds: string[]): Promise<StoreProduct[]> {
    if (!IS_APPLE) throw unsupported();
    if (productIds.length === 0) return [];
    try {
      // type "all" and not "in-app". Our products are NON-RENEWING
      // subscriptions, which sit in a taxonomy corner every SDK names
      // differently; asking for everything cannot miss them, and the SKU list
      // already bounds the answer to products we sell.
      const raw = await fetchProducts({ skus: productIds, type: "all" });
      const list = Array.isArray(raw) ? raw : [];
      return list.map(toStoreProduct).filter((p): p is StoreProduct => p !== null);
    } catch (err) {
      throw toStoreError(err);
    }
  },

  buy({ productId, appAccountToken }): Promise<StorePurchase> {
    if (!IS_APPLE) return Promise.reject(unsupported());
    return new Promise<StorePurchase>((resolve, reject) => {
      let settled = false;
      const subs: { remove: () => void }[] = [];

      const cleanup = () => {
        for (const s of subs) {
          try {
            s.remove();
          } catch {
            // A listener that will not detach must not break the purchase.
          }
        }
      };
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        fn();
      };
      const timer = setTimeout(
        () => done(() => reject(new StoreError("timeout"))),
        BUY_TIMEOUT_MS,
      );

      // THE LISTENERS GO UP BEFORE THE SHEET OPENS. StoreKit can deliver a
      // transaction before requestPurchase's own promise settles; a listener
      // attached afterwards would miss it and we would time out on a purchase
      // that actually happened.
      const accept = (raw: unknown) => {
        const purchase = toStorePurchase(raw);
        if (!purchase) return;
        if (purchase.productId !== productId) return;
        // iOS replays UNFINISHED transactions to any new listener — including
        // the ones we deliberately leave unfinished after a failed redeem.
        // Without this check, a replay of an older purchase of the same product
        // would be redeemed against THIS intent, the server would refuse the
        // mismatch, and the purchase the parent just made would be lost. A
        // payload carrying no token at all is accepted: older StoreKit payloads
        // omit it, and refusing those would strand a real purchase.
        if (
          purchase.appAccountToken !== null &&
          !sameToken(purchase.appAccountToken, appAccountToken)
        ) {
          return;
        }
        done(() => resolve(purchase));
      };

      try {
        subs.push(purchaseUpdatedListener(accept));
        subs.push(
          purchaseErrorListener((e) =>
            done(() => reject(new StoreError(kindFromErrorCode(e?.code)))),
          ),
        );
      } catch (err) {
        done(() => reject(toStoreError(err)));
        return;
      }

      // On iOS expo-iap resolves this with the transaction itself, so the happy
      // path usually settles here rather than in the listener. Both are wired
      // because neither is guaranteed.
      requestPurchase({
        type: "in-app",
        request: { apple: { sku: productId, appAccountToken, quantity: 1 } },
      })
        .then((result) => {
          if (settled) return;
          const first = Array.isArray(result) ? result[0] : result;
          if (first) accept(first);
          // A null result is not a failure: the listener or the timeout answers.
        })
        .catch((err) => done(() => reject(toStoreError(err))));
    });
  },

  async finish(purchase: StorePurchase) {
    if (!IS_APPLE) throw unsupported();
    // The UNTOUCHED StoreKit payload goes back, not our reduced view of it:
    // expo-iap reads fields off it that StorePurchase deliberately does not
    // carry. isConsumable stays false — on iOS this is a plain
    // Transaction.finish() and the flag only branches on Android, which is
    // googleStore's business, not this object's.
    await finishTransaction({ purchase: purchase.raw as Purchase, isConsumable: false });
  },

  async sync() {
    if (!IS_APPLE) throw unsupported();
    // May put up an Apple ID password prompt. Callers treat a rejection as
    // non-fatal — see restoreFlow.ts.
    await restorePurchases();
  },

  async transactionIds(): Promise<string[]> {
    if (!IS_APPLE) throw unsupported();
    try {
      // onlyIncludeActiveItemsIOS: false is REQUIRED here. Our products are
      // non-renewing subscriptions: StoreKit has no idea when our periods end,
      // so it holds no "current entitlement" for them. Asking only for active
      // items would return an empty list on a device that has paid for
      // everything, and Restore would answer "nothing to restore" to a family
      // that is owed access.
      const raw = await getAvailablePurchases({
        onlyIncludeActiveItemsIOS: false,
        alsoPublishToEventListenerIOS: false,
      });
      const list = Array.isArray(raw) ? raw : [];
      return list
        .map((p) => toStorePurchase(p)?.transactionId ?? "")
        .filter((id) => id.length > 0);
    } catch (err) {
      throw toStoreError(err);
    }
  },
};

// ============================================================================
// GOOGLE PLAY BILLING (Android) — owner decision 2026-10-10
// ============================================================================
//
// The same seam, the same sequence, three Play-specific facts:
//
//   1. THE CHILD BINDING IS `obfuscatedAccountId`. Play's twin of StoreKit's
//      appAccountToken: an opaque string (at most 64 characters; our intent
//      uuid is 36) that Google stores on the purchase and returns to our server
//      from the Android Publisher API. The server checks it against the intent.
//
//   2. THE ID OUR SERVER VERIFIES IS THE `purchaseToken`, not the order id.
//      The token is what purchases.products.get/consume take; the order id
//      (GPA.…) is sent along for support and audit and may be missing on a
//      pending purchase.
//
//   3. FINISH = CONSUME, AND ONLY AFTER A GRANT. Our products are one-time
//      Play products bought again for every period and every sibling, so a
//      purchase must be CONSUMED before Play will sell the same SKU again. The
//      SERVER consumes after it grants (redeem, restore, RTDN). This file then
//      calls expo-iap's finishTransaction({ isConsumable: true }) as a SECOND,
//      idempotent attempt — see `finish` below for why that is safe and why
//      acknowledge-only would be wrong.
//
// Unknown or legacy payloads never crash the flow: every field is read
// defensively, and a payload we cannot read is ignored, not thrown.

/** Play's error vocabulary → the decisions this app makes. Shared codes map
 *  exactly as Apple's do; only AlreadyOwned is Play-specific. */
function kindFromGoogleCode(code: unknown): StoreFailureKind {
  if (code === ErrorCode.AlreadyOwned) return "alreadyOwned";
  return kindFromErrorCode(code);
}

function toGoogleError(err: unknown): StoreError {
  if (err instanceof StoreError) return err;
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  return new StoreError(kindFromGoogleCode(code));
}

function nonEmpty(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Reads a Play purchase without trusting any single field to exist. */
export function toGooglePurchase(raw: unknown): StorePurchase | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const productId = nonEmpty(o.productId) ?? "";
  const purchaseToken = nonEmpty(o.purchaseToken) ?? "";
  // On Android expo-iap carries the Play order id as `transactionId` (and as
  // `id` when there is one). Never confuse it with the token.
  const orderCandidate = nonEmpty(o.transactionId) ?? nonEmpty(o.id);
  const orderId = orderCandidate && orderCandidate !== purchaseToken ? orderCandidate : null;
  const state = o.purchaseState;
  return {
    transactionId: purchaseToken,
    productId,
    appAccountToken: nonEmpty(o.obfuscatedAccountIdAndroid),
    purchaseState:
      state === "pending" || state === "purchased" || state === "unknown" ? state : "unknown",
    orderId,
    raw,
  };
}

export const googleStore: IapStore = {
  finishOnlyWhenGranted: true,

  async connect() {
    if (!IS_GOOGLE) throw unsupported();
    if (connected) return;
    try {
      await initConnection();
      connected = true;
    } catch (err) {
      throw toGoogleError(err);
    }
  },

  async fetchProducts(productIds: string[]): Promise<StoreProduct[]> {
    if (!IS_GOOGLE) throw unsupported();
    if (productIds.length === 0) return [];
    try {
      // "in-app": our Play products are ONE-TIME products (consumed after
      // every grant), not Play subscriptions — nothing renews. Their
      // `displayPrice` is Play's formattedPrice for the buyer's country.
      const raw = await fetchProducts({ skus: productIds, type: "in-app" });
      const list = Array.isArray(raw) ? raw : [];
      return list.map(toStoreProduct).filter((p): p is StoreProduct => p !== null);
    } catch (err) {
      throw toGoogleError(err);
    }
  },

  buy({ productId, appAccountToken }): Promise<StorePurchase> {
    if (!IS_GOOGLE) return Promise.reject(unsupported());
    return new Promise<StorePurchase>((resolve, reject) => {
      let settled = false;
      const subs: { remove: () => void }[] = [];

      const cleanup = () => {
        for (const s of subs) {
          try {
            s.remove();
          } catch {
            // A listener that will not detach must not break the purchase.
          }
        }
      };
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        fn();
      };
      const timer = setTimeout(
        () => done(() => reject(new StoreError("timeout"))),
        BUY_TIMEOUT_MS,
      );

      // Play delivers the result through onPurchasesUpdated, which can carry
      // SEVERAL purchases. Only ours is taken: same SKU, and — when Play echoes
      // it — the same obfuscated account id, i.e. THIS intent. A purchase of
      // the same SKU made for a sibling is never redeemed against this child.
      const accept = (raw: unknown) => {
        const purchase = toGooglePurchase(raw);
        if (!purchase) return;
        if (purchase.productId !== productId) return;
        if (
          purchase.appAccountToken !== null &&
          !sameToken(purchase.appAccountToken, appAccountToken)
        ) {
          return;
        }
        done(() => resolve(purchase));
      };

      // Listeners first, for the same reason as on iOS: the result can arrive
      // before requestPurchase's own promise settles.
      try {
        subs.push(purchaseUpdatedListener(accept));
        subs.push(
          purchaseErrorListener((e) =>
            done(() => reject(new StoreError(kindFromGoogleCode(e?.code)))),
          ),
        );
      } catch (err) {
        done(() => reject(toGoogleError(err)));
        return;
      }

      requestPurchase({
        type: "in-app",
        request: {
          google: {
            skus: [productId],
            // THE CHILD BINDING. Our intent id, exactly as the server issued it.
            obfuscatedAccountId: appAccountToken,
          },
        },
      })
        .then((result) => {
          if (settled) return;
          const list = Array.isArray(result) ? result : result ? [result] : [];
          for (const item of list) {
            accept(item);
            if (settled) return;
          }
          // An empty result is not a failure: the listener or the timeout answers.
        })
        .catch((err) => done(() => reject(toGoogleError(err))));
    });
  },

  async finish(purchase: StorePurchase) {
    if (!IS_GOOGLE) throw unsupported();
    // CONSUME, NOT ACKNOWLEDGE. Called only after our server GRANTED (see
    // finishOnlyWhenGranted and purchaseFlow.ts), and the server has already
    // consumed the token by then. Why the device asks again anyway, and why
    // that is harmless — from expo-iap 5.5.0's own source:
    //
    //   * finishTransaction() on Android (src/index.ts, `finishTransaction`)
    //     reads purchase.purchaseToken and calls consumePurchaseAndroid(token)
    //     when isConsumable is true, acknowledgePurchaseAndroid(token)
    //     otherwise. Nothing else: no local bookkeeping, no listener event.
    //   * The native side (android/.../ExpoIapModule.kt,
    //     AsyncFunction("consumePurchaseAndroid")) forwards to Play's
    //     consumeAsync and REJECTS the promise on any failure.
    //
    // So a second consume of a token the server already consumed is answered
    // by Play with ITEM_NOT_OWNED, surfaces here as a rejected promise, and
    // purchaseFlow.ts swallows it — the entitlement already exists. If the
    // server's consume FAILED, this one succeeds, which is what we want: it
    // acknowledges the purchase (so Google does not auto-refund it after three
    // days) and releases the SKU so the parent can activate the same subject
    // and period again — next month, or for a sibling.
    //
    // Acknowledge-only would be WRONG for these products: an acknowledged but
    // unconsumed one-time product stays OWNED, and Play then refuses every
    // further purchase of that SKU on this Google account (ALREADY_OWNED).
    await finishTransaction({ purchase: purchase.raw as Purchase, isConsumable: true });
  },

  async sync() {
    if (!IS_GOOGLE) throw unsupported();
    // Play has no AppStore.sync() equivalent: getAvailablePurchases() is
    // itself a fresh query of Play. Nothing to do, and nothing to prompt.
  },

  async transactionIds(): Promise<string[]> {
    if (!IS_GOOGLE) throw unsupported();
    const items = await googleRestorable();
    return items.map((i) => i.transactionId);
  },

  async restorableItems(): Promise<RestoreItem[]> {
    if (!IS_GOOGLE) throw unsupported();
    return googleRestorable();
  },
};

/**
 * Every purchase Play still holds for this Google account — which, for our
 * consumable products, means every purchase NOT YET CONSUMED: exactly the ones
 * a grant may still be owed for. A consumed purchase has already been granted
 * (consumption happens only after a grant), and its access lives on the
 * child's record, not on this device.
 *
 * PENDING purchases are left out: no money has moved, the server would refuse
 * them, and Google's real-time notification settles them when they complete.
 */
async function googleRestorable(): Promise<RestoreItem[]> {
  try {
    const raw = await getAvailablePurchases();
    const list = Array.isArray(raw) ? raw : [];
    const items: RestoreItem[] = [];
    for (const entry of list) {
      const p = toGooglePurchase(entry);
      if (!p || p.transactionId.length === 0) continue;
      if (p.purchaseState === "pending") continue;
      items.push({ transactionId: p.transactionId, productId: p.productId || null });
    }
    return items;
  } catch (err) {
    throw toGoogleError(err);
  }
}

/** The store THIS build sells through: Apple on iOS, Google on Android. On any
 *  other platform it is Apple's object, whose every method refuses to run. */
export const platformStore: IapStore = IS_GOOGLE ? googleStore : appleStore;
