// LOST-CALLBACK RECONCILIATION — SERVER ONLY, WEB ONLY.
//
// WHY THIS EXISTS. The whole payment design turns on one POST: the gateway's
// BACKREF callback is what makes us go and ask TRTYPE=90, record the money and
// redeem the intent into a plan. When that POST never arrives — a deploy in the
// wrong second, a network partition, a bank-side retry that lands nowhere — the
// family is CHARGED and we have no record, no plan and no alarm. Nothing in the
// platform notices, because nothing was ever told.
//
// THE WINDOW IS 24 HOURS AND THEN IT IS GONE. The gateway answers a status
// query about an order for one day (STATUS_QUERY_WINDOW_HOURS). After that the
// only evidence left is on a settlement report and in a support ticket. That is
// the entire reason this runs on a schedule rather than on demand.
//
// IT IS THE CALLBACK'S OWN PATH, MINUS THE CALLBACK. Same status query, same
// `recordOutcome`, same `checkout_redeem_plan`. Deliberately not a second
// implementation of "money becomes a plan": the guarantees that matter — the
// row lock, `status = 'paid'` required, the re-price against the amount the
// gateway confirmed, `redeemed_at` written in the same transaction as the apply
// — live in that SQL function and cannot be weakened from here.
//
// WHAT IT WILL NOT DO
//
//   * It never grants on an unreconciled answer. A status query that fails, or
//     one whose answer does not match our order/amount/terminal/currency, is
//     recorded exactly as the callback path records it — as NOT approved — and
//     the session stays pending for the next pass.
//   * It never decides a payment succeeded from anything but the gateway's own
//     answer to a query WE initiated.
//   * It leaves anything it cannot settle alone, so 013 check 118 keeps
//     reporting it. `checkout_redeem_plan` owns the `needs_review` verdict; this
//     module does not invent one.
//   * It is not reachable from a user session of any kind, and nothing under
//     app/api/mobile imports it.
import "server-only";
import { getAzericardConfig } from "@/lib/payments/azericard/config";
import { queryTransactionStatus } from "@/lib/payments/azericard/gateway";
import { formatAmount, isValidOrder } from "@/lib/payments/azericard/format";
import {
  findSessionByOrder,
  recordOutcome,
  PLAN_CHECKOUT_KIND,
  PROVIDER,
} from "@/lib/payments/azericard/store";
import { redeemPlanCheckout } from "@/lib/payments/checkoutIntent";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

/**
 * How many sessions one pass may touch.
 *
 * Each candidate costs one outbound status query, so the batch is what bounds
 * both the run time and the load we put on the acquirer. A backlog is drained
 * across passes rather than in one; the schedule is minutes, and the window is
 * a day.
 */
export const RECONCILE_BATCH = 25;

export type ReconcileSummary = {
  /** Pending intents we asked the gateway about. */
  queried: number;
  /** Of those, the ones the gateway confirmed and we recorded as paid. */
  settled: number;
  /** Redemptions that applied a plan (from either half of the sweep). */
  applied: number;
  /** Sessions left exactly as they were, for the next pass or for a human. */
  unresolved: number;
};

/**
 * One reconciliation pass.
 *
 * Two halves, in this order because the first produces work for the second:
 *   1. PENDING intents inside the gateway's 24-hour window — ask, record, and
 *      redeem the ones that turn out to have been paid.
 *   2. Sessions the ledger ALREADY says are paid whose redemption never ran.
 *      No network; this is the half that also finishes a `plan_start` whose
 *      8-digit login ID needs the Supabase Auth admin call that SQL cannot make
 *      (which is exactly what the pg_cron backstop skips).
 *
 * Idempotent throughout: every write underneath is keyed —
 * `payments` UNIQUE(provider, provider_ref), `payment_events`
 * UNIQUE(provider, event_id), and `checkout_sessions.redeemed_at` as the
 * redeem-once claim. Two overlapping passes, or a pass overlapping a genuine
 * callback, converge on the same row rather than racing to write two.
 */
