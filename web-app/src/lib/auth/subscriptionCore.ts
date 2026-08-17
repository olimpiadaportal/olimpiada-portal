// SERVER-ONLY subscription CORES (Stage M2) — the cookie-free heart of the
// Stage-11 subscription server actions, shared by the web actions
// (lib/auth/subscriptionService, which resolve the parent via requireParent
// and localize error keys with getT) and the mobile BFF route handlers
// (which resolve the parent via resolveBearerParent and return the keys
// verbatim). Extracting the cores follows the M1 parentValidation pattern:
// ONE source of truth — validation order, ownership checks, RPC calls,
// side-effects (notifications, revalidation) and error KEYS are exactly the
// historical action behavior; the actions delegate here so web behavior is
// unchanged.
//
// Every function takes the ALREADY-AUTHORIZED parent profile id — callers
// MUST authenticate first (requireParent on web, resolveBearerParent on
// mobile). Errors are i18n KEYS, never localized text.
import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { applyAllocatedChildEmail } from "@/lib/auth/childAccountService";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import {
  derivePlanItems,
  desiredFromAddRemove,
  effectivePlanInterval,
  uniformPlanItems,
  validatePlanItems,
  type LivePlan,
  type LivePlanRow,
  type PlanItemInput,
} from "@/lib/planBasket";
import { isUuid } from "@/lib/uuid";
import { notifySubscriptionCanceled } from "@/lib/notifications/events";
import { writeAuditLog } from "@/lib/audit";

// Postgres error codes the subject-change RPCs raise on purpose (mirrors the
// PG_* constants in lib/auth/testActions.ts) — never leaked raw, only used to
// pick the right generic trilingual key.
const PG_CHECK_VIOLATION = "23514";
const PG_NO_DATA_FOUND = "P0002";

// The per-child free-access probe differs by surface — web uses the
// caller-scoped `is_child_free_access_active` RPC through the COOKIE client
// (lib/freeAccess.isChildFreeAccessActive); the BFF uses the SAME RPC through
// the BEARER client (lib/auth/mobileBearer.bearerFreeAccessChecker). Injecting
// the checker keeps the gate's resolution order and semantics identical on
// both surfaces.
export type FreeAccessChecker = (studentId: string) => Promise<boolean>;

export type GateErrorKey = "gate.paymentsOff" | "gate.giveawayFree" | "gate.freeAccess";

// Round 11: paid mutations are gated by the PAYMENT MODE, not the raw flag —
// 'real'/'demo' allow the transaction, 'off' blocks it (existing UX), and
// 'giveaway' blocks paid WRITES with a friendly "it's free right now" message
// (access during the window comes from the server-side giveaway override, so
// nothing has to be unwound when the window expires). Round 12: an active
// FREE-ACCESS interval blocks paid writes the same way — but scoped to THIS
// child, so a window for one child never blocks paying for an uncovered sibling.
export async function paidMutationGateKey(
  studentId: string | undefined,
  isFreeAccessActive: FreeAccessChecker,
): Promise<GateErrorKey | null> {
  const { mode } = await getPaymentModeInfo();
  if (mode === "off") return "gate.paymentsOff";
  if (mode === "giveaway") return "gate.giveawayFree";
  if (studentId && (await isFreeAccessActive(studentId))) {
    return "gate.freeAccess";
  }
  return null;
}

// ---- Per-subject plan baskets (migration 109) --------------------------------
// The PURE half — validation, the legacy-shape expansions and the server-side
// derivation rule — lives in lib/planBasket so it can be unit-tested without
// this server-only module (and its service-role client) being importable from a
// test. Re-exported here because the actions and BFF routes take the type.
export type { PlanItemInput };

// ---- The live plan, and how a subject-ID-only caller becomes a basket --------
//
// Migration 118 RETIRED `quote_subject_change` / `apply_subject_change`. Those
// two wrappers were the last reachable route into the old billing model: one
// shared renewal date for the whole child, an addition PRORATED into the days
// left in it. The owner reversed that model — every subject is billed on its
// OWN cycle, starting the day it is added — so the wrappers are not merely
// unused, they are wrong, and a caller that sends only subject ids must not be
// able to reach a different RPC pair by omitting a field.
//
// So the SERVER composes the basket itself (derivePlanItems), with exactly the
// rule the dropped SQL used. This function is the only DB-touching half: read
// the child's live subscription and its go-forward coverage.

