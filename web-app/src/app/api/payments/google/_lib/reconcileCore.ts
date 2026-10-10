// THE VOIDED-PURCHASE SWEEP for the Google Play rail. Pure, injected.
//
// WHY IT EXISTS. A refund or chargeback reaches us as a real-time developer
// notification — when Pub/Sub delivers it. When it does not (a misconfigured
// subscription, seven days of failed pushes), the money has gone back and the
// access stays. Google publishes every voided purchase of the last 30 days at
// purchases.voidedpurchases.list; this sweep reads it on a schedule and revokes
// every grant it names. Same refs, same entitlement_revoke as the notification
// path — never a second implementation.
//
// WHAT IT DOES NOT DO: grant. The Apple sweep also re-asks about unconsumed
// intents, because Apple's API is addressed by transaction id and the intent
// records it. A Play purchase is addressed by its purchase TOKEN, which this
// platform deliberately does not store, so a lost PURCHASED notification is
// recovered by the app (redeem on the next launch / restore), and — if neither
// happens — by Google itself, which refunds an unconsumed purchase after three
// days. That is a stated limitation, not an oversight.
//
// IDEMPOTENT: only refs that are still LIVE are revoked, so re-reading the same
// 30-day window every run touches nothing that was already handled.
import { candidateRefsForVoided } from "@/lib/payments/google/purchase";

/** Pages per run. 1000 voids a page; ten pages is far past this platform's volume. */
export const GOOGLE_RECONCILE_MAX_PAGES = 10;

export type GoogleReconcileSummary = {
  pages: number;
  /** Voided purchases Google listed in the window. */
  voided: number;
  /** Of those, the ones that matched a live grant here. */
  matched: number;
  /** Grants actually withdrawn this run. */
  revoked: number;
  /** Lookups or revokes that failed; asked again next run. */
  unresolved: number;
  /** True when Google could not be read at all. */
  failed: boolean;
};

export type VoidedItem = { readonly orderId: string | null; readonly purchaseToken: string | null };

export type GoogleReconcileDeps = {
  readonly listVoided: (
    pageToken: string | null,
  ) => Promise<{ ok: true; items: readonly VoidedItem[]; nextPageToken: string | null } | { ok: false }>;
  readonly findLiveRefs: (refs: readonly string[]) => Promise<string[] | null>;
  readonly revoke: (refs: readonly string[], reason: string) => Promise<number | null>;
};

export async function reconcileGoogleVoided(
  deps: GoogleReconcileDeps,
  maxPages: number = GOOGLE_RECONCILE_MAX_PAGES,
): Promise<GoogleReconcileSummary> {
  const summary: GoogleReconcileSummary = {
    pages: 0,
    voided: 0,
    matched: 0,
    revoked: 0,
    unresolved: 0,
    failed: false,
  };

  let pageToken: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const listed = await deps.listVoided(pageToken);
    if (!listed.ok) {
      summary.failed = true;
      break;
    }
    summary.pages++;
    summary.voided += listed.items.length;

    for (const item of listed.items) {
      const refs = candidateRefsForVoided(item);
      if (refs.length === 0) continue;
      const live = await deps.findLiveRefs(refs);
      if (live === null) {
        summary.unresolved++;
        continue;
      }
      if (live.length === 0) continue;
      summary.matched++;
      const taken = await deps.revoke(live, "google_voided_reconcile");
      if (taken === null) summary.unresolved++;
      else summary.revoked += taken;
    }

    if (!listed.nextPageToken) break;
    pageToken = listed.nextPageToken;
  }

  // Counts only — no order id, no token, no family.
  console.info(
    `[google] reconcile pages=${summary.pages} voided=${summary.voided} matched=${summary.matched} ` +
      `revoked=${summary.revoked} unresolved=${summary.unresolved} failed=${summary.failed}`,
  );
  return summary;
}
