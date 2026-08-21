"use server";

// Stage 11 — child subscription server actions (web surface). Since Stage M2
// these are thin, behavior-identical wrappers: each action authorizes the
// parent via the COOKIE session (requireParent, exactly as before), reads its
// FormData, then delegates to the shared cookie-free CORE in
// lib/auth/subscriptionCore (one source of truth with the mobile BFF) and
// localizes the returned error KEY with getT. Validation order, ownership
// checks, payment-mode gates, RPCs, notifications and revalidation all live in
// the core, unchanged from the historical actions. PRICE, sibling discount and
// trial are computed server-side by the RPCs (the client never sets amounts).
import { requireParent } from "@/lib/auth/session";
import {
  activateChildGiveawayCore,
  cancelChildSubscriptionCore,
  paidMutationGateKey,
  quoteSubjectChangeCore,
  quoteSubscriptionCore,
  resolveDesiredBasketCore,
  subscribeChildCore,
  updateSubscriptionSubjectsCore,
  type SubjectChangeQuote,
} from "@/lib/auth/subscriptionCore";
import type { PlanItemInput } from "@/lib/auth/subscriptionCore";
import { uniformPlanItems, validatePlanItems } from "@/lib/planBasket";
import { getLocale, getT } from "@/i18n/server";
import { isChildFreeAccessActive } from "@/lib/freeAccess";
import { startPlanPayment, type StartCheckoutResult } from "@/lib/payments/checkoutCore";

// ---- THE PAYMENT SEAM (WEB ONLY) --------------------------------------------
//
// THE PAYMENT CAUSES THE GRANT. Until migration 125 this file did the opposite:
// it called the plan RPC, which applied the change and reported what it cost,
// and only then opened a charge — through a helper documented as "can only
// return null; it never fails the change". The money was therefore optional. A
// parent could add a 90 AZN yearly subject, confirm, close the tab before
// paying, and the child kept a live year of access with no `payments` row.
//
// The order is now: QUOTE (mutating nothing) -> open an INTENT carrying the
// child, the basket and the RPC's own price -> full-page redirect -> and only a
// verified, re-priced payment applies the plan (checkout_redeem_plan). What
// follows is the one decision that shape needs:
//
//   dueNow === 0  ->  apply now. A trial, a removal, a reinstatement or a
//                     scheduled cycle move costs nothing, so there is no payment
//                     to cause anything and routing it through a checkout would
//                     invent a charge.
//   dueNow  >  0  ->  apply NOTHING. Open the intent, sign the redirect, and
//                     hand the parent one payment step.
//
// THE SERVER MAKES THAT DECISION, NOT THE CLIENT. The branch is taken from the
// quote RPC's own `due_now`, on this side of the wire; the form carries subjects
// and cycles and has never carried a price.
//
// It lives HERE, in the web action wrappers, and deliberately NOT in
// subscriptionCore — the cores are shared with the mobile BFF, and a checkout
// opened inside one would put a purchase path in an app binary. The apps stay
// purchase-silent by architecture (docs/STORE_PAYMENTS_COMPLIANCE.md section 4),
// which is a structural property, not a flag someone could flip.
//
// CLOSED (migration 126): the two mobile BFF routes used to call the APPLY
// cores directly, so a bearer token reached an apply-without-pay the moment the
// payment mode became `real`. They now pass `paidChanges: "refuse"`, which
// selects the `_if_free` RPCs — those apply the change and then roll the whole
// statement back if their own answer priced it above zero. A removal, a
// reinstatement, a scheduled cycle change and a trial-time add still work from
// the app; nothing priced can.
//
// AND CLOSED HERE TOO (migration 127). The `dueNow === 0` branch below used to
// call the UNGUARDED RPC — the same quote-then-apply race, on the web, with the
// same three moving parts (a price, the sibling tier, the trial length) and the
// same READ COMMITTED snapshot per statement. It now passes
// `paidChanges: "free_only"`, which reaches the same `_if_free` wrapper. After
// this change NO application code path names a priced apply RPC: they are
// reachable only from inside checkout_redeem_plan, behind a verified payment.

