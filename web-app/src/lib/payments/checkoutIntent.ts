// THE INTENT SEAM — where a plan becomes a payable order, and where a verified
// payment becomes a plan. SERVER ONLY, WEB ONLY.
//
// WHY THIS FILE EXISTS. The checkout used to apply the plan change FIRST and ask
// for money AFTERWARDS, through a helper that could only return null and never
// failed the change. `apply_plan_change` wrote a full period unconditionally,
// migration 124's mirror turned that into a live entitlement immediately, and
// nothing expires an unpaid subscription — so closing the tab before paying left
// a year of access with no `payments` row anywhere. Reordering was impossible
// while `checkout_sessions` recorded an AMOUNT and never a PURCHASE: a verified
// payment had nothing to act on. Migration 125 gives the session an INTENT, and
// these two functions are its ends.
//
//   openPlanIntent()      quote → open a pending session → nothing else. It
//                         MUTATES NO PLAN. Abandonment is harmless because
//                         there is nothing to unwind.
//   openOlympiadIntent()  the same, for a package (migration 127). The web
//                         olympiad purchase used to run on a mock that always
//                         approved, so a family got LIFETIME access with no
//                         payments row anywhere; it now takes this rail.
//   redeemPlanCheckout()  called from the AzeriCard callback AFTER the signature
//                         verified, the TRTYPE=90 answer agreed and the payment
//                         was recorded. This is the only path from money to a
//                         plan OR a package — one function, three products,
//                         because a second implementation of "money becomes
//                         access" mis-bills silently the day it drifts.
//
// FOUR THINGS IT DELIBERATELY DOES NOT DO
//
//   * It never computes a price. `checkout_intent_open` quotes and inserts in
//     one transaction, so the stored amount is provably the RPC's own number,
//     and there is no parameter on either side through which an amount could
//     travel. Redemption re-quotes too — but since migration 127 it HONOURS the
//     amount that was quoted rather than demanding exact equality (owner
//     decision: the sibling tier moves when a sibling pays, and a family should
//     not wait on a human over a few AZN). What still reaches a human is a
//     DIFFERENT DELIVERY, not a different number.
//   * It never writes `entitlements`. Redemption calls create_child_plan /
//     apply_plan_change like every other caller and lets migration 124's
//     producer triggers mirror the result (§4.1: ABB is one PRODUCER, never the
//     source of truth for access).
//   * It never decides that a payment succeeded. That judgement belongs to the
//     callback's status re-query; this module only acts on a session the ledger
//     has already advanced to `paid`, and the SQL refuses if it has not.
//   * It is NOT reachable from the mobile app. No route under app/api/mobile
//     imports it, and none may: the apps are purchase-silent by architecture
//     (docs/STORE_PAYMENTS_COMPLIANCE.md §4).
import "server-only";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { applyAllocatedChildEmail } from "@/lib/auth/childAccountService";
import { mintOrderCandidate } from "@/lib/payments/azericard/format";
import { isUuid } from "@/lib/uuid";
import type { PlanItemInput } from "@/lib/planBasket";

/** Postgres unique-violation SQLSTATE — an ORDER collision, nothing more. */
const UNIQUE_VIOLATION = "23505";
/** How many ORDER candidates we try before giving up (mirrors store.ts). */
const ORDER_MINT_ATTEMPTS = 8;

/**
 * How long a signed intent stays redeemable, in minutes.
 *
 * The bank's hosted page is a matter of minutes, but a parent who starts a
 * payment, is interrupted and finishes it that evening is a real person, not an
 * attack. A day is generous enough for them and short enough that a leaked
 * callback tuple replayed against a forgotten session finds it closed. Beyond
 * it, a genuinely paid intent is not dropped — it becomes a `needs_review` with
 * the reason `expired`, because we must never keep money without delivering.
 */
const INTENT_TTL_MINUTES = 24 * 60;

export type PlanIntentKind = "plan_start" | "plan_change";

/**
 * Every intent this rail can carry (migration 127).
 *
 * The olympiad package joined the two plan kinds rather than getting a rail of
 * its own, and that is the whole design decision: `checkout_redeem_plan` stays
 * the ONLY function in the platform that turns money into access. A second
 * redemption path would be a second copy of a billing rule, and a second copy
 * mis-bills silently on the day it drifts from the first.
 */
