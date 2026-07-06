"use server";

// Stage 11 — start a child subscription (7-day trial). The parent picks subjects
// + interval; PRICE, sibling discount and trial are computed server-side by the
// create_child_subscription RPC (the client never sets amounts). Real payment
// charge is provider-specific and stubbed until a provider is chosen — the trial
// grants initial access with no charge.
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireParent } from "@/lib/auth/session";
import { applyAllocatedChildEmail } from "@/lib/auth/childAccountService";
import { getT } from "@/i18n/server";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { isChildFreeAccessActive } from "@/lib/freeAccess";
import { isUuid } from "@/lib/uuid";

// Round 11: paid mutations are gated by the PAYMENT MODE, not the raw flag —
// 'real'/'demo' allow the transaction, 'off' blocks it (existing UX), and
// 'giveaway' blocks paid WRITES with a friendly "it's free right now" message
// (access during the window comes from the server-side giveaway override, so
// nothing has to be unwound when the window expires). Round 12: an active
// FREE-ACCESS interval blocks paid writes the same way — but scoped to THIS
// child, so a window for one child never blocks paying for an uncovered sibling.
async function paidMutationGate(studentId?: string): Promise<string | null> {
  const t = await getT();
  const { mode } = await getPaymentModeInfo();
  if (mode === "off") return t("gate.paymentsOff");
  if (mode === "giveaway") return t("gate.giveawayFree");
  if (studentId && (await isChildFreeAccessActive(studentId))) {
    return t("gate.freeAccess");
  }
  return null;
}

export type SubscribeState =
  | {
      ok: boolean;
      result?: {
        base: number;
        discount_percent: number;
        discount: number;
        total: number;
        trial_days: number;
        currency: string;
        // Batch H: the 8-digit login ID is allocated on subscribe — reveal it here.
        childUniqueId?: string | null;
      };
      error?: string;
    }
  | null;