export async function reconcilePendingCheckouts(
  batch: number = RECONCILE_BATCH,
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { queried: 0, settled: 0, applied: 0, unresolved: 0 };
  if (!isServiceRoleConfigured) return summary;

  const config = getAzericardConfig();
  if (!config) {
    // Not configured is an operator problem, not a payer's. Ask nothing.
    console.error("[azericard] reconciliation skipped: gateway not configured");
    return summary;
  }

  // ---- 1. Pending intents: we do not know what happened, so ask -----------
  for (const order of await listReconcileCandidates(batch)) {
    const session = await findSessionByOrder(order);
    // Re-read rather than trusting the list: a callback may have settled this
    // row in the seconds since, and asking about a decided payment is at best
    // wasted and at worst a second transaction to reason about.
    if (!session || session.status !== "pending" || session.redeemedAt) {
      summary.unresolved++;
      continue;
    }
    const expectedAmount = session.amount === null ? null : formatAmount(session.amount);
    if (!expectedAmount || session.currency !== config.currency) {
      console.error("[azericard] reconciliation skipped a session it cannot express");
      summary.unresolved++;
      continue;
    }

    summary.queried++;
    const status = await queryTransactionStatus({
      order: session.order,
      expectation: {
        order: session.order,
        terminal: config.terminal,
        amount: expectedAmount,
        currency: session.currency,
        // NO rrn / intRef. There was no signed callback — that is the whole
        // problem being solved — so the answer is matched on our order, our
        // terminal, our amount and our currency, which is what we hold. The
        // reference check the callback path adds is a STRONGER test we simply
        // do not have the inputs for here, not one being skipped.
      },
    });
    if (!status.ok) {
      // Could not establish what happened. Explicitly NOT a reason to assume
      // anything: leave it pending and let the next pass, or a late callback,
      // settle it while the window is still open.
      console.error(`[azericard] reconciliation status query failed: ${status.error}`);
      summary.unresolved++;
      continue;
    }

    const recorded = await recordOutcome({
      session,
      // No callback exists. recordOutcome decides from `reconciliation` only, so
      // this changes what is written into the audit copy and nothing else.
      shape: null,
      reconciliation: status.reconciliation,
      statusMeta: {
        queried: true,
        format: status.parsed.format,
        unrecognisedCount: status.parsed.unrecognisedCount,
      },
    });
    if (!recorded.ok || recorded.outcome !== "approved") {
      summary.unresolved++;
      continue;
    }
    summary.settled++;

    // The money is real and now recorded. Deliver what it bought — but only for
    // a plan checkout; the owner's protocol test carries no intent and
    // `checkout_redeem_plan` answers 'no_intent' for it rather than improvising.
    if (session.kind !== PLAN_CHECKOUT_KIND) continue;
    if ((await redeemPlanCheckout(session.order)) === "applied") summary.applied++;
    else summary.unresolved++;
  }

  // ---- 2. Paid, never redeemed: the missing step, no network needed --------
  for (const order of await listPaidUnredeemedOrders(batch)) {
    const outcome = await redeemPlanCheckout(order);
    if (outcome === "applied") summary.applied++;
    else summary.unresolved++;
  }

  // Counts only. No order id, no amount, no family — a scheduled job's log is a
  // place identifiers accumulate, and this one runs every few minutes forever.
  console.info(
    `[azericard] reconciliation queried=${summary.queried} settled=${summary.settled} ` +
      `applied=${summary.applied} unresolved=${summary.unresolved}`,
  );
  return summary;
}

// ---------------------------------------------------------------------------
// The work lists
// ---------------------------------------------------------------------------
//
// They live HERE rather than beside the other checkout_sessions readers in
// lib/payments/azericard/store, because that module speaks the PROTOCOL and is
// asserted free of every `.rpc(` call (azericard/__tests__/invariants.test.ts):
// an RPC from the protocol layer is how a ledger writer quietly becomes a grant
// path. Two lists, because the two halves need different work:
//
//   listReconcileCandidates()   PENDING intents — we do not know what happened
//                               and have to ASK the gateway.
//   listPaidUnredeemedOrders()  the ledger already says PAID and the redemption
//                               never ran. No network, just the missing step.
//
// Neither decides anything. They name orders; the sweep does the asking, and
// `recordOutcome` / `checkout_redeem_plan` do everything that has consequences.

/**
 * Orders worth asking the gateway about, newest-relevant first.
 *
 * The window (inside 24 hours, at least 5 minutes old) is applied in SQL by
 * `checkout_reconcile_candidates` rather than here, so the job's definition of
 * "worth asking about" lives beside the table it describes and a second caller
 * cannot get it subtly wrong.
 */
async function listReconcileCandidates(limit: number): Promise<string[]> {
  if (!isServiceRoleConfigured) return [];
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("checkout_reconcile_candidates", {
    p_limit: clampSweepLimit(limit),
  });
  if (error) {
    console.error("[azericard] reconcile candidate query failed", error.code ?? "unknown");
    return [];
  }
  return (Array.isArray(data) ? data : [])
    .map((row) => (row as { provider_order?: unknown }).provider_order)
    .filter((o): o is string => typeof o === "string" && isValidOrder(o));
}

/**
 * Orders whose money is recorded and whose plan was never delivered.
 *
 * The five-minute floor keeps this from racing a callback whose own redeem step
 * is still in flight — that is the ordinary case, not a fault, and sweeping it
 * would only contend on the row lock `checkout_redeem_plan` takes.
 *
 * The pg_cron backstop (`checkout_redeem_sweep`) covers most of these without a
 * web app running at all; this list additionally carries the ones SQL cannot
 * finish, where a fresh 8-digit login ID still needs the Supabase Auth admin
 * call that only this process can make.
 */
async function listPaidUnredeemedOrders(limit: number): Promise<string[]> {
  if (!isServiceRoleConfigured) return [];
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("checkout_sessions")
    .select("provider_session_id")
    .eq("provider", PROVIDER)
    .eq("status", "paid")
    .not("intent_kind", "is", null)
    .is("redeemed_at", null)
    .lt("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(clampSweepLimit(limit));
  if (error) {
    console.error("[azericard] unredeemed query failed", error.code ?? "unknown");
    return [];
  }
  return (data ?? [])
    .map((row) => (row as { provider_session_id?: unknown }).provider_session_id)
    .filter((o): o is string => typeof o === "string" && isValidOrder(o));
}

/** A sweep batch is bounded on both sides; an unbounded one is an outage. */
function clampSweepLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.floor(limit), 1), 200);
}