export type CheckoutIntentKind = PlanIntentKind | "olympiad";

export type OpenIntentResult =
  | { ok: true; order: string; amount: number; currency: string }
  | { ok: false; errorKey: string };

/**
 * Open a payable checkout for a plan the parent has NOT been given yet.
 *
 * The caller must already have authorized the parent and proven they own this
 * child — everything below runs on the service-role client, which RLS does not
 * constrain. The basket is validated a second time inside the RPC
 * (`plan_items_normalize`), so a caller that skipped its own validation cannot
 * widen what is bought.
 *
 * Returns the minted ORDER and the SERVER-computed amount. A failure is an i18n
 * KEY: no Postgres text ever reaches a payer.
 */
export async function openPlanIntent(params: {
  studentId: string;
  kind: PlanIntentKind;
  items: PlanItemInput[];
}): Promise<OpenIntentResult> {
  const { studentId, kind, items } = params;
  if (!isServiceRoleConfigured) return { ok: false, errorKey: "checkout.err.unavailable" };
  if (!isUuid(studentId)) return { ok: false, errorKey: "checkout.err.unavailable" };
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    return { ok: false, errorKey: "checkout.err.unavailable" };
  }

  const admin = getAdminClient();
  // The basket travels as the RPC's own shape. Snake case because
  // plan_items_normalize reads `subject_id` / `interval`, exactly as every other
  // plan call site sends it.
  const payload = items.map((i) => ({ subject_id: i.subjectId, interval: i.interval }));

  // ORDER UNIQUENESS IS THE DATABASE'S JOB (migration 123). Mint, insert, and
  // retry on 23505 — "check then insert" cannot close the race because two
  // concurrent requests both see the gap.
  for (let attempt = 0; attempt < ORDER_MINT_ATTEMPTS; attempt++) {
    const order = mintOrderCandidate();
    const { data, error } = await admin.rpc("checkout_intent_open", {
      p_student_profile_id: studentId,
      p_kind: kind,
      p_items: payload,
      p_order: order,
      p_ttl_minutes: INTENT_TTL_MINUTES,
    });
    if (!error) {
      const row = (data ?? {}) as Record<string, unknown>;
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        console.error("[checkout] intent opened with no usable amount");
        return { ok: false, errorKey: "checkout.err.unavailable" };
      }
      return {
        ok: true,
        order: typeof row.order === "string" ? row.order : order,
        amount,
        currency: typeof row.currency === "string" ? row.currency : "AZN",
      };
    }
    // 23505 ALONE IS NOT AN ORDER COLLISION. `checkout_intent_open` raises
    // `already_subscribed` with that same SQLSTATE (a plan_start for a child who
    // already has a live plan — the other tab won). Retrying that one mints
    // eight fresh orders, takes the family advisory lock eight times, and ends
    // on the generic "not available" instead of the sentence intentErrorKey
    // already has for it. Only an UNHINTED unique violation is the index.
    if (error.code === UNIQUE_VIOLATION && !error.hint) continue; // mint again
    return { ok: false, errorKey: intentErrorKey(error) };
  }
  console.error("[checkout] could not mint a free order id");
  return { ok: false, errorKey: "checkout.err.unavailable" };
}

/**
 * Open a payable checkout for an OLYMPIAD PACKAGE the child has NOT been given.
 *
 * The twin of openPlanIntent, and deliberately its twin rather than its own
 * mechanism: the same RPC, the same minted ORDER, the same unique-index retry,
 * the same "the RPC prices it, nothing else may" rule. What changes is only the
 * shape of the frozen intent — one package instead of a basket of subjects.
 *
 * THE GRADE IS NOT AN INPUT. `checkout_intent_open` reads the child's current
 * grade through quote_olympiad_purchase and freezes THAT, because
 * purchase_olympiad snapshots the grade and attempts draw its pool forever. A
 * caller able to name it could buy a pool the package does not sell to this
 * child.
 *
 * The caller must already have authorized the parent and proven they own this
 * child — everything below runs on the service-role client.
 */
