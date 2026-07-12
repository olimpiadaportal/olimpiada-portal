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
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { applyAllocatedChildEmail } from "@/lib/auth/childAccountService";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { isUuid } from "@/lib/uuid";
import { notifySubscriptionCanceled } from "@/lib/notifications/events";

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
      };
    }
  | { ok: false; errorKey: string };

export async function subscribeChildCore(params: {
  parentProfileId: string;
  studentId: string;
  interval: string;
  subjectIds: string[];
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

  if (!studentId || !["week", "month", "year"].includes(interval) || subjectIds.length > 20) {
    return { ok: false, errorKey: "sub.err.invalid" };
  }
  if (subjectIds.length === 0) return { ok: false, errorKey: "sub.err.noSubjects" };

  // Authorize: the parent must own this child.
  if (!(await ownsChildCore(parentProfileId, studentId))) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("create_child_subscription", {
    p_student_profile_id: studentId,
    p_interval: interval,
    p_subject_ids: subjectIds,
  });
  // R7 security: never surface raw Postgres error text (schema/constraint
  // details) to the client — generic message only.
  if (error) return { ok: false, errorKey: "sub.err.failed" };

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

  revalidatePath("/dashboard");
  // L2: whitelist-copy the typed fields only — never spread the raw RPC payload
  // (it may carry internal fields like auth_user_id) back to the client.
  return {
    ok: true,
    result: {
      base: Number(result.base ?? 0),
      discount_percent: Number(result.discount_percent ?? 0),
      discount: Number(result.discount ?? 0),
      total: Number(result.total ?? 0),
      trial_days: Number(result.trial_days ?? 0),
      currency: String(result.currency ?? "AZN"),
      childUniqueId,
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
}): Promise<QuoteCoreResult> {
  const { studentId, interval } = params;
  // L4: only UUID-shaped subject ids, hard cap 20 (mirrors updateSubscriptionSubjectsCore).
  const subjectIds = (params.subjectIds ?? []).filter(isUuid);
  if (!studentId || !["week", "month", "year"].includes(interval) || subjectIds.length > 20) {
    return { ok: false, errorKey: "sub.err.invalid" };
  }
  if (subjectIds.length === 0) {
    return { ok: false, errorKey: "sub.err.noSubjects" };
  }
  if (!(await ownsChildCore(await params.resolveParentProfileId(), studentId))) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("quote_child_subscription", {
    p_student_profile_id: studentId,
    p_interval: interval,
    p_subject_ids: subjectIds,
  });
  if (error) return { ok: false, errorKey: "sub.err.failed" };
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    base: Number(r.base ?? 0),
    discount_percent: Number(r.discount_percent ?? 0),
    discount: Number(r.discount ?? 0),
    total: Number(r.total ?? 0),
    trial_days: Number(r.trial_days ?? 0),
    currency: String(r.currency ?? "AZN"),
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

  revalidatePath("/subscription");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---- Round 11 (item 1): batch subject update from the checkbox editor --------
// The caller posts the DESIRED full subject set. The server computes the diff
// against the live subscription and applies it through the existing re-pricing
// RPCs — amounts are never client-set, ≥1 subject must remain, and the same
// payment-mode gate as any other billing change applies.

export type SubjectsUpdateCoreResult =
  | { ok: true; added: number; removed: number }
  | { ok: false; errorKey: string };

export async function updateSubscriptionSubjectsCore(params: {
  parentProfileId: string;
  studentId: string;
  subjectIds: string[];
  isFreeAccessActive: FreeAccessChecker;
}): Promise<SubjectsUpdateCoreResult> {
  const { parentProfileId, studentId } = params;
  const desired = params.subjectIds.filter(isUuid);
  if (!isUuid(studentId) || desired.length > 20) {
    return { ok: false, errorKey: "sub.err.invalid" };
  }
  if (desired.length === 0) return { ok: false, errorKey: "subjedit.minOne" };
  if (!(await ownsChildCore(parentProfileId, studentId))) {
    return { ok: false, errorKey: "sub.err.notYourChild" };
  }

  // Billing change → same payment-mode / free-access gate as starting a plan,
  // scoped to this child.
  const gateKey = await paidMutationGateKey(studentId, params.isFreeAccessActive);
  if (gateKey) return { ok: false, errorKey: gateKey };

  const admin = getAdminClient();

  // Current coverage of the child's live subscription.
  const { data: sub } = await admin
    .from("child_subscriptions")
    .select("id")
    .eq("student_profile_id", studentId)
    .in("status", ["trialing", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub?.id) return { ok: false, errorKey: "subjedit.err.addFailed" };

  const { data: covered } = await admin
    .from("subscription_subjects")
    .select("subject_id")
    .eq("child_subscription_id", (sub as { id: string }).id);
  const current = new Set(
    ((covered ?? []) as { subject_id: string }[]).map((r) => r.subject_id),
  );
  const want = new Set(desired);

  const toAdd = desired.filter((id) => !current.has(id));
  const toRemove = Array.from(current).filter((id) => !want.has(id));

  // Apply additions first so the subscription can never transiently drop to 0
  // subjects (the RPC would also block it, but this keeps the path clean).
  for (const id of toAdd) {
    const { error } = await admin.rpc("add_subscription_subject", {
      p_student_profile_id: studentId,
      p_subject_id: id,
    });
    if (error) return { ok: false, errorKey: "subjedit.err.addFailed" };
  }
  for (const id of toRemove) {
    const { error } = await admin.rpc("remove_subscription_subject", {
      p_student_profile_id: studentId,
      p_subject_id: id,
    });
    if (error) return { ok: false, errorKey: "subjedit.err.removeFailed" };
  }

  revalidatePath(`/children/${studentId}/subscribe`);
  revalidatePath("/subscription");
  revalidatePath("/dashboard");
  return { ok: true, added: toAdd.length, removed: toRemove.length };
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
