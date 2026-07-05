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

// Round 11: paid mutations are gated by the PAYMENT MODE, not the raw flag —
// 'real'/'demo' allow the transaction, 'off' blocks it (existing UX), and
// 'giveaway' blocks paid WRITES with a friendly "it's free right now" message
// (access during the window comes from the server-side giveaway override, so
// nothing has to be unwound when the window expires).
async function paidMutationGate(): Promise<string | null> {
  const t = await getT();
  const { mode } = await getPaymentModeInfo();
  if (mode === "off") return t("gate.paymentsOff");
  if (mode === "giveaway") return t("gate.giveawayFree");
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // Payment-mode gate (admin Settings): enforced SERVER-side so a hand-crafted
  // POST can't start a subscription while payments are off / free.
  const gateError = await paidMutationGate();
  if (gateError) return { ok: false, error: gateError };
  const studentId = String(formData.get("student_id") ?? "");
  const interval = String(formData.get("interval") ?? "");
  const subjectIds = formData.getAll("subject").map(String).filter(Boolean);

  if (!studentId || !["week", "month", "year"].includes(interval)) {
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
  return {
    ok: true,
    result: { ...(result as any), childUniqueId },
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
  const { studentId, interval, subjectIds } = args;
  if (!studentId || !["week", "month", "year"].includes(interval)) {
    return { ok: false, error: t("sub.err.invalid") };
  }
  if (!subjectIds || subjectIds.length === 0) {
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
export type SubjectEditState = { ok?: boolean; error?: string } | null;

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

export async function addSubjectAction(
  _prev: SubjectEditState,
  formData: FormData,
): Promise<SubjectEditState> {
  const t = await getT();
  // Adding a subject re-prices the live subscription — a billing change, so it
  // is gated by the same payment-mode rules as starting one.
  const gateError = await paidMutationGate();
  if (gateError) return { error: gateError };
  const studentId = String(formData.get("student_id") ?? "");
  const subjectId = String(formData.get("subject_id") ?? "");
  if (!studentId || !subjectId) return { error: t("sub.err.invalid") };
  if (!(await ownsChild(studentId))) return { error: t("sub.err.notYourChild") };

  const admin = getAdminClient();
  const { error } = await admin.rpc("add_subscription_subject", {
    p_student_profile_id: studentId,
    p_subject_id: subjectId,
  });
  if (error) return { error: t("subjedit.err.addFailed") };
  revalidatePath(`/children/${studentId}/subscribe`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeSubjectAction(
  _prev: SubjectEditState,
  formData: FormData,
): Promise<SubjectEditState> {
  const t = await getT();
  // Also a billing change (re-price) — same payment-mode gate. Cancel stays
  // OPEN: stopping billing must always be possible for the parent.
  const gateError = await paidMutationGate();
  if (gateError) return { error: gateError };
  const studentId = String(formData.get("student_id") ?? "");
  const subjectId = String(formData.get("subject_id") ?? "");
  if (!studentId || !subjectId) return { error: t("sub.err.invalid") };
  if (!(await ownsChild(studentId))) return { error: t("sub.err.notYourChild") };

  const admin = getAdminClient();
  const { error } = await admin.rpc("remove_subscription_subject", {
    p_student_profile_id: studentId,
    p_subject_id: subjectId,
  });
  if (error) return { error: t("subjedit.err.removeFailed") };
  revalidatePath(`/children/${studentId}/subscribe`);
  revalidatePath("/dashboard");
  return { ok: true };
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
// AFTER verifying ownership (mirrors subscribeChild / add/removeSubjectAction).
export type CancelSubscriptionState = { ok?: boolean; error?: string } | null;

export async function cancelChildSubscription(
  _prev: CancelSubscriptionState,
  formData: FormData,
): Promise<CancelSubscriptionState> {
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
  const t = await getT();
  const gateError = await paidMutationGate();
  if (gateError) return { ok: false, error: gateError };

  const studentId = String(formData.get("student_id") ?? "");
  const desired = formData
    .getAll("subject")
    .map(String)
    .filter((id) => UUID_RE.test(id));
  if (!UUID_RE.test(studentId) || desired.length > 20) {
    return { ok: false, error: t("sub.err.invalid") };
  }
  if (desired.length === 0) return { ok: false, error: t("subjedit.minOne") };
  if (!(await ownsChild(studentId))) return { ok: false, error: t("sub.err.notYourChild") };

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
// their own — nothing to unwind.
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

  // Only valid while the giveaway window is actually running (server-computed).
  const { mode } = await getPaymentModeInfo();
  if (mode !== "giveaway") return { ok: false, error: t("sub.err.invalid") };

  const studentId = String(formData.get("student_id") ?? "");
  if (!UUID_RE.test(studentId)) return { ok: false, error: t("sub.err.invalid") };

  const admin = getAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentId)
    .maybeSingle();
  if (!student || student.created_by_parent_profile_id !== parent.profileId) {
    return { ok: false, error: t("sub.err.notYourChild") };
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