export async function openOlympiadIntent(params: {
  studentId: string;
  packageId: string;
}): Promise<OpenIntentResult> {
  const { studentId, packageId } = params;
  if (!isServiceRoleConfigured) return { ok: false, errorKey: "checkout.err.unavailable" };
  if (!isUuid(studentId) || !isUuid(packageId)) {
    return { ok: false, errorKey: "checkout.err.unavailable" };
  }

  const admin = getAdminClient();
  for (let attempt = 0; attempt < ORDER_MINT_ATTEMPTS; attempt++) {
    const order = mintOrderCandidate();
    const { data, error } = await admin.rpc("checkout_intent_open", {
      p_student_profile_id: studentId,
      p_kind: "olympiad",
      p_items: [{ package_id: packageId }],
      p_order: order,
      p_ttl_minutes: INTENT_TTL_MINUTES,
    });
    if (!error) {
      const row = (data ?? {}) as Record<string, unknown>;
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        console.error("[checkout] olympiad intent opened with no usable amount");
        return { ok: false, errorKey: "checkout.err.unavailable" };
      }
      return {
        ok: true,
        order: typeof row.order === "string" ? row.order : order,
        amount,
        currency: typeof row.currency === "string" ? row.currency : "AZN",
      };
    }
    // Only an UNHINTED unique violation is an ORDER collision; the RPC raises
    // `already_owned` with the same SQLSTATE for a package the child holds.
    if (error.code === UNIQUE_VIOLATION && !error.hint) continue; // mint again
    return { ok: false, errorKey: olympiadIntentErrorKey(error) };
  }
  console.error("[checkout] could not mint a free order id");
  return { ok: false, errorKey: "checkout.err.unavailable" };
}

/**
 * Re-open a FAILED intent as a fresh, freshly-priced one.
 *
 * A failed session is never re-signed: the gateway already holds a completed,
 * declined transaction under that ORDER, and the old row stays standing as the
 * accurate ledger entry. The retry is a NEW intent over the SAME stored basket,
 * which means it is RE-QUOTED — the parent pays today's price for something they
 * have not received yet, which is the honest direction. (Before 125 the retry
 * deliberately kept the old amount, because the plan had already been granted at
 * it. That reasoning died with the ordering that produced it.)
 */
export async function reopenPlanIntent(params: {
  studentId: string;
  kind: string | null;
  items: unknown;
}): Promise<OpenIntentResult> {
  const { studentId, kind, items } = params;
  // A `plan_change` RETRY IS NOT REOPENABLE, and that is the point.
  //
  // `intent_items` is the ABSOLUTE basket — the whole desired plan at the moment
  // of the original save. Re-opening from it hands `checkout_intent_open` a
  // world, and it freezes a FRESH delta by diffing that world against coverage
  // as it stands NOW. Everything the parent did in between is then silently
  // folded into the retry: a subject they cancelled comes back as a `reinstate`,
  // one they added elsewhere comes back as a `remove`. The parent authorised a
  // CHANGE and would be shown only an amount.
  //
  // That is exactly the rule migration 127 exists to enforce, so the retry does
  // not get an exception to it. A declined `plan_change` sends the parent back
  // to the editor, where saving again produces an honest delta against the
  // current world with a fresh authorisation — one extra click on a path that
  // is already the unhappy one. `plan_start` has no such hazard: there is no
  // prior coverage to diff against, so its basket IS its change.
  if (kind === "plan_change") {
    return { ok: false, errorKey: "checkout.err.retryFromEditor" };
  }
  if (kind !== "plan_start") {
    return { ok: false, errorKey: "checkout.err.notFound" };
  }
  const parsed = readStoredBasket(items);
  if (!parsed) return { ok: false, errorKey: "checkout.err.notFound" };
  return openPlanIntent({ studentId, kind, items: parsed });
}

/**
 * The stored basket, read back into the shape openPlanIntent takes.
 *
 * It came out of `plan_items_normalize`, so it is already trustworthy; this is a
 * shape read, not a validation, and it returns null rather than a partial list
 * so half a basket can never be re-opened as if it were the whole one.
 */
function readStoredBasket(items: unknown): PlanItemInput[] | null {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) return null;
  const out: PlanItemInput[] = [];
  for (const raw of items) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const subjectId = typeof row.subject_id === "string" ? row.subject_id : "";
    const interval = typeof row.interval === "string" ? row.interval : "";
    if (!isUuid(subjectId) || !interval) return null;
    out.push({ subjectId, interval });
  }
  return out;
}

