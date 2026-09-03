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
import { writeAuditLog } from "@/lib/audit";
import { CHILD_AVATAR_BUCKET } from "@/lib/childAvatar";
import { AVATAR_BUCKET } from "@/lib/auth/avatarCore";

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
  /** The CITY (historic naming — table `districts` stores cities). */
  districtId: string;
  /**
   * Round 21: the intra-city district (rayon) = city_districts.id. Optional so
   * the mobile BFF (which doesn't send it yet) keeps compiling — a missing
   * value is treated as "" and the requiredness check below still REJECTS the
   * edit when the chosen city has active rayons.
   */
  cityDistrictId?: string;
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
  const cityDistrictId = (params.cityDistrictId ?? "").trim() || null;
  const schoolId = params.schoolId.trim() || null;
  const gradeId = params.gradeId.trim() || null;
  const schoolName = params.schoolName.trim().slice(0, SCHOOL_NAME_MAX) || null;
  const classGrade = params.classGrade.trim().slice(0, CLASS_GRADE_MAX) || null;
  const city = params.city.trim().slice(0, CITY_MAX) || null;

  // Same server-side validation the create flow uses (names present + capped,
  // city/school/grade ids UUID-shaped, rayon UUID-shaped when given). Returns
  // i18n keys the UI localizes.
  const check = validateChildInfo({
    firstName,
    lastName,
    districtId,
    cityDistrictId,
    schoolId,
    gradeId,
  });
  if (!check.ok) return { ok: false, validationErrors: check.errors };

  // Round 21: mirror the create RPC's requiredness rule — the rayon is
  // MANDATORY whenever the chosen city has active rayons. The client can't be
  // trusted to say whether the city has rayons, so re-check against the DB.
  if (districtId && !cityDistrictId) {
    const { count } = await admin
      .from("city_districts")
      .select("id", { count: "exact", head: true })
      .eq("city_id", districtId)
      .eq("status", "active");
    if ((count ?? 0) > 0) {
      return { ok: false, validationErrors: ["addchild.err.districtRequired"] };
    }
  }

  const { error } = await admin
    .from("students")
    .update({
      first_name: firstName,
      last_name: lastName,
      grade_id: gradeId,
      district_id: districtId,
      // Round 21: the rayon is posted TOGETHER with the school so the
      // trg_student_district_guard trigger never sees a school paired with a
      // stale contradicting rayon (it would reject with SQLSTATE 23514).
      city_district_id: cityDistrictId,
      school_id: schoolId,
      // Free-text fallbacks kept in sync with the structured FKs (the child's
      // read-only profile card uses them when a join is unavailable).
      city,
      school_name: schoolName,
      class_grade: classGrade,
    })
    .eq("profile_id", studentProfileId);
  if (error) {
    // The district guard trigger rejects (23514) a rayon outside the child's
    // city or contradicting the school's rayon — surface it as the district
    // field error (the parent must re-pick a rayon) instead of the generic one.
    if (error.code === "23514") {
      return { ok: false, validationErrors: ["addchild.err.districtRequired"] };
    }
    return { ok: false, errorKey: "childedit.err.generic" };
  }

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
 * Delete ONE auth user and PROVE it is gone. Returns null on success, or a
 * short reason for server-side logging.
 *
 * WHY THIS EXISTS AT ALL — the bug it replaces (fixed 2026-09-02). The old code
 * was `await admin.auth.admin.deleteUser(id).catch(() => {})`. That reads like
 * "delete, ignore failures", but it is worse: `deleteUser` CATCHES every
 * AuthError internally and RETURNS it as `{ data, error }` rather than throwing
 * (auth-js GoTrueAdminApi), so `.catch()` intercepts almost nothing and the
 * discarded return value was the only place a failure was ever reported. The
 * caller then answered `{ ok: true, deleted: true }` unconditionally.
 *
 * It was not theoretical: of five real account deletions in production, TWO
 * deleted nothing at all — auth user alive, unbanned, profile intact — while
 * the app told the person their account was gone. They could sign straight back
 * in, which is exactly the reported symptom, and nothing about it was
 * client-side or iOS-specific.
 *
 * THE VERIFY STEP IS NOT BELT AND BRACES. This whole class of bug is "we
 * assumed the call worked". A 2xx from GoTrue plus a follow-up read that still
 * finds the user is a state we must never report as success, so success is
 * defined as "the row is not there any more", not "the API did not complain".
 */
