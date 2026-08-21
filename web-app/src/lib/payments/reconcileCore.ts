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
// AND, SINCE MIGRATION 127, A SECOND QUESTION THE CALLBACK NEVER ASKS. A
// payment REVERSED at the bank is invisible to the ordinary status query: it
// answers about the AUTHORISATION, which stays `Approved` forever. Only a query
// carrying TRAN_TRTYPE=22 mentions the reversal at all — learned from the live
// test on 2026-08-21, not from the spec — so without the third pass below the
// family's money went back and their entitlement stayed live.
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
import {
  queryReversalStatus,
  queryTransactionStatus,
  TRTYPE,
} from "@/lib/payments/azericard/gateway";
import { classifyReversalAnswer } from "@/lib/payments/azericard/statusResponse";
import { formatAmount, isValidOrder } from "@/lib/payments/azericard/format";
import {
  findSessionByOrder,
  recordOutcome,
  PROVIDER,
} from "@/lib/payments/azericard/store";
import { flagCheckoutForReview, redeemPlanCheckout } from "@/lib/payments/checkoutIntent";
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
  /** Redemptions that applied a plan or a package (from either half of the sweep). */
  applied: number;
  /**
   * Settled payments the gateway says were REVERSED, whose producers we have
   * now revoked (migration 127). Money returned with access still standing is
   * the one state a status query could never reveal before, because the ordinary
   * TRAN_TRTYPE=1 query reports the original authorisation as approved forever.
   */
  reversed: number;
  /**
   * Reversal answers we could not classify, left EXACTLY as they were and put
   * in front of a person. Separate from `unresolved` because it is a different
   * problem: not "we have not settled this yet" but "the gateway said something
   * about money that we do not understand".
   */
  unreadable: number;
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
  const summary: ReconcileSummary = {
    queried: 0,
    settled: 0,
    applied: 0,
    reversed: 0,
    unreadable: 0,
    unresolved: 0,
  };
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

    // The money is real and now recorded. Deliver what it bought — a plan or,
    // since migration 127, an olympiad package. The test is the INTENT, not the
    // kind: carrying one is exactly what makes a session redeemable, and the
    // owner's protocol test is the thing that lacks it (`checkout_redeem_plan`
    // answers 'no_intent' for it rather than improvising).
    if (!session.intentKind) continue;
    if ((await redeemPlanCheckout(session.order)) === "applied") summary.applied++;
    else summary.unresolved++;
  }

  // ---- 2. Paid, never redeemed: the missing step, no network needed --------
  for (const order of await listPaidUnredeemedOrders(batch)) {
    const outcome = await redeemPlanCheckout(order);
    if (outcome === "applied") summary.applied++;
    else summary.unresolved++;
  }

  // ---- 3. Settled, then REVERSED at the bank -------------------------------
  const reversals = await sweepReversals(batch, config.terminal);
  summary.reversed = reversals.reversed;
  summary.unreadable = reversals.unreadable;

  // Counts only. No order id, no amount, no family — a scheduled job's log is a
  // place identifiers accumulate, and this one runs every few minutes forever.
  console.info(
    `[azericard] reconciliation queried=${summary.queried} settled=${summary.settled} ` +
      `applied=${summary.applied} reversed=${summary.reversed} ` +
      `unreadable=${summary.unreadable} unresolved=${summary.unresolved}`,
  );
  return summary;
}