export type RepriceResult =
  | { ok: true; amount: number }
  | { ok: false; errorKey: string; reason: string };

/**
 * Re-quote a stored intent, read-only, immediately before it is signed.
 *
 * The same computation redemption runs; running it here only means a mismatch is
 * caught BEFORE money moves rather than after. A parent who sits on a stale
 * checkout for a day and clicks pay finds out that the price moved instead of
 * paying an amount that will land in `needs_review`.
 */
export async function repricePlanIntent(order: string): Promise<RepriceResult> {
  if (!isServiceRoleConfigured) {
    return { ok: false, errorKey: "checkout.err.unavailable", reason: "not_configured" };
  }
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("checkout_intent_price", { p_order: order });
  if (error) {
    console.error("[checkout] re-pricing failed", error.code ?? "unknown");
    return { ok: false, errorKey: "checkout.err.unavailable", reason: "rpc_error" };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === true) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, errorKey: "checkout.err.unavailable", reason: "bad_amount" };
    }
    return { ok: true, amount };
  }
  const reason = typeof row.reason === "string" ? row.reason : "unknown";
  return { ok: false, errorKey: repriceErrorKey(reason), reason };
}

export type RedeemOutcome =
  | "applied"
  | "needs_review"
  | "not_paid"
  | "no_intent"
  | "unknown_order"
  | "error";

/**
 * Turn a PAID checkout into the plan it was opened for. Exactly once.
 *
 * Every hard guarantee lives in `checkout_redeem_plan`, inside one transaction:
 * the row is locked, `status = 'paid'` is required, the frozen basket is
 * re-priced and must equal the amount the gateway confirmed, and `redeemed_at`
 * is set alongside the apply. A gateway retry, a double callback or a refresh
 * therefore finds a decided row. Anything that cannot be delivered safely is
 * recorded as `needs_review` with a reason — never silently granted, never
 * silently dropped.
 *
 * THE ONE FOLLOW-UP SQL CANNOT DO is the Supabase Auth admin call that turns the
 * freshly allocated 8-digit id into a login. When it fails the plan IS applied
 * and the child still cannot sign in, so the session is flagged for a human
 * rather than left looking finished.
 */
export async function redeemPlanCheckout(order: string): Promise<RedeemOutcome> {
  if (!isServiceRoleConfigured) return "error";
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("checkout_redeem_plan", { p_order: order });
  if (error) {
    // Never the Postgres text — this runs in a public endpoint.
    console.error("[checkout] redemption failed", error.code ?? "unknown");
    return "error";
  }
  const row = (data ?? {}) as Record<string, unknown>;
  const outcome = typeof row.outcome === "string" ? row.outcome : "error";

  if (outcome === "applied") {
    const childUniqueId =
      typeof row.new_child_unique_id === "string" ? row.new_child_unique_id : null;
    const authUserId = typeof row.auth_user_id === "string" ? row.auth_user_id : null;
    if (childUniqueId && authUserId) {
      const emailRes = await applyAllocatedChildEmail({ authUserId, childUniqueId });
      if (!emailRes.ok) {
        // The plan is live and paid for; only the login is not. That is a
        // DIFFERENT problem from "we took money and delivered nothing", so it is
        // recorded as a NOTE on the applied row rather than by flipping the
        // status to needs_review — two problems that need two different answers
        // must not share one word. 013 check 118 surfaces either.
        console.error("[checkout] child login email could not be applied after redemption");
        await flagCheckoutForReview(order, "child_login_email_failed");
      }
    }
    return "applied";
  }

  if (outcome === "needs_review") {
    // Enum-shaped reason only: no order id, no amount, no family in the log.
    const note = typeof row.note === "string" ? row.note.split(":")[0] : "unknown";
    console.error(`[checkout] redemption needs review: ${note}`);
    return "needs_review";
  }

  // A REPLAY. The row was decided before, so this reports WHAT WAS DECIDED —
  // never a flat "already", which the caller would have to interpret and would
  // interpret as success. A second callback for a session that landed in
  // needs_review must keep telling the parent "not finished", or the one lie
  // they are guaranteed to discover is the one a retry tells them.
  if (outcome === "already") {
    return row.redemption_status === "applied" ? "applied" : "needs_review";
  }

  if (
    outcome === "not_paid" ||
    outcome === "no_intent" ||
    outcome === "unknown_order"
  ) {
    return outcome;
  }
  return "error";
}

