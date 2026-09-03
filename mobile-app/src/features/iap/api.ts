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
import { bffIapIntent, bffIapRedeem, bffIapRestore } from "@/lib/api";
import type { IapApi } from "./types";

export const bffIapApi: IapApi = {
  async openIntent(studentProfileId: string, productId: string) {
    const res = await bffIapIntent(studentProfileId, productId);
    if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
    return { ok: true, data: { intent_id: res.data?.intent_id ?? "" } };
  },

  async redeem(intentId: string, transactionId: string) {
    const res = await bffIapRedeem(intentId, transactionId);
    if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
    const d = res.data;
    return {
      ok: true,
      data: d
        ? {
            granted: d.granted === true,
            already: d.already === true,
            message: typeof d.message === "string" ? d.message : undefined,
            ends_at: typeof d.ends_at === "string" ? d.ends_at : null,
          }
        : null,
    };
  },

  async restore(transactionIds: string[]) {
    const res = await bffIapRestore(transactionIds);
    if (!res.ok) return { ok: false, error: res.error, retryable: res.retryable };
    const d = res.data;
    return {
      ok: true,
      data: d
        ? {
            checked: typeof d.checked === "number" ? d.checked : 0,
            granted: typeof d.granted === "number" ? d.granted : 0,
          }
        : null,
    };
  },
};