async function deleteAuthUserVerified(
  admin: ReturnType<typeof getAdminClient>,
  authUserId: string,
): Promise<string | null> {
  const { error } = await admin.auth.admin.deleteUser(authUserId);
  if (error) {
    // Already absent is the outcome we want, however we got here — deletion is
    // idempotent by intent, and a retry after a partial failure must be able to
    // finish rather than trip over the users it already removed.
    const status = (error as { status?: number }).status;
    const notFound = status === 404 || /not\s*found/i.test(error.message ?? "");
    if (!notFound) return `delete_failed:${status ?? "unknown"}`;
  }

  const { data, error: readError } = await admin.auth.admin.getUserById(authUserId);
  if (readError) {
    const status = (readError as { status?: number }).status;
    if (status === 404) return null; // gone, which is the point
    return `verify_failed:${status ?? "unknown"}`;
  }
  return data?.user ? "still_present" : null;
}

/**
 * Delete every stored FILE belonging to a family, before their rows go.
 *
 * WHY THIS IS NOT OPTIONAL HOUSEKEEPING. Deleting the account never touched
 * Storage. `media_assets.owner_profile_id` is ON DELETE SET NULL, so the
 * metadata row survived with a nulled owner and the OBJECT was never removed at
 * all — a deleted child's PHOTOGRAPH stayed in the bucket indefinitely.
 * Production is holding four such photographs of children whose accounts are
 * already gone. For a platform whose users are minors, "we deleted your
 * account" has to mean the picture too.
 *
 * WHY IT DOES NOT THROW. Revoking the LOGIN is the part that must not fail
 * silently; a leftover object is a retention problem, a leftover login is a
 * security one. A transient Storage error must not leave an account alive, so
 * this reports what it could not remove and the caller carries on. The failure
 * is logged with paths, which is what makes a later sweep possible.
 *
 * Paths follow the two documented conventions:
 *   child-avatars   students/<student_profile_id>/<file>      (PRIVATE)
 *   profile-avatars <auth_user_id>/<file>                     (public; legacy
 *                   child uploads landed here before migration 096 forced the
 *                   private bucket, so child auth ids are swept too)
 */
async function purgeFamilyStorage(
  admin: ReturnType<typeof getAdminClient>,
  input: { studentProfileIds: string[]; authUserIds: string[] },
): Promise<string[]> {
  const problems: string[] = [];

  const sweep = async (bucket: string, prefix: string) => {
    try {
      const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      if (error) {
        problems.push(`${bucket}/${prefix}:list`);
        return;
      }
      const paths = (data ?? [])
        .filter((entry) => entry?.name)
        .map((entry) => `${prefix}/${entry.name}`);
      if (paths.length === 0) return;
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) problems.push(`${bucket}/${prefix}:remove(${paths.length})`);
    } catch {
      problems.push(`${bucket}/${prefix}:threw`);
    }
  };

  for (const studentId of input.studentProfileIds) {
    await sweep(CHILD_AVATAR_BUCKET, `students/${studentId}`);
  }
  for (const authUserId of input.authUserIds) {
    await sweep(AVATAR_BUCKET, authUserId);
  }
  return problems;
}

/**
 * Self-serve account deletion: purges the family's stored FILES, then deletes
 * the parent's children (auth users → cascade students/credentials/links), then
 * the parent auth user (cascades profile/parents/links). The caller MUST have
 * authorized the parent first; the web action additionally signs the session
 * out, the BFF's token simply stops verifying once the auth user is gone.
 *
 * THROWS if anything is left behind. That is the contract the callers depend on
 * — telling somebody their account is gone while a working login survives is
 * the bug this function was rewritten to make impossible.
 */