/**
 * Find money that went BACK, and take back what it bought.
 *
 * WHY THIS PASS EXISTS, and why it could not have been written before the live
 * bank test on 2026-08-21. We reversed a real transaction (RRN 623279219080,
 * TRTYPE=22) and learned two things the spec does not say:
 *
 *   * the gateway acknowledges a reversal with the single character `1`;
 *   * a status query with TRAN_TRTYPE=1 keeps reporting the ORIGINAL
 *     authorisation as actionCode=0 / Approved FOREVER. The reversal appears
 *     only in an answer to a TRAN_TRTYPE=22 query.
 *
 * `queryTransactionStatus` hardcoded TRAN_TRTYPE=1, so reconciliation could
 * never notice a refund: the family's money was returned and their entitlement
 * stayed live. This asks the second question.
 *
 * IT DECIDES ON EVIDENCE, IN THREE VALUES, AND ONLY ONE OF THEM ACTS.
 * `classifyReversalAnswer` is where the rule lives; the reason it is three-valued
 * rather than two is that "not a decline" and "a reversal" are not the same
 * claim, and taking access away needs the second one:
 *
 *   reversed      the gateway APPROVED the TRAN_TRTYPE=22 question for OUR
 *                 order, on OUR terminal, for OUR amount and currency — and an
 *                 order with no reversal cannot answer that question with an
 *                 approval (it answers rc -24). So this is a positive statement
 *                 that the money went back, not silence read as consent.
 *   not_reversed  rc -24 / "Transaction context mismatch" — the gateway saying
 *                 there is no such transaction to describe. Definitive, and it
 *                 has to be checked FIRST, or every ordinary settled payment
 *                 would fall through to the alarm below on every pass.
 *   unreadable    anything else. We do not understand what was said about this
 *                 money, so NOTHING CHANGES and a person is told.
 *
 * A query that could not be made at all (network, HTTP, an empty body) is not an
 * answer and is not flagged: the next pass asks again while the window is open.
 * Only an ANSWER we cannot classify raises the alarm.
 *
 * THE 24-HOUR LIMIT IS REAL AND IS NOT WORKED AROUND HERE. The gateway answers
 * status queries about an order for one day. A reversal performed after that is
 * invisible to this sweep, and the only evidence left is the settlement report —
 * an operator then uses `checkout_revoke_reversed` directly. Pretending
 * otherwise would be worse than saying it.
 */
async function sweepReversals(
  batch: number,
  terminal: string,
): Promise<{ reversed: number; unreadable: number }> {
  let revoked = 0;
  let unreadable = 0;
  for (const row of await listReversalCandidates(batch)) {
    const expectedAmount = formatAmount(row.amount);
    if (!expectedAmount) continue;

    const status = await queryReversalStatus({
      order: row.order,
      expectation: {
        order: row.order,
        terminal,
        amount: expectedAmount,
        currency: row.currency,
        // No rrn / intRef: there is no signed callback for a reversal we did not
        // initiate from this process. The answer is matched on what we hold.
      },
    });
    if (!status.ok) {
      // We could not ASK. Explicitly not a reason to assume a reversal, not a
      // reason to assume its absence, and not a reason to wake anybody: the next
      // pass asks again while the window is open.
      continue;
    }

    const verdict = classifyReversalAnswer(
      status.parsed,
      status.reconciliation,
      TRTYPE.REVERSAL_ONLINE,
    );
    if (verdict === "not_reversed") continue;
    if (verdict === "unreadable") {
      // An answer about money that we cannot classify. Change nothing — the
      // family keeps what they have — and put it in front of a person, who can
      // read the settlement report. The note is idempotent per (order, reason),
      // so a row that stays unreadable for the rest of the window produces one
      // notification and not one per pass.
      unreadable++;
      await flagCheckoutForReview(row.order, "reversal_unreadable");
      continue;
    }

    if (await markReversed(row.order)) revoked++;
  }
  return { reversed: revoked, unreadable };
}

/** Record the reversal and revoke through the producer. Never throws upward. */
async function markReversed(order: string): Promise<boolean> {
  if (!isServiceRoleConfigured) return false;
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("checkout_revoke_reversed", {
    p_order: order,
    p_reason: "gateway_reversal",
  });
  if (error) {
    console.error("[azericard] reversal revoke failed", error.code ?? "unknown");
    return false;
  }
  const outcome = (data as { outcome?: unknown } | null)?.outcome;
  return outcome === "reversed";
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

/**
 * Settled payments worth asking the reversal question about.
 *
 * The window and the "still believed to have succeeded" test live in SQL
 * (`checkout_reversal_candidates`), beside the tables they describe, for the
 * same reason the other work list does: a second caller cannot get it subtly
 * wrong, and once `checkout_revoke_reversed` has run the row drops out of the
 * list by itself rather than being asked about forever.
 */
async function listReversalCandidates(
  limit: number,
): Promise<{ order: string; amount: number; currency: string }[]> {
  if (!isServiceRoleConfigured) return [];
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("checkout_reversal_candidates", {
    p_limit: clampSweepLimit(limit),
  });
  if (error) {
    console.error("[azericard] reversal candidate query failed", error.code ?? "unknown");
    return [];
  }
  const out: { order: string; amount: number; currency: string }[] = [];
  for (const raw of Array.isArray(data) ? data : []) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const order = row.provider_order;
    const amount = Number(row.amount);
    if (typeof order !== "string" || !isValidOrder(order)) continue;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out.push({
      order,
      amount,
      currency: typeof row.currency === "string" ? row.currency : "AZN",
    });
  }
  return out;
}

/** A sweep batch is bounded on both sides; an unbounded one is an outage. */
function clampSweepLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.floor(limit), 1), 200);
}
