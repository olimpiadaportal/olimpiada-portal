// THE MISSED-NOTIFICATION SWEEP for the Apple rail.
//
// WHY IT EXISTS. The whole grant path turns on one POST from Apple. When that
// POST never arrives — a deploy in the wrong second, a network partition, a
// notification Apple simply drops — the family is CHARGED and has no access, and
// nothing in the platform notices, because nothing was ever told. That is the
// same hole `lib/payments/reconcileCore.ts` fills for the bank, and it is filled
// the same way: on a schedule, ask the provider ourselves, act only on the
// answer.
//
// IT IS THE NOTIFICATION PATH MINUS THE NOTIFICATION. Same re-query, same
// catalogue lookup, same `toAppleGrant`, same `requireProductionGrant`, same
// shared writer. Deliberately not a second implementation of "money becomes
// access": the guarantees that matter — the intent that says which child, the
// expiry we compute, the idempotency key — live in those functions and cannot be
// weakened from here.
//
// ----------------------------------------------------- WHAT IT CANNOT DO, SAID
// THE APP STORE SERVER API IS ADDRESSED BY TRANSACTION ID. There is no endpoint
// that takes an appAccountToken. So an intent that never recorded a transaction
// id is one we have literally no way to ask Apple a question about: the tap
// happened, and either the store sheet was dismissed (the overwhelming majority)
// or a purchase completed and its id never reached us. This sweep counts those
// rows as `unattributable` and leaves them alone. It is a real limitation, not a
// shortcut — the fix is upstream, in the redeem endpoint recording the id the
// instant StoreKit hands it up, which is exactly the asymmetry migration 164
// built into `ck_iap_intent_txn_required`.
//
// EXPIRY IS NOT A GATE HERE, AND MUST NEVER BECOME ONE.
// `iap_purchase_intents.expires_at` is a STALENESS MARKER: StoreKit delivers
// interrupted purchases, Ask-to-Buy approvals and offline-queued transactions
// hours or days late, and refusing one of those would take the family's money
// and hand back nothing. The candidate query does not look at it and this file
// does not either.
import {
  isRevoked,
  type TransactionSource,
  type VerifiedTransaction,
} from "@/lib/payments/apple";
import type { AppleWriteResult } from "@/lib/payments/apple/grantEntitlement";
import { appleExternalRef } from "./externalRef";
import type { PendingIntent } from "./store";
import type { TransactionInfoResult } from "./notificationCore";

/**
 * How many intents one pass may touch.
 *
 * Each candidate costs one outbound call to Apple, so the batch bounds both the
 * run time and the load we put on the App Store Server API. A backlog drains
 * across passes rather than in one; the schedule is minutes.
 */
export const APPLE_RECONCILE_BATCH = 25;

export type AppleReconcileSummary = {
  /** Intents with a known transaction that were never consumed. */
  candidates: number;
  /** Of those, the ones we managed to ask Apple about. */
  queried: number;
  /** Purchases Apple confirmed and that are now real access. */
  granted: number;
  /**
   * Purchases Apple reports as refunded or revoked, whose access we have now
   * taken away. Non-zero here means a REFUND notification was dropped — the
   * expensive direction of a lost message, and the reason this pass revokes as
   * well as grants.
   */
  revoked: number;
  /** Left exactly as they were, for the next pass or for a person. */
  unresolved: number;
  /**
   * Unconsumed intents carrying NO transaction id. Nothing can be asked about
   * them (see the header). Reported so that a number which starts climbing is
   * visible rather than silent.
   */
  unattributable: number;
};

export type ReconcileDeps = {
  readonly listCandidates: (limit: number) => Promise<PendingIntent[]>;
  readonly countUnattributable: () => Promise<number>;
  readonly getTransactionInfo: (transactionId: string) => Promise<TransactionInfoResult>;
  readonly verifyTransaction: (
    signed: string,
    source: TransactionSource,
  ) => Promise<VerifiedTransaction<"Production"> | null>;
  readonly revoke: (externalRef: string, reason: string) => Promise<boolean>;
  /**
   * THE SHARED WRITE PATH — the same `grantAppleEntitlement` the notification
   * consumer and the redeem route call. It owns the catalogue lookup, the
   * expiry, the child behind the appAccountToken and the crossing from
   * "verified" to "may create access"; this sweep owns only WHICH transactions
   * to ask about.
   */
  readonly write: (transaction: VerifiedTransaction<"Production">) => Promise<AppleWriteResult>;
};

/**
 * One reconciliation pass.
 *
 * PRODUCTION RAIL ONLY. There is nothing for the sandbox rail to reconcile —
 * a sandbox transaction cannot become access on any path, so a sweep for it
 * would be a loop that always decides nothing.
 *
 * Idempotent throughout: the write underneath is an upsert on
 * (source, external_ref) and the revoke only touches rows whose `revoked_at` is
 * null, so a pass overlapping a genuine notification converges on the same row
 * rather than racing to write two.
 */
export async function reconcileAppleIntents(
  deps: ReconcileDeps,
  batch: number = APPLE_RECONCILE_BATCH,
): Promise<AppleReconcileSummary> {
  const summary: AppleReconcileSummary = {
    candidates: 0,
    queried: 0,
    granted: 0,
    revoked: 0,
    unresolved: 0,
    unattributable: 0,
  };

  const candidates = await deps.listCandidates(batch);
  summary.candidates = candidates.length;

  for (const intent of candidates) {
    // ---- Ask Apple, and believe only that -------------------------------
    const envelope = await deps.getTransactionInfo(intent.originalTransactionId);
    if (!envelope.ok) {
      // Could not establish what happened. Explicitly NOT a reason to assume
      // anything in either direction: leave it and ask again next pass.
      summary.unresolved++;
      continue;
    }
    const transaction = await deps.verifyTransaction(envelope.signedTransactionInfo, "requery");
    if (!transaction) {
      summary.unresolved++;
      continue;
    }
    summary.queried++;

    // ---- Money that went back ------------------------------------------
    if (isRevoked(transaction.payload)) {
      const originalId = transaction.payload.originalTransactionId ?? intent.originalTransactionId;
      const taken = await deps.revoke(
        appleExternalRef("Production", originalId),
        "apple_refund_reconcile",
      );
      if (taken) summary.revoked++;
      else summary.unresolved++;
      continue;
    }

    // ---- Deliver what Apple confirms ------------------------------------
    //
    // The writer decides everything about WHAT was bought — the catalogue
    // lookup, the expiry, the child behind the appAccountToken, and the one
    // crossing from "verified" to "may create access". Repeating any of it here
    // would be a second implementation of the rule that decides how much access
    // a payment buys, and the second one is only discovered when it disagrees.
    const written = await deps.write(transaction);
    if (written.ok && written.granted) {
      summary.granted++;
    } else {
      // Every refusal is left for the next pass or for a person: an unknown
      // product, a deleted child and a transient RPC fault are all "still not
      // delivered", and the intent stays unconsumed so this row comes back.
      if (!written.ok) {
        console.error(`[apple] reconcile could not deliver a purchase: ${written.reason}`);
      }
      summary.unresolved++;
    }
  }

  summary.unattributable = await deps.countUnattributable();

  // Counts only. No intent id, no transaction id, no family — a scheduled job's
  // log is where identifiers accumulate, and this one runs forever.
  console.info(
    `[apple] reconcile candidates=${summary.candidates} queried=${summary.queried} ` +
      `granted=${summary.granted} revoked=${summary.revoked} ` +
      `unresolved=${summary.unresolved} unattributable=${summary.unattributable}`,
  );
  return summary;
}
