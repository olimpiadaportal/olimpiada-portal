// The BFF side of the seam: src/lib/api.ts calls reshaped into the small
// `IapApi` surface the two flows depend on.
//
// WHY A RESHAPE AND NOT THE RAW CLIENT. `runPurchase`/`runRestore` are the part
// of this rail that must be provable without a device, so they depend on the
// narrowest possible interface — three methods, plain data in and out. This file
// is where the real transport is bolted on, and it is the only place either flow
// learns that a network exists.
//
// Errors arrive as i18n KEYS in the standard {error, retryable} envelope and are
// passed through untouched: the server already decided what a parent should be
// told, in all three languages, and re-deciding it here is how two surfaces
// start disagreeing about the same refusal.
//
// TWO ADAPTERS, ONE SHAPE. `appleIapApi` talks to /iap/apple/*, `googleIapApi`
// to /iap/google/* (owner decision 2026-10-10). The flows never learn which one
// they hold; rail.ts picks by the build's store.
import {
  bffGoogleIapIntent,
  bffGoogleIapRedeem,
  bffGoogleIapRestore,
  bffIapIntent,
  bffIapRedeem,
  bffIapRestore,
  type IapRedeemResult,
} from "@/lib/api";
import type { IapApi } from "./types";

/** The redeem payload both routes return, narrowed to what the flow reads. */
function redeemData(d: IapRedeemResult | null | undefined) {
  return d
    ? {
        granted: d.granted === true,
        already: d.already === true,
        message: typeof d.message === "string" ? d.message : undefined,
        ends_at: typeof d.ends_at === "string" ? d.ends_at : null,
      }
    : null;
}

function restoreData(d: { checked?: unknown; granted?: unknown } | null | undefined) {
  return d
    ? {
        checked: typeof d.checked === "number" ? d.checked : 0,
        granted: typeof d.granted === "number" ? d.granted : 0,
      }
    : null;
}

export const appleIapApi: IapApi = {
  async openIntent(studentProfileId: string, productId: string) {
    const res = await bffIapIntent(studentProfileId, productId);
    if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
    return { ok: true, data: { intent_id: res.data?.intent_id ?? "" } };
  },

  async redeem(intentId: string, transactionId: string) {
    const res = await bffIapRedeem(intentId, transactionId);
    if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
    return { ok: true, data: redeemData(res.data) };
  },

  async restore(transactionIds: string[]) {
    const res = await bffIapRestore(transactionIds);
    if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
    return { ok: true, data: restoreData(res.data) };
  },
};

export const googleIapApi: IapApi = {
  async openIntent(studentProfileId: string, productId: string) {
    const res = await bffGoogleIapIntent(studentProfileId, productId);
    if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
    return { ok: true, data: { intent_id: res.data?.intent_id ?? "" } };
  },

  async redeem(intentId, purchaseToken, context) {
    // The flow always passes the context on this rail. Without a product the
    // server cannot ask Google about the token, so the call is not made and
    // the purchase stays unconsumed — Restore (which names products) settles it.
    const productId = context?.productId ?? "";
    if (productId.length === 0) {
      return { ok: false, error: "iap.err.generic", retryable: true };
    }
    const res = await bffGoogleIapRedeem(
      intentId,
      productId,
      purchaseToken,
      context?.orderId ?? null,
    );
    if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
    return { ok: true, data: redeemData(res.data) };
  },

  async restore(_purchaseTokens, items) {
    // A token Play listed without a product cannot be verified; it is left
    // out rather than sent half-formed.
    const purchases = (items ?? [])
      .filter((i) => typeof i.productId === "string" && i.productId.length > 0)
      .map((i) => ({ product_id: i.productId as string, purchase_token: i.transactionId }));
    if (purchases.length === 0) return { ok: true, data: { checked: 0, granted: 0 } };
    const res = await bffGoogleIapRestore(purchases);
    if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
    return { ok: true, data: restoreData(res.data) };
  },
};
