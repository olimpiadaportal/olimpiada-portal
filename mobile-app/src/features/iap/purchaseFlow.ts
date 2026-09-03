// THE PURCHASE SEQUENCE. Pure: no react, no react-native, no expo-iap.
//
// THE ORDER IS THE PRODUCT. Every step exists because doing it later loses
// something that cannot be recovered:
//
//   1. INTENT FIRST. `iap_purchase_intents.id` is the appAccountToken, and it is
//      the ONLY thing that says which CHILD an Apple purchase was for. An Apple
//      purchase attaches to an APPLE ID; a parent buying maths for three
//      children from one Apple ID produces three otherwise indistinguishable
//      transactions. Opening the sheet before the intent exists means there is
//      no token to attach, forever.
//   2. BUY, carrying that token.
//   3. REDEEM — our server asks Apple about the transaction itself and grants.
//   4. FINISH, and ONLY here. `finishTransaction` tells StoreKit the purchase is
//      settled and StoreKit stops replaying it. Finishing before our server has
//      acknowledged the transaction throws away the last local copy of a payment
//      we have not recorded: if the app dies in between, the money is gone and
//      nothing on the device remembers it.
//
// THE RULE THAT FALLS OUT OF (4): FINISH ONLY WHEN THE SERVER ANSWERED OK.
// A redeem that fails — for ANY reason, including a settled refusal such as
// "this payment was refunded" — leaves the transaction UNFINISHED on purpose.
// An unfinished transaction is recoverable three separate ways (Restore, the
// App Store Server Notification, the reconcile sweep); a finished-but-ungranted
// one is recoverable by none of them. Queue hygiene is worth less than a
// family's money.
import type {
  IapApi,
  IapStore,
  PurchaseOutcome,
  PurchaseStep,
  StorePurchase,
} from "./types";
import { storeFailureKind } from "./types";
import { displayableServerKey } from "./errorKeys";

/** i18n key for a StoreKit refusal that happened BEFORE any money moved. */
export function storeErrorKey(kind: ReturnType<typeof storeFailureKind>): string {
  switch (kind) {
    case "notAllowed":
      return "mob.iap.err.notAllowed";
    case "unavailable":
      return "mob.iap.err.unavailable";
    default:
      // Deliberately generic. The specific StoreKit code is a developer fact and
      // means nothing to a parent; the house rule is one translated sentence.
      return "mob.iap.err.generic";
  }
}

export type PurchaseFlowDeps = {
  store: IapStore;
  api: IapApi;
  productId: string;
  studentProfileId: string;
  /** Ordered trace. Tests assert on it; dev builds log it. */
  onStep?: (step: PurchaseStep) => void;
};

/**
 * Runs one purchase attempt end to end and NEVER throws. Every branch resolves
 * to a PurchaseOutcome, because the one thing a caller must not have to do is
 * guess what an exception means while a charge is in flight.
 */
export async function runPurchase(deps: PurchaseFlowDeps): Promise<PurchaseOutcome> {
  const { store, api, productId, studentProfileId, onStep } = deps;

  // ---- 1. INTENT -----------------------------------------------------------
  // Before the sheet. Nothing is charged if this fails, so a refusal here is a
  // plain, honest failure — including the server's own double-billing guard
  // ("this child already has it"), which is the ONLY moment a second charge for
  // something already owned can still be prevented.
  onStep?.("intent");
  let intentId: string;
  try {
    const res = await api.openIntent(studentProfileId, productId);
    // displayableServerKey, not res.error: the platform kill switch answers
    // `gate.paymentsOff`, which is the exact sentence Apple rejected this app
    // over. The refusal stands; only its wording is neutralised.
    if (!res.ok) return { status: "failed", messageKey: displayableServerKey(res.error) };
    const id = res.data?.intent_id;
    if (typeof id !== "string" || id.length === 0) {
      return { status: "failed", messageKey: "mob.iap.err.generic" };
    }
    intentId = id;
  } catch {
    return { status: "failed", messageKey: "mob.iap.err.generic" };
  }

  // ---- 2. BUY --------------------------------------------------------------
  onStep?.("buy");
  let purchase: StorePurchase;
  try {
    purchase = await store.buy({ productId, appAccountToken: intentId });
  } catch (err) {
    const kind = storeFailureKind(err);
    // A CANCEL IS NOT AN ERROR. The user closed a sheet they opened; showing
    // them a message for that is how an app feels broken. Silently back to the
    // screen. The intent row is simply never used and expires.
    if (kind === "cancelled") return { status: "cancelled" };
    // Ask-to-Buy: the guardian has to approve. No money has moved and the
    // transaction arrives later — Restore and the notification both pick it up.
    if (kind === "deferred") return { status: "deferred" };
    // WE STOPPED WAITING, SO WE DO NOT KNOW. Treated as `pending`, not
    // `failed`: a false "recorded, it will appear shortly" costs a family a
    // little confusion, a false "it failed" after a real charge costs them the
    // money and us the trust.
    if (kind === "timeout") return { status: "pending", detailKey: null };
    return { status: "failed", messageKey: storeErrorKey(kind) };
  }

  // Ask-to-Buy can also arrive as a real-but-unpaid transaction. It has no
  // settled id to redeem, and finishing it would discard the pending request.
  if (purchase.purchaseState === "pending") return { status: "deferred" };

  if (typeof purchase.transactionId !== "string" || purchase.transactionId.length === 0) {
    // A transaction with no id cannot be redeemed and must not be finished:
    // Restore reads it off the device later and settles it then.
    return { status: "pending", detailKey: null };
  }

  // ---- 3. REDEEM -----------------------------------------------------------
  // From here on money has moved. There is no failure branch below that says
  // "failed".
  onStep?.("redeem");
  let redeemed: Awaited<ReturnType<IapApi["redeem"]>>;
  try {
    redeemed = await api.redeem(intentId, purchase.transactionId);
  } catch {
    return { status: "pending", detailKey: null };
  }

  if (!redeemed.ok) {
    // NOT FINISHED. See the header. `detailKey` carries the server's own
    // translated sentence when it made a settled judgement (refunded, already
    // used for another child); a transport failure gets no detail because
    // "network error" under a real charge reads as "your money is gone".
    const settled = redeemed.retryable === false;
    return {
      status: "pending",
      detailKey: settled ? displayableServerKey(redeemed.error) : null,
    };
  }

  // ---- 4. FINISH -----------------------------------------------------------
  // The server acknowledged this transaction, whether or not it produced
  // access. `granted: false` is the SANDBOX answer (App Review buys in sandbox
  // against this same deployment): verified, genuine, and structurally unable to
  // create real access. It is settled, so StoreKit may stop replaying it.
  onStep?.("finish");
  try {
    await store.finish(purchase);
  } catch {
    // Finishing failed AFTER a successful grant. Harmless: the entitlement
    // exists, and StoreKit will simply offer the transaction again. Never
    // downgrade a granted purchase to an error because of this.
  }

  const data = redeemed.data;
  if (data && data.granted === true) {
    return {
      status: "granted",
      already: data.already === true,
      endsAt: typeof data.ends_at === "string" ? data.ends_at : null,
    };
  }
  return {
    status: "recorded",
    messageKey:
      data && typeof data.message === "string" && data.message.length > 0
        ? data.message
        : "iap.msg.recorded",
  };
}
