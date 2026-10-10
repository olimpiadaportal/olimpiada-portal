// RESTORE. Pure, like the purchase sequence, and for the same reason.
//
// APPLE REQUIRES A RESTORE CONTROL TO EXIST AND TO BE FINDABLE. Its absence is
// itself a rejection reason, so this path has to work on a device that has
// nothing to restore — and it must say so CALMLY. "Nothing to restore" is the
// ordinary answer for most taps; rendering it as an error would make a working
// app look broken to the one person who is definitely going to tap it: the
// reviewer.
//
// BOTH STORES (owner decision 2026-10-10). On Android "the device still
// remembers" means Play still holds the purchase UNCONSUMED — which is exactly
// the set a grant may still be owed for, because consumption only ever follows
// a grant. The server grants and consumes; this flow never consumes.
//
// NOTHING IS EVER FINISHED HERE. Restore's whole value is that the device still
// remembers the transaction; finishing one during a restore trades a family's
// recovery path for tidiness. The server is idempotent by construction
// (`entitlement_grant` upserts on (source, external_ref)), so restoring twenty
// times grants exactly what restoring once granted.
import type { IapApi, IapStore, RestoreItem, RestoreOutcome } from "./types";
import { displayableServerKey } from "./errorKeys";

/** The server caps at 25 and ignores the rest; sending fewer just finishes
 *  sooner. Deduplicated because StoreKit can list the same id twice. */
const MAX_IDS = 25;

export type RestoreFlowDeps = {
  store: IapStore;
  api: IapApi;
};

/** Runs one restore and NEVER throws. */
export async function runRestore(deps: RestoreFlowDeps): Promise<RestoreOutcome> {
  const { store, api } = deps;

  // AppStore.sync() may put up an Apple ID password prompt. It is BEST EFFORT:
  // a user who dismisses that prompt should still get whatever the device
  // already knows about, not an error.
  try {
    await store.sync();
  } catch {
    // Intentionally ignored — see above.
  }

  // Google's restore must name the product of every token, so a store that
  // can list its purchases WITH their products does; Apple's needs ids only.
  let items: RestoreItem[];
  try {
    items = store.restorableItems
      ? await store.restorableItems()
      : (await store.transactionIds()).map((transactionId) => ({
          transactionId,
          productId: null,
        }));
  } catch {
    // StoreKit itself is unreachable (Expo Go, a simulator with no store, a
    // device with purchases restricted). Nothing to say beyond "not now".
    return { status: "failed", messageKey: "mob.iap.err.unavailable" };
  }

  const byId = new Map<string, RestoreItem>();
  for (const item of items) {
    const id = item?.transactionId;
    if (typeof id !== "string" || id.length === 0 || byId.has(id)) continue;
    byId.set(id, item);
  }
  const uniqueItems = Array.from(byId.values()).slice(0, MAX_IDS);
  const unique = uniqueItems.map((i) => i.transactionId);

  // A device with no history is the COMMON case, not a failure. Answered
  // without a round trip so it is instant and cannot itself fail.
  if (unique.length === 0) return { status: "nothing" };

  let res: Awaited<ReturnType<IapApi["restore"]>>;
  try {
    res = await api.restore(unique, uniqueItems);
  } catch {
    return { status: "failed", messageKey: "mob.iap.err.generic" };
  }
  // See errorKeys.ts: a platform-state sentence must not reach a store binary.
  if (!res.ok) return { status: "failed", messageKey: displayableServerKey(res.error) };

  const granted = typeof res.data?.granted === "number" ? res.data.granted : 0;
  // granted === 0 with ids present means everything on this device was already
  // settled, refunded, or belongs to another family. From the parent's side
  // that is still "there was nothing to give back", and it is the truth.
  return granted > 0 ? { status: "restored", granted } : { status: "nothing" };
}