export async function subscribeChild(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  // Payment-mode gate (admin Settings): enforced SERVER-side so a hand-crafted
  // POST can't start a subscription while payments are off / free. Scoped to this
  // child so a free window for a sibling doesn't block paying for this one.
  const gateError = await paidMutationGate(studentId);
  if (gateError) return { ok: false, error: gateError };
  const interval = String(formData.get("interval") ?? "");
  // L4: only UUID-shaped subject ids, hard cap 20 (mirrors updateSubscriptionSubjectsAction).
  const subjectIds = formData.getAll("subject").map(String).filter(isUuid);

  if (!studentId || !["week", "month", "year"].includes(interval) || subjectIds.length > 20) {
    return { ok: false, error: t("sub.err.invalid") };
  }
  if (subjectIds.length === 0) return { ok: false, error: t("sub.err.noSubjects") };

  const admin = getAdminClient();
  // Authorize: the parent must own this child.
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  if (!student || student.created_by_parent_profile_id !== parent.profileId) {
    return { ok: false, error: t("sub.err.notYourChild") };
  }

  const { data, error } = await admin.rpc("create_child_subscription", {
    p_student_profile_id: studentId,
    p_interval: interval,
    p_subject_ids: subjectIds,
  });
  // R7 security: never surface raw Postgres error text (schema/constraint
  // details) to the client — generic message only.
  if (error) return { ok: false, error: t("sub.err.failed") };

  // Batch H: the RPC allocated the deferred 8-digit ID (first plan for this child).
  // Set the canonical synthetic auth email so the child can log in with the ID.
  const result = (data ?? {}) as Record<string, unknown>;
  const childUniqueId =
    typeof result.new_child_unique_id === "string" ? result.new_child_unique_id : null;
  const authUserId =
    typeof result.auth_user_id === "string" ? result.auth_user_id : null;
  if (childUniqueId && authUserId) {
    const emailRes = await applyAllocatedChildEmail({ authUserId, childUniqueId });
    if (!emailRes.ok) return { ok: false, error: t("sub.err.idFailed") };
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
      trial_days: number;
      currency: string;
    }
  | { ok: false; error?: string };

export async function quoteSubscription(args: {
  studentId: string;
  interval: string;
  subjectIds: string[];
}): Promise<QuoteResult> {
  const t = await getT();
  const { studentId, interval } = args;
  // L4: only UUID-shaped subject ids, hard cap 20 (mirrors updateSubscriptionSubjectsAction).
  const subjectIds = (args.subjectIds ?? []).filter(isUuid);
  if (!studentId || !["week", "month", "year"].includes(interval) || subjectIds.length > 20) {
    return { ok: false, error: t("sub.err.invalid") };
  }
  if (subjectIds.length === 0) {
    return { ok: false, error: t("sub.err.noSubjects") };
  }
  if (!(await ownsChild(studentId))) return { ok: false, error: t("sub.err.notYourChild") };

  const admin = getAdminClient();
  const { data, error } = await admin.rpc("quote_child_subscription", {
    p_student_profile_id: studentId,
    p_interval: interval,
    p_subject_ids: subjectIds,
  });
  if (error) return { ok: false, error: t("sub.err.failed") };
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

// ---- Batch H: edit subjects on an existing child's live subscription ----------
// (Single entry point: updateSubscriptionSubjectsAction below — the old
// per-subject add/remove actions were removed as dead code.)
async function ownsChild(studentId: string): Promise<boolean> {
  const parent = await requireParent();
  const admin = getAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  return !!student && student.created_by_parent_profile_id === parent.profileId;
}

// ---- W2: cancel a child's current subscription (parent-initiated) -------------
// Demo-safe: no real payment reversal. We authorize that the parent owns the child
// (same ownsChild gate as the other privileged parent actions), then flip the
// child's live subscription (trialing/active/past_due) to 'canceled'. Access is
// KEPT until the current period end — we do NOT immediately expire the student, so
// a mid-period cancel still lets the child use what was paid for; the daily
// access-recompute job downgrades access to 'expired' once current_period_end
// passes. RLS restricts a parent to reading their own children only and does not
// grant UPDATE on child_subscriptions, so we use the service-role admin client
// AFTER verifying ownership (mirrors subscribeChild / updateSubscriptionSubjectsAction).
export type CancelSubscriptionState = { ok?: boolean; error?: string } | null;

export async function cancelChildSubscription(
  _prev: CancelSubscriptionState,
  formData: FormData,
): Promise<CancelSubscriptionState> {
  // M7: authorize FIRST — before touching FormData.
  await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  const subscriptionId = String(formData.get("subscription_id") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 60);
  if (!studentId || !subscriptionId) return { error: t("sub.err.invalid") };
  if (!(await ownsChild(studentId))) return { error: t("sub.err.notYourChild") };

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
    return { error: t("cancel.err") };
  }

  const { error } = await admin
    .from("child_subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", subscriptionId);
  if (error) return { error: t("cancel.err") };

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

  revalidatePath("/subscription");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---- Round 11 (item 1): batch subject update from the checkbox editor ---------
// The Manage-Subjects UI posts the DESIRED full subject set (checkboxes). The
// server computes the diff against the live subscription and applies it through
// the existing re-pricing RPCs — amounts are never client-set, ≥1 subject must
// remain, and the same payment-mode gate as any other billing change applies.
export type SubjectsUpdateState =
  | { ok: true; added: number; removed: number }
  | { ok: false; error: string }
  | null;

export async function updateSubscriptionSubjectsAction(
  _prev: SubjectsUpdateState,
  formData: FormData,
): Promise<SubjectsUpdateState> {
  // M7: authorize FIRST — before touching FormData; the billing gate runs only
  // after ownership is proven (it still receives this child's id).
  await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");

  const desired = formData
    .getAll("subject")
    .map(String)
    .filter(isUuid);
  if (!isUuid(studentId) || desired.length > 20) {
    return { ok: false, error: t("sub.err.invalid") };
  }
  if (desired.length === 0) return { ok: false, error: t("subjedit.minOne") };
  if (!(await ownsChild(studentId))) return { ok: false, error: t("sub.err.notYourChild") };

  // Billing change → same payment-mode / free-access gate as starting a plan,
  // scoped to this child.
  const gateError = await paidMutationGate(studentId);
  if (gateError) return { ok: false, error: gateError };

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
  if (!sub?.id) return { ok: false, error: t("subjedit.err.addFailed") };

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
    if (error) return { ok: false, error: t("subjedit.err.addFailed") };
  }
  for (const id of toRemove) {
    const { error } = await admin.rpc("remove_subscription_subject", {
      p_student_profile_id: studentId,
      p_subject_id: id,
    });
    if (error) return { ok: false, error: t("subjedit.err.removeFailed") };
  }

  revalidatePath(`/children/${studentId}/subscribe`);
  revalidatePath("/subscription");
  revalidatePath("/dashboard");
  return { ok: true, added: toAdd.length, removed: toRemove.length };
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
  if (!isUuid(studentId)) return { ok: false, error: t("sub.err.invalid") };

  const admin = getAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  if (!student || student.created_by_parent_profile_id !== parent.profileId) {
    return { ok: false, error: t("sub.err.notYourChild") };
  }

  // Only valid while a free window is actually running (server-computed): the
  // global giveaway OR an active free-access interval covering THIS child.
  const { mode } = await getPaymentModeInfo();
  if (mode !== "giveaway" && !(await isChildFreeAccessActive(studentId))) {
    return { ok: false, error: t("sub.err.invalid") };
  }

  const { data, error } = await admin.rpc("activate_child_login_id", {
    p_student_profile_id: studentId,
  });
  if (error) return { ok: false, error: t("sub.err.idFailed") };

  const result = (data ?? {}) as Record<string, unknown>;
  const childUniqueId =
    typeof result.new_child_unique_id === "string" ? result.new_child_unique_id : null;
  const authUserId =
    typeof result.auth_user_id === "string" ? result.auth_user_id : null;
  if (childUniqueId && authUserId) {
    const emailRes = await applyAllocatedChildEmail({ authUserId, childUniqueId });
    if (!emailRes.ok) return { ok: false, error: t("sub.err.idFailed") };
  }

  revalidatePath("/dashboard");
  return { ok: true, childUniqueId };
}