/**
 * Mark a DECIDED redemption as needing a human, and alert the administrators.
 * Best effort; never throws upward.
 *
 * Exported because the reconciliation sweep needs the same seam for a different
 * reason: an answer about a possible REVERSAL that it cannot classify. Both are
 * the same sentence — "this session needs a person, and nothing has been changed
 * on the strength of a guess" — and both are idempotent per (order, note), so a
 * condition that persists for the rest of the gateway's window files one
 * notification rather than one per pass.
 *
 * The SQL writes the note only and never the status: the status keeps saying
 * what happened to the money, which for these rows is that it arrived and was
 * delivered on. Two problems that need two different answers must not share one
 * word.
 */
export async function flagCheckoutForReview(order: string, note: string): Promise<void> {
  if (!isServiceRoleConfigured) return;
  const admin = getAdminClient();
  const { error } = await admin.rpc("checkout_flag_redemption", {
    p_order: order,
    p_note: note,
  });
  if (error) console.error("[checkout] could not flag the redemption", error.code ?? "unknown");
}

/**
 * A raised intent error, as an i18n KEY.
 *
 * The RPC raises with a HINT precisely so the app can say something true without
 * repeating a database message. Anything unrecognised becomes the generic
 * "not available right now" — an unmapped hint is a bug on our side, not a
 * sentence to show a parent.
 */
function intentErrorKey(error: { code?: string; hint?: string | null }): string {
  const hint = error.hint ?? "";
  if (hint === "payments_disabled") return "gate.paymentsOff";
  // The plan moved under the parent — another tab, another device. Refreshing is
  // the honest instruction, and it is the same answer for both directions of the
  // race (a subscription that appeared, and one that vanished).
  if (hint === "already_subscribed") return "checkout.err.planChanged";
  if (error.code === "P0002") return "checkout.err.planChanged";
  // `nothing_due` means the caller decided this change was payable and the
  // database disagreed. That is a race, not something to explain in a sentence.
  console.error(`[checkout] intent refused: ${hint || error.code || "unknown"}`);
  return "checkout.err.unavailable";
}

/**
 * An olympiad intent refusal, as an i18n KEY.
 *
 * The hints are quote_olympiad_purchase's, and they are the SAME hints the
 * direct purchase raised before 127 — so a parent meets the sentences they
 * always did, now on the paid rail.
 */
function olympiadIntentErrorKey(error: { code?: string; hint?: string | null }): string {
  const hint = error.hint ?? "";
  if (hint === "payments_disabled") return "gate.paymentsOff";
  if (hint === "package_not_on_sale") return "poly.err.notOnSale";
  if (hint === "package_not_for_grade") return "poly.err.notForGrade";
  if (hint === "already_owned") return "poly.err.alreadyOwned";
  console.error(`[checkout] olympiad intent refused: ${hint || error.code || "unknown"}`);
  return "poly.err.generic";
}

/** A re-price refusal, as an i18n KEY. */
function repriceErrorKey(reason: string): string {
  if (reason === "price_changed") return "checkout.err.priceChanged";
  if (reason === "expired") return "checkout.err.expired";
  if (
    reason === "plan_already_live" ||
    reason === "subscription_changed" ||
    reason === "student_gone" ||
    // Migration 127: the CHANGE this checkout would deliver is no longer the one
    // it was opened for — a subject it was going to add is already live, or one
    // it was going to un-cancel has since lapsed into a paid addition. Neither
    // is a price movement, and neither may be signed for: "the plan moved under
    // you, look again" is the honest thing to say, and saying it here costs the
    // parent nothing.
    reason === "delivery_changed" ||
    // Migration 127: the child was promoted, so the package would now snapshot a
    // different grade's pool than the one that was quoted. That is a different
    // purchase, and "the plan moved under you, look again" is the honest thing
    // to say about it.
    reason === "grade_changed"
  ) {
    return "checkout.err.planChanged";
  }
  if (reason === "not_found") return "checkout.err.notFound";
  console.error(`[checkout] re-price refused: ${reason}`);
  return "checkout.err.unavailable";
}