/** What the client is handed when a real AZN payment is required. */
export type PlanCheckout = {
  /** The merchant order — a lookup key for a resume, never an input to pricing. */
  order: string;
  /** The acquirer's hosted page: a FORM ACTION, never an iframe src. */
  action: string;
  /** Protocol fields only, signed server-side. There is no card field anywhere. */
  fields: Record<string, string>;
  /** The SERVER-computed amount, shown before the parent authorises it. */
  amount: number;
  currency: string;
};

function toPlanCheckout(res: StartCheckoutResult): PlanCheckout | null {
  if (!res.ok) return null;
  return {
    order: res.order,
    action: res.action,
    fields: res.fields,
    amount: res.amount,
    currency: res.currency,
  };
}

// Migration 109 — the per-subject basket travels as one repeated `plan` field,
// each value `"<subjectUuid>:<interval>"`. Reading it here (rather than a JSON
// blob) keeps the form a plain progressively-enhanced POST. Shape only: the
// core re-validates the UUID and the interval whitelist server-side.
function readPlanItems(formData: FormData): PlanItemInput[] {
  return formData
    .getAll("plan")
    .map(String)
    .slice(0, 20)
    .map((raw) => {
      const [subjectId, interval] = raw.split(":");
      return { subjectId: subjectId ?? "", interval: interval ?? "" };
    })
    .filter((i) => i.subjectId !== "" && i.interval !== "");
}

export type SubscribeState =
  | {
      ok: boolean;
      /**
       * Present only when the plan was applied WITHOUT money — a trial, whose
       * `dueNow` is 0. A payable plan returns `checkout` instead and applies
       * nothing until the payment is verified, so there is no result to report
       * yet and no 8-digit login ID to reveal: `create_child_plan` allocates it,
       * and `create_child_plan` has not run.
       */
      result?: {
        base: number;
        discount_percent: number;
        discount: number;
        total: number;
        trial_days: number;
        currency: string;
        // Batch H: the 8-digit login ID is allocated on subscribe — reveal it here.
        childUniqueId?: string | null;
        items?: { subject_id: string; interval: string; price: number | null }[];
        groups?: Record<
          string,
          { count: number; base: number; discount: number; total: number }
        >;
      };
      /**
       * Present when a real AZN payment is required BEFORE anything is applied:
       * the signed field set for the full-page redirect, plus the SERVER-computed
       * amount to show alongside it. The client posts these fields to the bank
       * and nothing else; every number in them was computed and signed here.
       * Absent during a trial, in giveaway / off mode, and whenever a checkout
       * could not be opened.
       */
      checkout?: PlanCheckout;
      error?: string;
    }
  | null;

