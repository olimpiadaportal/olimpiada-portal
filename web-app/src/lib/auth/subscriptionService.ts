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
  if (error) return { ok: false, error: error.message };

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
  if (error) return { ok: false, error: error.message };
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