export async function deleteParentAccountCore(params: {
  parentProfileId: string;
  authUserId: string | null;
}): Promise<void> {
  const admin = getAdminClient();

  // A missing auth user id used to SKIP the parent deletion silently (the old
  // `if (params.authUserId)` guard), which deleted the children and left a live
  // parent login behind — the worst of both outcomes, reported as success. The
  // web action reads this from its own session lookup, so null is a real
  // possibility and it is a refusal, not a no-op.
  if (!params.authUserId) {
    throw new Error("account_delete_no_auth_user");
  }

  // Delete the parent's children (auth users → cascade students/credentials/links).
  const { data: students } = await admin
    .from("students")
    .select("profile_id")
    .eq("created_by_parent_profile_id", params.parentProfileId);
  const studentIds = (students ?? []).map((s: { profile_id: string }) => s.profile_id);

  // Audit BEFORE the destructive cascade starts (the account/children rows
  // won't exist to reference afterward).
  await writeAuditLog(params.parentProfileId, "parent.account_delete", {
    severity: "critical",
    metadata: { children: studentIds.length },
  });

  const failures: string[] = [];

  const childAuthIds: string[] = [];
  if (studentIds.length > 0) {
    const { data: creds } = await admin
      .from("child_credentials")
      .select("auth_user_id")
      .in("student_profile_id", studentIds);
    for (const c of (creds ?? []) as { auth_user_id: string }[]) {
      if (c.auth_user_id) childAuthIds.push(c.auth_user_id);
    }
  }

  if (childAuthIds.length > 0) {
    for (const childAuthId of childAuthIds) {
      const reason = await deleteAuthUserVerified(admin, childAuthId);
      // A surviving CHILD auth user is its own login: the synthetic
      // c<id>@children.invalid address with the parent's password still signs
      // in. Production already holds 12 such orphans, 9 of which have signed in
      // since. Collect and fail — never leave one behind quietly.
      if (reason) failures.push(`child:${reason}`);
    }
  }

  // Delete the parent auth user (cascades profile/parents/links).
  const parentReason = await deleteAuthUserVerified(admin, params.authUserId);
  if (parentReason) failures.push(`parent:${parentReason}`);

  if (failures.length > 0) {
    // Log the detail server-side; the callers answer with a generic message.
    // Throwing is the whole point: the web action then skips its signOut and
    // redirect, and the BFF returns an error instead of `deleted: true`, so the
    // person is never told an account still capable of logging in is gone.
    console.error(
      "[account-delete] incomplete for profile",
      params.parentProfileId,
      failures.join(","),
    );
    throw new Error(`account_delete_incomplete:${failures.length}`);
  }

  // FILES LAST, and ONLY once every account is provably gone.
  //
  // The obvious ordering is files-first, "while the ids still resolve". That
  // reasoning is wrong twice over. The ids live in local variables and survive
  // the database delete perfectly well — and deleting a family's photographs
  // BEFORE the account is gone means any refusal above (migration 167 made the
  // cascade trigger refuse rather than strand a child login, so refusal is now
  // a reachable outcome) leaves the family intact but their pictures destroyed.
  // Irreversible work goes after the reversible work has succeeded, never
  // before.
  const storageProblems = await purgeFamilyStorage(admin, {
    studentProfileIds: studentIds,
    authUserIds: [...childAuthIds, params.authUserId],
  });
  if (storageProblems.length > 0) {
    // Deliberately NOT thrown: see purgeFamilyStorage. The accounts are already
    // gone at this point, so failing here would report a deletion that DID
    // happen as a failure and invite a confusing retry. Logged with paths so a
    // leftover object can be swept later.
    console.error(
      "[account-delete] storage purge incomplete for profile",
      params.parentProfileId,
      storageProblems.join(","),
    );
  }
}