/** The child's live (trialing/active/past_due) subscription with its coverage. */
async function readLivePlan(studentId: string): Promise<LivePlan | null> {
  const admin = getAdminClient();
  const { data: sub } = await admin
    .from("child_subscriptions")
    .select("id, interval")
    .eq("student_profile_id", studentId)
    .in("status", ["trialing", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub?.id) return null;

  const { data: covered } = await admin
    .from("subscription_subjects")
    .select("subject_id, interval, pending_interval, remove_at")
    .eq("child_subscription_id", (sub as { id: string }).id);
  const rows = (covered ?? []) as LivePlanRow[];
  return {
    subscriptionId: (sub as { id: string }).id,
    interval: (sub as { interval?: string | null }).interval ?? null,
    activeRows: rows.filter((r) => !r.remove_at),
    allRows: rows,
  };
}

/** The `groups` / `items` blocks the plan RPCs return, copied defensively. */
function readPlanShape(r: Record<string, unknown>): {
  items: { subject_id: string; interval: string; price: number | null }[];
  groups: Record<string, { count: number; base: number; discount: number; total: number }>;
  mixed: boolean;
} {
  const items: { subject_id: string; interval: string; price: number | null }[] = [];
  if (Array.isArray(r.items)) {
    for (const raw of r.items) {
      const row = (raw ?? {}) as Record<string, unknown>;
      if (typeof row.subject_id !== "string" || typeof row.interval !== "string") continue;
      items.push({
        subject_id: row.subject_id,
        interval: row.interval,
        price: row.price == null ? null : Number(row.price),
      });
    }
  }
  const groups: Record<
    string,
    { count: number; base: number; discount: number; total: number }
  > = {};
  if (r.groups && typeof r.groups === "object" && !Array.isArray(r.groups)) {
    for (const [key, raw] of Object.entries(r.groups as Record<string, unknown>)) {
      const row = (raw ?? {}) as Record<string, unknown>;
      groups[key] = {
        count: Number(row.count ?? 0),
        base: Number(row.base ?? 0),
        discount: Number(row.discount ?? 0),
        total: Number(row.total ?? 0),
      };
    }
  }
  return { items, groups, mixed: r.mixed === true };
}

/** True when the parent created this child (the ownership rule every paid action uses). */
export async function ownsChildCore(
  parentProfileId: string,
  studentId: string,
): Promise<boolean> {
  const admin = getAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  return !!student && student.created_by_parent_profile_id === parentProfileId;
}

// ---- Start a child subscription (allocates the deferred 8-digit login ID) ----

export type SubscribeCoreResult =
  | {
      ok: true;
      result: {
        base: number;
        discount_percent: number;
        discount: number;
        total: number;
        trial_days: number;
        currency: string;
        childUniqueId: string | null;
        items: { subject_id: string; interval: string; price: number | null }[];
        groups: Record<
          string,
          { count: number; base: number; discount: number; total: number }
        >;
      };
    }
  | { ok: false; errorKey: string };

export async function subscribeChildCore(params: {
  parentProfileId: string;
  studentId: string;
  /** Legacy uniform basket. Ignored when `items` is supplied. */
  interval: string;
  subjectIds: string[];
  /**
   * Per-subject basket (migration 109). When absent the `(interval,
   * subjectIds)` pair above is expanded into a uniform one, so already-shipped
   * mobile binaries and the legacy web form keep working unchanged.
   */
  items?: PlanItemInput[];
  isFreeAccessActive: FreeAccessChecker;
}): Promise<SubscribeCoreResult> {
  const { parentProfileId, studentId, interval } = params;
  // Payment-mode gate (admin Settings): enforced SERVER-side so a hand-crafted
  // POST can't start a subscription while payments are off / free. Scoped to this
  // child so a free window for a sibling doesn't block paying for this one.
  const gateKey = await paidMutationGateKey(studentId, params.isFreeAccessActive);
  if (gateKey) return { ok: false, errorKey: gateKey };
  // L4: only UUID-shaped subject ids, hard cap 20 (mirrors updateSubscriptionSubjectsCore).
  const subjectIds = params.subjectIds.filter(isUuid);
  const usingItems = Array.isArray(params.items) && params.items.length > 0;

  if (!studentId) return { ok: false, errorKey: "sub.err.invalid" };
  if (
    !usingItems &&
    (!["week", "month", "year"].includes(interval) || subjectIds.length > 20)
  ) {
    return { ok: false, errorKey: "sub.err.invalid" };
  }
  if (!usingItems && subjectIds.length === 0) {
    return { ok: false, errorKey: "sub.err.noSubjects" };
  }

  const planItems = validatePlanItems(
    usingItems ? params.items : uniformPlanItems(interval, subjectIds),
  );
  if (!planItems) return { ok: false, errorKey: "sub.err.invalid" };

  // Authorize: the parent must own this child.
  if (!(await ownsChildCore(parentProfileId, studentId))) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("create_child_plan", {
    p_student_profile_id: studentId,
    p_items: planItems,
  });
  // R7 security: never surface raw Postgres error text (schema/constraint
  // details) to the client — generic message only.
  // Round 51 (audit F6): except the DB payment kill switch, which maps to the
  // friendly payments-off notice.
  if (error) {
    const hint = (error as { hint?: string | null }).hint ?? "";
    if (hint === "payments_disabled") {
      return { ok: false, errorKey: "gate.paymentsOff" };
    }
    return { ok: false, errorKey: "sub.err.failed" };
  }

  // Batch H: the RPC allocated the deferred 8-digit ID (first plan for this child).
  // Set the canonical synthetic auth email so the child can log in with the ID.
  const result = (data ?? {}) as Record<string, unknown>;
  const childUniqueId =
    typeof result.new_child_unique_id === "string" ? result.new_child_unique_id : null;
  const authUserId =
    typeof result.auth_user_id === "string" ? result.auth_user_id : null;
  if (childUniqueId && authUserId) {
    const emailRes = await applyAllocatedChildEmail({ authUserId, childUniqueId });
    if (!emailRes.ok) return { ok: false, errorKey: "sub.err.idFailed" };
  }

  const total = Number(result.total ?? 0);
  const shape = readPlanShape(result);
  await writeAuditLog(parentProfileId, "parent.subscription_create", {
    targetTable: "students",
    targetId: studentId,
    metadata: {
      interval: String(result.interval ?? interval),
      subjects: planItems.length,
      intervals: new Set(planItems.map((i) => i.interval)).size,
      total,
    },
  });

  revalidatePath("/dashboard");
  // L2: whitelist-copy the typed fields only — never spread the raw RPC payload
  // (it may carry internal fields like auth_user_id) back to the client.
  return {
    ok: true,
    result: {
      base: Number(result.base ?? 0),
      discount_percent: Number(result.discount_percent ?? 0),
      discount: Number(result.discount ?? 0),
      total,
      trial_days: Number(result.trial_days ?? 0),
      currency: String(result.currency ?? "AZN"),
      childUniqueId,
      items: shape.items,
      groups: shape.groups,
    },
  };
}

// ---- Live, server-side price preview (sibling discount included) -------------

export type QuoteCoreResult =
  | {
      ok: true;
      base: number;
      discount_percent: number;
      discount: number;
      total: number;
      trial_days: number;
      currency: string;
      items: { subject_id: string; interval: string; price: number | null }[];
      groups: Record<
        string,
        { count: number; base: number; discount: number; total: number }
      >;
      mixed: boolean;
    }
  | { ok: false; errorKey: string };

export async function quoteSubscriptionCore(params: {
  // LAZY on purpose: the historical web action only resolves (and, on a missing
  // session, redirects) the parent at the ownership check — AFTER input
  // validation. The web wrapper passes `async () => (await requireParent()).profileId`;
  // the BFF passes the already-resolved id.
  resolveParentProfileId: () => Promise<string>;
  studentId: string;
  interval: string;
  subjectIds: string[];
  /** Per-subject basket; falls back to the uniform `(interval, subjectIds)` pair. */
  items?: PlanItemInput[];
}): Promise<QuoteCoreResult> {
  const { studentId, interval } = params;
  // L4: only UUID-shaped subject ids, hard cap 20 (mirrors updateSubscriptionSubjectsCore).
  const subjectIds = (params.subjectIds ?? []).filter(isUuid);
  const usingItems = Array.isArray(params.items) && params.items.length > 0;
  if (!studentId) return { ok: false, errorKey: "sub.err.invalid" };
  if (
    !usingItems &&
    (!["week", "month", "year"].includes(interval) || subjectIds.length > 20)
  ) {
    return { ok: false, errorKey: "sub.err.invalid" };
  }
  if (!usingItems && subjectIds.length === 0) {
    return { ok: false, errorKey: "sub.err.noSubjects" };
  }
  const planItems = validatePlanItems(
    usingItems ? params.items : uniformPlanItems(interval, subjectIds),
  );
  if (!planItems) return { ok: false, errorKey: "sub.err.invalid" };
  if (!(await ownsChildCore(await params.resolveParentProfileId(), studentId))) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("quote_child_plan", {
    p_student_profile_id: studentId,
    p_items: planItems,
  });
  if (error) return { ok: false, errorKey: "sub.err.failed" };
  const r = (data ?? {}) as Record<string, unknown>;
  const shape = readPlanShape(r);
  return {
    ok: true,
    base: Number(r.base ?? 0),
    discount_percent: Number(r.discount_percent ?? 0),
    discount: Number(r.discount ?? 0),
    total: Number(r.total ?? 0),
    trial_days: Number(r.trial_days ?? 0),
    currency: String(r.currency ?? "AZN"),
    items: shape.items,
    groups: shape.groups,
    mixed: shape.mixed,
  };
}

// ---- W2: cancel a child's current subscription (parent-initiated) ------------
// Demo-safe: no real payment reversal. Ownership first, then flip the child's
// live subscription (trialing/active/past_due) to 'canceled'. Access is KEPT
// until the current period end; the daily access-recompute job downgrades
// access once current_period_end passes.

export type CancelCoreResult = { ok: true } | { ok: false; errorKey: string };

export async function cancelChildSubscriptionCore(params: {
  parentProfileId: string;
  studentId: string;
  subscriptionId: string;
  reason: string;
}): Promise<CancelCoreResult> {
  const { parentProfileId, studentId, subscriptionId, reason } = params;
  if (!studentId || !subscriptionId) return { ok: false, errorKey: "sub.err.invalid" };
  if (!(await ownsChildCore(parentProfileId, studentId))) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  const admin = getAdminClient();

  // Re-verify the target subscription belongs to this child and is cancelable,
  // so a forged subscription_id can't cancel another family's plan.
  const { data: sub } = await admin
    .from("child_subscriptions")
    .select("id, student_profile_id, status, current_period_end")
    .eq("id", subscriptionId)
    .eq("student_profile_id", studentId)
    .maybeSingle();
  if (!sub || !["trialing", "active", "past_due"].includes((sub as any).status)) {
    return { ok: false, errorKey: "cancel.err" };
  }

  const { error } = await admin
    .from("child_subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", subscriptionId);
  if (error) return { ok: false, errorKey: "cancel.err" };

  // Keep access until the paid period ends. If the period is already over (or
  // unknown), expire access now so the child isn't left on a stale "active" state.
  const periodEnd = (sub as any).current_period_end
    ? new Date((sub as any).current_period_end).getTime()
    : 0;
  if (!periodEnd || periodEnd <= Date.now()) {
    await admin
      .from("students")
      .update({ access_status: "expired" })
      .eq("profile_id", studentId);
  }

  // reason is captured for demo UX only; there is no cancel_reason column to persist to.
  void reason;

  // Notify the parent that the plan will end at the period end (best-effort;
  // idempotency keyed on the subscription id).
  await notifySubscriptionCanceled({
    parentProfileId,
    studentProfileId: studentId,
    subscriptionId,
  });

  await writeAuditLog(parentProfileId, "parent.subscription_cancel", {
    targetTable: "child_subscriptions",
    targetId: subscriptionId,
  });

  revalidatePath("/subscription");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---- Mid-cycle plan-change preview (quote_plan_change) -----------------------
// Read-only preview of the SAME math apply_plan_change will charge (the RPC is
// the single source of truth — the preview can never drift from the applied
// amount). No payment-mode gate here: quoting is informational, exactly like
// quoteSubscriptionCore for the initial-subscribe flow; the gate is enforced at
// APPLY time in updateSubscriptionSubjectsCore below.
//
// PRORATION IS RETIRED (owner, 2026-08-17). `dueNow` is the ADDED subjects'
// FULL first cycles at the sibling rate, each starting today; the six proration
// fields the RPC still returns for its own legacy shape (prorated,
// proration_waived, added_base, remaining_ratio, days_remaining, period_days)
// are NOT parsed here, so no surface can render a number the model no longer
// has. Everything kept below is read by a real caller.

export type SubjectChangeQuote = {
  subscriptionId: string;
  status: string;
  /** The subscription's DEFAULT cycle — what a newly added subject opens on. */
  interval: string;
  currency: string;
  discountPercent: number;
  currentRecurringTotal: number;
  newRecurringTotal: number;
  /**
   * Charged NOW: each added subject's FULL first period at the sibling rate,
   * never a part-period top-up. 0 for a removal-only or cycle-change-only diff,
   * and 0 during a trial (the adds ride the trial like every other subject).
   */
  dueNow: number;
  /** The next charge date — used to say WHEN a 0 due-now change is first billed. */
  effectiveFrom: string | null;
  /**
   * LEGACY SCALAR: the LAST of the removed subjects' own period ends. Kept for
   * already-shipped mobile binaries, which fall back to it when `removals` is
   * empty; the web reads the per-subject `removals` list instead.
   */
  removalsEffectiveAt: string | null;
  // ---- migration 109, all OPTIONAL so no existing consumer breaks ----------
  /** The desired basket, priced per subject at its own cycle. */
  items?: { subject_id: string; interval: string; price: number | null }[];
  /** Per-cycle subtotals of the desired basket. */
  groups?: Record<
    string,
    { count: number; base: number; discount: number; total: number }
  >;
  /** One entry per cycle in use: when it renews and for how much. */
  renewals?: { interval: string; next_at: string | null; total: number }[];
  /**
   * Per-subject removal dates. `removalsEffectiveAt` above is ONE scalar and
   * cannot describe a plan whose subjects run to different dates — dropping a
   * yearly subject from a plan that also holds a weekly one used to be reported
   * as "access ends in 7 days" while the database granted a year. The UI reads
   * these entries; the scalar stays only for already-shipped mobile binaries.
   */
  removals?: { subject_id: string; remove_at: string | null }[];
  /** Cycle changes scheduled at each subject's own renewal (never charged now). */
  planChanges?: { subject_id: string; from: string; to: string; effective_at: string | null }[];
  /** More than one distinct cycle — no single periodic total is honest. */
  mixed?: boolean;
};

export type SubjectChangeQuoteCoreResult =
  | { ok: true; quote: SubjectChangeQuote }
  | { ok: false; errorKey: string };

export async function quoteSubjectChangeCore(params: {
  parentProfileId: string;
  studentId: string;
  add: string[];
  remove: string[];
  /**
   * The DESIRED FULL set with per-subject cycles (migration 109). When present
   * the server diffs it itself through quote_plan_change — the client never
   * computes a diff and never sends a price. Absent = the historical
   * add/remove shape, kept for already-shipped mobile binaries; the server
   * composes the SAME basket from the live plan and calls the same RPC.
   */
  items?: PlanItemInput[];
}): Promise<SubjectChangeQuoteCoreResult> {
  const { parentProfileId, studentId } = params;
  // L4: only UUID-shaped ids, same hard cap as the batch editor.
  const add = (params.add ?? []).filter(isUuid).slice(0, 20);
  const remove = (params.remove ?? []).filter(isUuid).slice(0, 20);
  const usingItems = Array.isArray(params.items) && params.items.length > 0;
  if (!isUuid(studentId)) return { ok: false, errorKey: "sub.err.invalid" };
  if (!usingItems && add.length === 0 && remove.length === 0) {
    return { ok: false, errorKey: "sub.err.invalid" };
  }
  const suppliedItems = usingItems ? validatePlanItems(params.items) : null;
  if (usingItems && !suppliedItems) return { ok: false, errorKey: "sub.err.invalid" };
  if (!(await ownsChildCore(parentProfileId, studentId))) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  // Subject-ids-only caller: the SERVER derives the basket (see readLivePlan).
  // There is no second RPC to fall back to — migration 118 dropped it.
  let planItems = suppliedItems;
  if (!planItems) {
    const live = await readLivePlan(studentId);
    // No live subscription to change (the manage page only renders once one
    // exists, but it can be canceled concurrently in another tab).
    if (!live) return { ok: false, errorKey: "subjedit.err.addFailed" };
    const desired = desiredFromAddRemove(live, add, remove);
    if (desired.length === 0) return { ok: false, errorKey: "subjedit.minOne" };
    planItems = validatePlanItems(derivePlanItems(desired, live));
    if (!planItems) return { ok: false, errorKey: "sub.err.invalid" };
  }

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("quote_plan_change", {
    p_student_profile_id: studentId,
    p_items: planItems,
  });
  if (error) {
    // no_data_found = no live subscription to change (should not normally
    // happen — the manage-subjects page only renders once one exists — but a
    // subscription can be canceled concurrently in another tab).
    if ((error as { code?: string }).code === PG_NO_DATA_FOUND) {
      return { ok: false, errorKey: "subjedit.err.addFailed" };
    }
    return { ok: false, errorKey: "sub.err.failed" };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    quote: {
      subscriptionId: String(r.subscription_id ?? ""),
      status: String(r.status ?? ""),
      interval: String(r.interval ?? ""),
      currency: String(r.currency ?? "AZN"),
      discountPercent: Number(r.discount_percent ?? 0),
      currentRecurringTotal: Number(r.current_recurring_total ?? 0),
      newRecurringTotal: Number(r.new_recurring_total ?? 0),
      dueNow: Number(r.due_now ?? 0),
      effectiveFrom: typeof r.effective_from === "string" ? r.effective_from : null,
      removalsEffectiveAt:
        typeof r.removals_effective_at === "string" ? r.removals_effective_at : null,
      ...readPlanShape(r),
      renewals: Array.isArray(r.renewals)
        ? (r.renewals as Record<string, unknown>[]).map((row) => ({
            interval: String(row?.interval ?? ""),
            next_at: typeof row?.next_at === "string" ? row.next_at : null,
            total: Number(row?.total ?? 0),
          }))
        : [],
      removals: Array.isArray(r.removals_effective)
        ? (r.removals_effective as Record<string, unknown>[]).map((row) => ({
            subject_id: String(row?.subject_id ?? ""),
            remove_at: typeof row?.remove_at === "string" ? row.remove_at : null,
          }))
        : [],
      planChanges: Array.isArray(r.plan_changes)
        ? (r.plan_changes as Record<string, unknown>[]).map((row) => ({
            subject_id: String(row?.subject_id ?? ""),
            from: String(row?.from ?? ""),
            to: String(row?.to ?? ""),
            effective_at:
              typeof row?.effective_at === "string" ? row.effective_at : null,
          }))
        : [],
    },
  };
}

// Deterministic idempotency key for ONE apply_plan_change call: the
// subscription + the sorted add/remove diff + a coarse 5-minute time bucket.
// A genuine retry of the SAME user action (network hiccup, accidental double
// submit) within the bucket replays the identical key, so apply_plan_change's
// unique-index replay guard returns the original outcome instead of charging
// twice. A deliberate later change with an identical diff (e.g. re-adding a
// subject removed weeks ago) lands in a new bucket and applies normally.
function buildSubjectChangeIdempotencyKey(
  subscriptionId: string,
  toAdd: string[],
  toRemove: string[],
  // Migration 109: the CYCLES are part of the change. Without them, switching a
  // subject from monthly to yearly inside the same 5-minute bucket hashes to the
  // key of the previous change and is swallowed as a replay — the parent's
  // cycle change would silently never apply.
  intervalKey = "",
): string {
  const BUCKET_MS = 5 * 60 * 1000;
  const bucket = Math.floor(Date.now() / BUCKET_MS);
  const addKey = [...toAdd].sort().join(",");
  const removeKey = [...toRemove].sort().join(",");
  return createHash("sha256")
    .update(`${subscriptionId}|${addKey}|${removeKey}|${intervalKey}|${bucket}`)
    .digest("hex");
}

// ---- Batch plan update from the Manage-Subjects editor -----------------------
// The caller posts the DESIRED full set. The server computes the diff against
// the live subscription and applies it through ONE apply_plan_change call:
// each ADDED subject opens its OWN full period at now() and is charged that
// full period, each REMOVED subject keeps access to its own period end (no
// refund), and a CYCLE change is scheduled for that subject's own renewal.
// Amounts are never client-set, ≥1 subject must remain, and the same
// payment-mode gate as any other billing change applies.

export type SubjectsUpdateCoreResult =
  | { ok: true; added: number; removed: number; planChanged: number }
  | { ok: false; errorKey: string };

export async function updateSubscriptionSubjectsCore(params: {
  parentProfileId: string;
  studentId: string;
  subjectIds: string[];
  /**
   * The DESIRED FULL set with per-subject cycles (migration 109). The server
   * computes adds / removes / cycle changes itself — the client never sends a
   * diff and never a price. Absent = the historical subject-only shape; the
   * server then derives each subject's cycle from the live plan (readLivePlan)
   * and applies the SAME RPC. There is no separate subject-only RPC any more.
   */
  items?: PlanItemInput[];
  isFreeAccessActive: FreeAccessChecker;
}): Promise<SubjectsUpdateCoreResult> {
  const { parentProfileId, studentId } = params;
  const usingItems = Array.isArray(params.items) && params.items.length > 0;
  const desired = usingItems
    ? params.items!.map((i) => i.subjectId).filter(isUuid)
    : params.subjectIds.filter(isUuid);
  if (!isUuid(studentId) || desired.length > 20) {
    return { ok: false, errorKey: "sub.err.invalid" };
  }
  if (desired.length === 0) return { ok: false, errorKey: "subjedit.minOne" };
  const suppliedItems = usingItems ? validatePlanItems(params.items) : null;
  if (usingItems && !suppliedItems) return { ok: false, errorKey: "sub.err.invalid" };
  if (!(await ownsChildCore(parentProfileId, studentId))) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  // Billing change → same payment-mode / free-access gate as starting a plan,
  // scoped to this child.
  const gateKey = await paidMutationGateKey(studentId, params.isFreeAccessActive);
  if (gateKey) return { ok: false, errorKey: gateKey };

  const admin = getAdminClient();

  // Current coverage of the child's live subscription. A row scheduled for
  // removal is NOT current coverage: it keeps its row until its own period end,
  // but the go-forward plan no longer contains it. Counting it as covered made
  // re-adding it invisible to this diff — the request short-circuited with
  // ok/0/0/0 and apply_plan_change (whose upsert is what clears remove_at) was
  // never called, so "undo the removal" silently did nothing while the UI
  // reported success.
  const live = await readLivePlan(studentId);
  if (!live) return { ok: false, errorKey: "subjedit.err.addFailed" };
  const { subscriptionId, activeRows } = live;

  // Subject-ids-only caller: derive the basket server-side, each kept subject on
  // its own effective cycle and each new one on the subscription default.
  const planItems = suppliedItems ?? validatePlanItems(derivePlanItems(desired, live));
  if (!planItems) return { ok: false, errorKey: "sub.err.invalid" };

  const current = new Set(activeRows.map((r) => r.subject_id));
  const want = new Set(desired);
  // The cycle a subject is EFFECTIVELY on: a scheduled change first, then its
  // own cycle, then the subscription default. Comparing against `interval`
  // alone dropped two real changes — a row whose interval is still NULL (legal
  // since 007) could never be moved, and re-selecting the original cycle could
  // never cancel a scheduled change. Mirrors quote_plan_change exactly.
  const rowById = new Map(activeRows.map((r) => [r.subject_id, r]));

  const toAdd = desired.filter((id) => !current.has(id));
  const toRemove = Array.from(current).filter((id) => !want.has(id));
  // A cycle change on an already-covered subject is a real change even though
  // the subject set is identical — without this the "no diff" short-circuit
  // below would swallow it. A DERIVED basket produces none by construction: its
  // cycles ARE the effective ones.
  const toChangePlan = planItems.filter(
    (i) =>
      current.has(i.subject_id) &&
      effectivePlanInterval(rowById.get(i.subject_id), live.interval) !== i.interval,
  );

  if (toAdd.length === 0 && toRemove.length === 0 && toChangePlan.length === 0) {
    return { ok: true, added: 0, removed: 0, planChanged: 0 };
  }

  const idempotencyKey = buildSubjectChangeIdempotencyKey(
    subscriptionId,
    toAdd,
    toRemove,
    planItems
      .map((i) => `${i.subject_id}:${i.interval}`)
      .sort()
      .join(","),
  );

  const { error } = await admin.rpc("apply_plan_change", {
    p_student_profile_id: studentId,
    p_items: planItems,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    const code = (error as { code?: string }).code;
    const hint = (error as { hint?: string | null }).hint ?? "";
    // check_violation + hint 'last_subject' = the diff would leave zero
    // subjects on the plan (the RPC's own guard — the client cap above already
    // tries to prevent this, this is the authoritative backstop).
    if (code === PG_CHECK_VIOLATION && hint === "last_subject") {
      return { ok: false, errorKey: "subjedit.minOne" };
    }
    // Round 51 (audit F6): the DB payment kill switch blocked the ADD side
    // (assert_payments_enabled, migrations 089/091) — friendly notice, not
    // the generic "add failed".
    if (code === PG_CHECK_VIOLATION && hint === "payments_disabled") {
      return { ok: false, errorKey: "gate.paymentsOff" };
    }
    // Migration 109: plan_items_normalize rejected the basket. The web/BFF
    // validator above already enforces the same rules, so reaching this means a
    // hand-crafted payload — generic key, never the DB's own text.
    if (
      code === PG_CHECK_VIOLATION &&
      (hint === "bad_interval" ||
        hint === "too_many_subjects" ||
        hint === "bad_items" ||
        hint === "bad_subject")
    ) {
      return { ok: false, errorKey: "sub.err.invalid" };
    }
    // no_data_found = no live subscription (race: canceled between our SELECT
    // above and this call).
    if (code === PG_NO_DATA_FOUND) {
      return { ok: false, errorKey: "subjedit.err.addFailed" };
    }
    return {
      ok: false,
      errorKey: toAdd.length > 0 ? "subjedit.err.addFailed" : "subjedit.err.removeFailed",
    };
  }

  // One entry per operation type actually performed (a single request can add
  // AND remove subjects at once).
  if (toAdd.length > 0) {
    await writeAuditLog(parentProfileId, "parent.subscription_subjects_change", {
      targetTable: "students",
      targetId: studentId,
      metadata: { op: "add", subject_count: toAdd.length },
    });
  }
  if (toRemove.length > 0) {
    await writeAuditLog(parentProfileId, "parent.subscription_subjects_change", {
      targetTable: "students",
      targetId: studentId,
      metadata: { op: "remove", subject_count: toRemove.length },
    });
  }
  if (toChangePlan.length > 0) {
    await writeAuditLog(parentProfileId, "parent.subscription_subjects_change", {
      targetTable: "students",
      targetId: studentId,
      metadata: { op: "plan_change", subject_count: toChangePlan.length },
    });
  }

  revalidatePath(`/children/${studentId}/subscribe`);
  revalidatePath("/subscription");
  revalidatePath("/dashboard");
  return {
    ok: true,
    added: toAdd.length,
    removed: toRemove.length,
    planChanged: toChangePlan.length,
  };
}

// ---- Round 11 (item 6): add-child during an active GIVEAWAY window -----------
// No plan selection + payment: the child gets their 8-digit login ID immediately
// (activate_child_login_id — NO subscription row) and platform access comes from
// the server-side giveaway override. H8: an ACTIVE per-child FREE-ACCESS
// interval qualifies the same way (same override model).

export type GiveawayActivateCoreResult =
  | { ok: true; childUniqueId: string | null }
  | { ok: false; errorKey: string };

export async function activateChildGiveawayCore(params: {
  parentProfileId: string;
  studentId: string;
  isFreeAccessActive: FreeAccessChecker;
}): Promise<GiveawayActivateCoreResult> {
  const { parentProfileId, studentId } = params;
  if (!isUuid(studentId)) return { ok: false, errorKey: "sub.err.invalid" };

  if (!(await ownsChildCore(parentProfileId, studentId))) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  // Only valid while a free window is actually running (server-computed): the
  // global giveaway OR an active free-access interval covering THIS child.
  const { mode } = await getPaymentModeInfo();
  if (mode !== "giveaway" && !(await params.isFreeAccessActive(studentId))) {
    return { ok: false, errorKey: "sub.err.invalid" };
  }

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("activate_child_login_id", {
    p_student_profile_id: studentId,
  });
  if (error) return { ok: false, errorKey: "sub.err.idFailed" };

  const result = (data ?? {}) as Record<string, unknown>;
  const childUniqueId =
    typeof result.new_child_unique_id === "string" ? result.new_child_unique_id : null;
  const authUserId =
    typeof result.auth_user_id === "string" ? result.auth_user_id : null;
  if (childUniqueId && authUserId) {
    const emailRes = await applyAllocatedChildEmail({ authUserId, childUniqueId });
    if (!emailRes.ok) return { ok: false, errorKey: "sub.err.idFailed" };
  }

  revalidatePath("/dashboard");
  return { ok: true, childUniqueId };
}
