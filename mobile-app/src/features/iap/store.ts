// THE ONLY FILE IN THIS APP THAT TOUCHES StoreKit.
//
// ONE SEAM, ON PURPOSE. Everything else — screens, flows, hooks — talks to the
// `IapStore` interface in ./types. That buys three things worth the indirection:
//   * ANDROID HAS EXACTLY ONE THING TO EXCLUDE. The app is purchase-silent on
//     Android by store policy (Google's consumption-only test is app-wide, and
//     the parent tabs share the binary with the child). Every entry point here
//     refuses to run unless Platform.OS === "ios", so an Android build cannot
//     reach StoreKit even by mistake.
//   * The purchase SEQUENCE is testable without a native module (see
//     purchaseFlow.ts / restoreFlow.ts, which import nothing from here).
//   * A future Google rail is a second file implementing the same interface,
//     not a second set of call sites.
//
// IMPORT SAFETY. expo-iap resolves its native module lazily behind a Proxy
// (build/ExpoIapModule.js), so importing this file on Android, or in Expo Go
// where the native module does not exist, does NOT throw — only CALLING would,
// and every call below is guarded and wrapped. That property is load-bearing:
// an import-time crash here would take down the whole app on the owner's
// Android test device.
//
// NO PRICE IS COMPUTED, PARSED OR FORMATTED IN THIS FILE. displayPrice comes out
// of StoreKit already localised, already in the viewer's storefront currency,
// and is passed through as an opaque string.
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
  type StoreProduct,
  type StorePurchase,
} from "./types";
import { IAP_PLATFORM_SUPPORTED } from "./platform";

export { IAP_PLATFORM_SUPPORTED };

/**
 * How long we wait for the store sheet before we stop believing an answer is
 * coming. Generous: Face ID, a password prompt, a card update and a slow
 * network all happen inside this window, and the cost of being wrong is a
 * hedged "we could not confirm" instead of a settled outcome. A promise with no
 * timeout at all is worse — that is the spinner that never ends.
 */
const BUY_TIMEOUT_MS = 5 * 60_000;

function unsupported(): StoreError {
  return new StoreError("unavailable", "iap is ios-only in this build");
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
    if (!IAP_PLATFORM_SUPPORTED) throw unsupported();
    if (connected) return;
    try {
      await initConnection();
      connected = true;
    } catch (err) {
      throw toStoreError(err);
    }
  },

  async fetchProducts(productIds: string[]): Promise<StoreProduct[]> {
    if (!IAP_PLATFORM_SUPPORTED) throw unsupported();
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
    if (!IAP_PLATFORM_SUPPORTED) return Promise.reject(unsupported());
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
    if (!IAP_PLATFORM_SUPPORTED) throw unsupported();
    // The UNTOUCHED StoreKit payload goes back, not our reduced view of it:
    // expo-iap reads fields off it that StorePurchase deliberately does not
    // carry. isConsumable stays false — on iOS this is a plain
    // Transaction.finish() and the flag only branches on Android, which never
    // reaches this file.
    await finishTransaction({ purchase: purchase.raw as Purchase, isConsumable: false });
  },

  async sync() {
    if (!IAP_PLATFORM_SUPPORTED) throw unsupported();
    // May put up an Apple ID password prompt. Callers treat a rejection as
    // non-fatal — see restoreFlow.ts.
    await restorePurchases();
  },

  async transactionIds(): Promise<string[]> {
    if (!IAP_PLATFORM_SUPPORTED) throw unsupported();
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