export async function subscribeChild(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  // Authorize FIRST — before FormData, before the database.
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  // `interval` + repeated `subject` stay as the fallback so an older cached
  // form still submits successfully.
  const interval = String(formData.get("interval") ?? "");
  const subjectIds = formData.getAll("subject").map(String);
  const items = readPlanItems(formData);

  // The payment-mode / free-access gate runs FIRST, exactly where
  // subscribeChildCore runs it, so a giveaway window still answers "it is free
  // right now" instead of a pricing error.
  const gateKey = await paidMutationGateKey(studentId, isChildFreeAccessActive);
  if (gateKey) return { ok: false, error: t(gateKey) };

  // 1. QUOTE. Read-only, and it is what validates the basket and re-proves this
  //    parent owns this child. Nothing is written by this call.
  const quoted = await quoteSubscriptionCore({
    resolveParentProfileId: async () => parent.profileId,
    studentId,
    interval,
    subjectIds,
    items: items.length > 0 ? items : undefined,
  });
  if (!quoted.ok) return { ok: false, error: t(quoted.errorKey) };

  // 2. FREE (a trial): apply now. No money moves, so there is no payment to make
  //    the grant conditional on, and the core's own behaviour is unchanged.
  if (!(quoted.dueNow > 0)) {
    const res = await subscribeChildCore({
      parentProfileId: parent.profileId,
      studentId,
      interval,
      subjectIds,
      items: items.length > 0 ? items : undefined,
      // Web free-access probe: caller-scoped RPC via the cookie client.
      isFreeAccessActive: isChildFreeAccessActive,
      // Migration 127: the WEB takes the free-only RPC too. The quote above said
      // nothing is due, but a quote and an apply are two statements under READ
      // COMMITTED — prices, the sibling tier and the trial length can all move
      // between them. The wrapper takes its verdict from the apply's OWN answer
      // inside the same statement, and rolls the whole thing back if it turns out
      // to have been priced. A payable plan never reaches here at all: it takes
      // branch 3 and is applied by checkout_redeem_plan on a verified payment.
      paidChanges: "free_only",
    });
    if (!res.ok) return { ok: false, error: t(res.errorKey) };
    return { ok: true, result: res.result };
  }

  // 3. PAYABLE: apply NOTHING. Open the intent for exactly the quoted amount and
  //    hand back the signed redirect — one payment step, and the plan exists
  //    only once the bank confirms it.
  const basket = validatePlanItems(
    items.length > 0 ? items : uniformPlanItems(interval, subjectIds),
  );
  if (!basket) return { ok: false, error: t("sub.err.invalid") };
  const started = await startPlanPayment({
    parentProfileId: parent.profileId,
    studentId,
    kind: "plan_start",
    items: basket.map((i) => ({ subjectId: i.subject_id, interval: i.interval })),
    locale: await getLocale(),
  });
  if (!started.ok) return { ok: false, error: t(started.errorKey) };
  return { ok: true, checkout: toPlanCheckout(started) ?? undefined };
}

// ---- Batch H: live, server-side price preview (sibling discount included) -----
// The SubscribeForm calls this when subjects/interval change so the displayed
// total reflects the AUTHORITATIVE sibling-discount computation (never hardcoded).
export type QuoteResult =
  | {
      ok: true;
      base: number;
      discount_percent: number;
      discount: number;
      total: number;
      /** The EFFECTIVE trial for THIS child (migration 125), not the default. */
      trial_days: number;
      /**
       * WHICH CHILD earned the sibling discount (migration 127): 2 = second,
       * 3+ = third and beyond. The screen names the saving instead of quietly
       * applying it — the owner's call: a parent should be able to SEE the
       * discount at the moment they choose, not infer it from a smaller number.
       */
      rank: number;
      /**
       * What is charged today — 0 while a trial applies, the total otherwise.
       * The SAME number the checkout is opened for (audit invariant H7). The
       * screen used to print `total` here and the trial row beside it, which
       * contradicted the charge in both directions: a returning child was shown
       * a trial they would not get, and a first-time one a "due today" that
       * would not be taken.
       */
      dueNow: number;
      currency: string;
      items: { subject_id: string; interval: string; price: number | null }[];
      groups: Record<
        string,
        { count: number; base: number; discount: number; total: number }
      >;
      mixed: boolean;
    }
  | { ok: false; error?: string };

