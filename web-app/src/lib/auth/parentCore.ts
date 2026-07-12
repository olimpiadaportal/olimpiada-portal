// SERVER-ONLY parent CORES (Stage M2) — the cookie-free hearts of
// updateChildProfile and deleteParentAccount (lib/auth/parentService), shared
// by the web actions (requireParent/getParent + getT) and the mobile BFF
// (resolveBearerParent + verbatim keys). Ownership re-verification, field
// normalization/caps, validateChildInfo and the deletion cascade are exactly
// the historical action behavior. Errors are i18n KEYS, never localized text.
//
// (addChild and resetChildPasswordAction need no extraction: their cores have
// always been lib/auth/childAccountService.createChild / resetChildPassword.)
import "server-only";
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { validateChildInfo } from "@/lib/auth/children";
import { NAME_MAX } from "@/lib/auth/parentValidation";
import { isUuid } from "@/lib/uuid";

// Internal identifiers (child_unique_id, profile/DB ids) are NEVER editable
// here — only the human-facing info a parent may correct.
const SCHOOL_NAME_MAX = 160;
const CLASS_GRADE_MAX = 40;
const CITY_MAX = 120;

export type UpdateChildProfileCoreResult =
  | { ok: true }
  | { ok: false; errorKey: "childedit.err.generic" | "childedit.err.notYourChild" }
  | { ok: false; validationErrors: string[] };

/**
 * Parent edits a child's profile info AFTER creation. Raw client strings in —
 * the core applies the exact web transforms (trim + per-field caps, "" → null
 * for optional fields) so both surfaces normalize identically.
 */
export async function updateChildProfileCore(params: {
  parentProfileId: string;
  studentProfileId: string;
  firstName: string;
  lastName: string;
  districtId: string;
  schoolId: string;
  gradeId: string;
  schoolName: string;
  classGrade: string;
  city: string;
}): Promise<UpdateChildProfileCoreResult> {
  const { parentProfileId, studentProfileId } = params;
  if (!isUuid(studentProfileId)) return { ok: false, errorKey: "childedit.err.generic" };

  const admin = getAdminClient();
  // Re-verify OWNERSHIP server-side (the parent must have created this child).
  // RLS also enforces this, but we never trust the client-supplied id.
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentProfileId)
    .maybeSingle();
  if (!student || student.created_by_parent_profile_id !== parentProfileId) {
    return { ok: false, errorKey: "childedit.err.notYourChild" };
  }

  const firstName = params.firstName.trim().slice(0, NAME_MAX);
  const lastName = params.lastName.trim().slice(0, NAME_MAX);
  const districtId = params.districtId.trim() || null;
  const schoolId = params.schoolId.trim() || null;
  const gradeId = params.gradeId.trim() || null;
  const schoolName = params.schoolName.trim().slice(0, SCHOOL_NAME_MAX) || null;
  const classGrade = params.classGrade.trim().slice(0, CLASS_GRADE_MAX) || null;
  const city = params.city.trim().slice(0, CITY_MAX) || null;

  // Same server-side validation the create flow uses (names present + capped,
  // city/school/grade ids UUID-shaped). Returns i18n keys the UI localizes.
  const check = validateChildInfo({ firstName, lastName, districtId, schoolId, gradeId });
  if (!check.ok) return { ok: false, validationErrors: check.errors };

  const { error } = await admin
    .from("students")
    .update({
      first_name: firstName,
      last_name: lastName,
      grade_id: gradeId,
      district_id: districtId,
      school_id: schoolId,
      // Free-text fallbacks kept in sync with the structured FKs (the child's
      // read-only profile card uses them when a join is unavailable).
      city,
      school_name: schoolName,
      class_grade: classGrade,
    })
    .eq("profile_id", studentProfileId);
  if (error) return { ok: false, errorKey: "childedit.err.generic" };

  // Keep the child's display_name (used e.g. on the leaderboard) in sync with
  // the edited names. Best-effort — never fail the edit on this.
  const display = `${firstName} ${lastName}`.trim();
  if (display) {
    await admin.from("profiles").update({ display_name: display }).eq("id", studentProfileId);
  }

  // AFTER the write: refresh every surface that renders this child's info so
  // navigating back (or reloading the edit page) never shows stale data.
  revalidatePath("/dashboard");
  revalidatePath(`/children/${studentProfileId}/edit`);
  return { ok: true };
}

/**
 * Self-serve account deletion: deletes the parent's children (auth users →
 * cascade students/credentials/links), then the parent auth user (cascades
 * profile/parents/links). The caller MUST have authorized the parent first;
 * the web action additionally signs the session out, the BFF's token simply
 * stops verifying once the auth user is gone.
 */
export async function deleteParentAccountCore(params: {
  parentProfileId: string;
  authUserId: string | null;
}): Promise<void> {
  const admin = getAdminClient();

  // Delete the parent's children (auth users → cascade students/credentials/links).
  const { data: students } = await admin
    .from("students")
    .select("profile_id")
    .eq("created_by_parent_profile_id", params.parentProfileId);
  const studentIds = (students ?? []).map((s: { profile_id: string }) => s.profile_id);
  if (studentIds.length > 0) {
    const { data: creds } = await admin
      .from("child_credentials")
      .select("auth_user_id")
      .in("student_profile_id", studentIds);
    for (const c of (creds ?? []) as { auth_user_id: string }[]) {
      await admin.auth.admin.deleteUser(c.auth_user_id).catch(() => {});
    }
  }

  // Delete the parent auth user (cascades profile/parents/links).
  if (params.authUserId) {
    await admin.auth.admin.deleteUser(params.authUserId).catch(() => {});
  }
}