export async function quoteSubscription(args: {
  studentId: string;
  interval?: string;
  subjectIds?: string[];
  /** Per-subject basket; falls back to the uniform pair above when absent. */
  items?: PlanItemInput[];
}): Promise<QuoteResult> {
  const t = await getT();
  const res = await quoteSubscriptionCore({
    // Historical order preserved: the parent is resolved (and a missing session
    // redirects) only at the ownership check, AFTER input validation.
    resolveParentProfileId: async () => (await requireParent()).profileId,
    studentId: args.studentId,
    interval: args.interval ?? "",
    subjectIds: args.subjectIds ?? [],
    items: args.items,
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  const { ok: _ok, ...quote } = res;
  return { ok: true, ...quote };
}

// ---- Mid-cycle plan-change preview ------------------------------------------
// The Manage-Subjects editor calls this for the DESIRED FULL set
// (quote_child_subscription above stays for the initial subscribe flow).
// Returns what is charged TODAY — each added subject's FULL first period,
// starting today, at the sibling rate; proration is retired — plus each
// subject's own renewal and removal dates. The SAME numbers apply_plan_change
// will charge (one RPC is the source of truth for both).
// Re-exported so client components (ManageSubjects) can import the quote shape
// from this "use server" surface instead of reaching into the server-only core.
export type { SubjectChangeQuote, PlanItemInput };

export type SubjectChangeQuoteResult =
  | { ok: true; quote: SubjectChangeQuote }
  | { ok: false; error?: string };

export async function quoteSubjectChange(args: {
  studentId: string;
  add?: string[];
  remove?: string[];
  /** The DESIRED FULL set with per-subject cycles (migration 109). */
  items?: PlanItemInput[];
}): Promise<SubjectChangeQuoteResult> {
  // M7: authorize FIRST.
  const parent = await requireParent();
  const t = await getT();
  const res = await quoteSubjectChangeCore({
    parentProfileId: parent.profileId,
    studentId: args.studentId,
    add: args.add ?? [],
    remove: args.remove ?? [],
    items: args.items,
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  return { ok: true, quote: res.quote };
}

// ---- W2: cancel a child's current subscription (parent-initiated) -------------
// Access is KEPT until the current period end (see subscriptionCore for the
// full contract). RLS does not grant parents UPDATE on child_subscriptions, so
// the core uses the service-role admin client AFTER verifying ownership.
export type CancelSubscriptionState = { ok?: boolean; error?: string } | null;

export async function cancelChildSubscription(
  _prev: CancelSubscriptionState,
  formData: FormData,
): Promise<CancelSubscriptionState> {
  // M7: authorize FIRST — before touching FormData.
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  const subscriptionId = String(formData.get("subscription_id") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 60);

  const res = await cancelChildSubscriptionCore({
    parentProfileId: parent.profileId,
    studentId,
    subscriptionId,
    reason,
  });
  if (!res.ok) return { error: t(res.errorKey) };
  return { ok: true };
}

// ---- Round 11 (item 1): batch subject update from the checkbox editor ---------
// The Manage-Subjects UI posts the DESIRED full subject set (checkboxes); the
// core computes the diff and applies it through the existing re-pricing RPCs.
export type SubjectsUpdateState =
  | {
      ok: true;
      added: number;
      removed: number;
      planChanged: number;
      /** See SubscribeState.checkout — the payment happens BEFORE the change. */
      checkout?: PlanCheckout;
    }
  | { ok: false; error: string }
  | null;

export async function updateSubscriptionSubjectsAction(
  _prev: SubjectsUpdateState,
  formData: FormData,
): Promise<SubjectsUpdateState> {
  // M7: authorize FIRST — before touching FormData; the billing gate runs only
  // after ownership is proven (it still receives this child's id).
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  const subjectIds = formData.getAll("subject").map(String);
  const items = readPlanItems(formData);

  // The DESIRED basket, concrete before anything else happens. A payment can
  // only be opened for something specific, so a caller that sent subject ids
  // alone has its cycles derived here — by the SAME rule
  // updateSubscriptionSubjectsCore derives them with — rather than being priced
  // for "whatever the server works out later".
  const desired =
    items.length > 0
      ? items
      : ((await resolveDesiredBasketCore(studentId, subjectIds)) ?? []);
  const basket = validatePlanItems(desired);

  // 1. QUOTE the desired set. Read-only, ownership re-proved, nothing written.
  //    A basket we could not resolve falls straight through to the apply core,
  //    which owns the "no live subscription" / "at least one subject" answers.
  const quoted = basket
    ? await quoteSubjectChangeCore({
        parentProfileId: parent.profileId,
        studentId,
        add: [],
        remove: [],
        items: desired,
      })
    : null;

  // 2. PAYABLE: apply NOTHING. Open the intent for exactly the quoted amount.
  //    A removal-only, reinstatement-only or cycle-change-only save costs
  //    nothing and skips this entirely — the DB agrees (assert_payments_enabled
  //    is called only when there are adds or cycle changes), so a parent can
  //    always leave a plan even while billing is paused.
  if (quoted && quoted.ok && quoted.quote.dueNow > 0 && basket) {
    const gateKey = await paidMutationGateKey(studentId, isChildFreeAccessActive);
    if (gateKey) return { ok: false, error: t(gateKey) };
    const started = await startPlanPayment({
      parentProfileId: parent.profileId,
      studentId,
      kind: "plan_change",
      items: basket.map((i) => ({ subjectId: i.subject_id, interval: i.interval })),
      locale: await getLocale(),
    });
    if (!started.ok) return { ok: false, error: t(started.errorKey) };
    // added / removed / planChanged are 0 because NOTHING was applied. The
    // client renders the payment step off `checkout`, never off these counts.
    return {
      ok: true,
      added: 0,
      removed: 0,
      planChanged: 0,
      checkout: toPlanCheckout(started) ?? undefined,
    };
  }

  // 2b. A RESOLVABLE BASKET THAT WOULD NOT QUOTE STOPS HERE.
  //
  //     Falling through to the apply core on a failed quote is the old defect
  //     wearing a different hat: quoting is what decides whether money is owed,
  //     so a quote we could not get is not permission to apply for free. Every
  //     deterministic refusal (not this parent's child, a malformed basket, no
  //     live subscription) is one the apply core would repeat word for word, so
  //     nothing changes for a parent — while a TRANSIENT failure, the one case
  //     where the two calls could disagree, can no longer land an add on the
  //     child with no charge behind it.
  //
  //     `quoted === null` is NOT this case: it means the basket could not be
  //     resolved at all, and the apply core owns those answers (see step 1).
  if (quoted && !quoted.ok) return { ok: false, error: t(quoted.errorKey) };

  // 3. FREE: apply now, exactly as before.
  const res = await updateSubscriptionSubjectsCore({
    parentProfileId: parent.profileId,
    studentId,
    subjectIds,
    items: items.length > 0 ? items : undefined,
    isFreeAccessActive: isChildFreeAccessActive,
    // Reached only on a FREE diff (step 2 sent every payable one to the bank) —
    // but the guard is still the RPC's, not this branch's. See the subscribe
    // action above: a quote and an apply are two statements, and only the
    // wrapper can decide "this was free" without a race.
    paidChanges: "free_only",
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };

  // Whitelist-copy: the core also returns `reinstated`, `dueNow`,
  // `subscriptionId` and `currency`, and a plan amount has no business being
  // serialized into a page that does not display it.
  return {
    ok: true,
    added: res.added,
    removed: res.removed,
    planChanged: res.planChanged,
  };
}

// ---- Round 11 (item 6): add-child during an active GIVEAWAY window ------------
// The wizard skips plan selection + payment entirely: the child gets their
// 8-digit login ID immediately (activate_child_login_id — NO subscription row)
// and platform access comes from the server-side giveaway override. When the
// window ends the override stops applying and normal payment rules resume on
// their own — nothing to unwind. H8: an ACTIVE per-child FREE-ACCESS interval
// qualifies the same way (same override model), so a new child added during a
// free window isn't dead-ended without a login ID.
export type GiveawayActivateState =
  | { ok: true; childUniqueId: string | null }
  | { ok: false; error: string }
  | null;

export async function activateChildGiveaway(
  _prev: GiveawayActivateState,
  formData: FormData,
): Promise<GiveawayActivateState> {
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");

  const res = await activateChildGiveawayCore({
    parentProfileId: parent.profileId,
    studentId,
    isFreeAccessActive: isChildFreeAccessActive,
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  return res;
}
