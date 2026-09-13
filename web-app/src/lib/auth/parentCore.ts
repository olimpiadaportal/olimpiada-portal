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
import { parseStudentGender } from "@/lib/studentGender";

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
  /**
   * Migration 169 — the OPTIONAL gender, for aggregate reporting only.
   *
   * OMITTED OR BLANK MEANS "LEAVE THE COLUMN ALONE", which is the whole point
   * of it being optional here. A surface that does not send the field (and a
   * parent who never touched the control) must not be able to blank an answer
   * that was already given — and there is deliberately no way to put the column
   * back to NULL, because NULL means "never asked" and this parent HAS been
   * asked. A parent withdrawing an answer picks "prefer not to say"
   * ('unspecified'), which is a different fact and stays tellable apart.
   */
  gender?: string | null;
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
  // city/school/grade ids UUID-shaped, rayon UUID-shaped when given, gender —
  // when sent at all — one of the three enum values). Returns i18n keys the UI
  // localizes.
  const check = validateChildInfo({
    firstName,
    lastName,
    districtId,
    cityDistrictId,
    schoolId,
    gradeId,
    gender: params.gender,
  });
  if (!check.ok) return { ok: false, validationErrors: check.errors };

  // Parsed a second time for the WRITE (the call above only judged it). Cheap,
  // pure, and it keeps one whitelist rather than a validator and a separate
  // cast that could drift apart.
  const gender = parseStudentGender(params.gender);

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
      // Migration 169: PRESENT ONLY WHEN THE PARENT ANSWERED. Spreading an
      // absent value in as `gender: null` would overwrite a stored answer on
      // every unrelated save — a school correction quietly erasing the field
      // is exactly the bug the "absent ≠ NULL" rule exists to prevent.
      ...(gender.ok && gender.value ? { gender: gender.value } : {}),
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
 * WHICH CHILDREN DIE WITH A PARENT — asked of the database, never re-derived.
 *
 * THE BUG THIS REPLACES. Every deletion path in this repository carried its own
 * copy of the answer: `students where created_by_parent_profile_id = me`. Three
 * copies (this core, the admin panel's deleteParent, and the BEFORE DELETE
 * trigger on public.parents) that nothing forced to agree — and on the day a
 * child can have a second adult they stop agreeing in the worst possible
 * direction. `created_by` includes a shared child the departing parent merely
 * created; the trigger deliberately excludes them. Deleting the children FIRST
 * and the parent second (which is exactly what this function used to do) then
 * handed the app's answer the last word: every child was already gone by the
 * time the rule that protects shared ones got to run. The trigger was not
 * bypassed, it was STARVED.
 *
 * Migration 174 put the answer in one place — public.parent_children_to_delete()
 * — and this reads it. `parent_claimed_children` is the wider set (created OR
 * actively linked); the difference between the two is how many children this
 * parent is LEAVING BEHIND to a co-parent, which is worth an audit row.
 *
 * Both are SECURITY DEFINER and granted to service_role ONLY, so this runs on
 * the admin client and is unreachable from any user token.
 *
 * Returns null on a failed read — NEVER an empty array. "The rule is
 * unavailable" and "this parent has no children" are different facts, and
 * collapsing them would delete a parent while leaving every child of theirs
 * behind.
 */
async function parentChildIds(
  admin: ReturnType<typeof getAdminClient>,
  rule: "parent_children_to_delete" | "parent_claimed_children",
  parentProfileId: string,
): Promise<string[] | null> {
  const { data, error } = await admin.rpc(rule, { p_parent: parentProfileId });
  if (error) {
    // Never the raw Postgres message — the code is enough to find it in the logs.
    console.error("[account-delete]", rule, "failed:", error.code ?? "unknown");
    return null;
  }
  const rows = (data ?? []) as { child_profile_id?: string | null }[];
  return rows
    .map((row) => row?.child_profile_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Self-serve account deletion: deletes the parent auth user — whose BEFORE
 * DELETE trigger promotes every SHARED child to the surviving co-parent and
 * deletes only the children nobody else holds — then sweeps any child login the
 * cascade left standing, then purges the family's stored FILES. The caller MUST
 * have authorized the parent first; the web action additionally signs the
 * session out, the BFF's token simply stops verifying once the auth user is gone.
 *
 * THE PARENT GOES FIRST, AND THAT IS THE WHOLE FIX. It used to go last, after
 * the children had already been deleted one by one, which meant
 * trg_parents_cascade_children fired on an empty set. Every protection living in
 * that trigger — the shared-child exclusion, the co-parent promotion, migration
 * 167's refusal to strand a child login — was therefore dead code on this path.
 * Deleting the parent first is what gives the database the first and only word
 * about who dies with them.
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

  // The shared rule, read before anything is destroyed. A failure here is a
  // REFUSAL: without it this function cannot know which children are about to
  // be removed, and therefore cannot purge their files or prove they are gone.
  const studentIds = await parentChildIds(
    admin,
    "parent_children_to_delete",
    params.parentProfileId,
  );
  if (studentIds === null) {
    throw new Error("account_delete_rule_unavailable");
  }
  // Best-effort context only — a failed read must not stop an account deletion.
  const claimedIds = await parentChildIds(
    admin,
    "parent_claimed_children",
    params.parentProfileId,
  );
  const retained =
    claimedIds === null ? null : Math.max(0, claimedIds.length - studentIds.length);

  // Audit BEFORE the destructive cascade starts (the account/children rows
  // won't exist to reference afterward). `retained` is the number of children
  // this parent LEFT BEHIND to another adult — zero today, and the first number
  // anyone will want when that stops being true.
  await writeAuditLog(params.parentProfileId, "parent.account_delete", {
    severity: "critical",
    metadata: {
      children: studentIds.length,
      ...(retained === null ? {} : { retained }),
    },
  });

  const failures: string[] = [];

  // Read the child logins BEFORE the cascade removes the rows that name them —
  // the ids are needed afterwards to PROVE the cascade worked and to sweep the
  // children's files.
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

  // Delete the parent auth user. This cascades profile/parents/links, and the
  // BEFORE DELETE trigger on public.parents does the rest: promote the shared
  // children, delete the unshared ones, refuse outright rather than strand a
  // child login (migration 167). A refusal surfaces here as a failed delete.
  const parentReason = await deleteAuthUserVerified(admin, params.authUserId);
  if (parentReason) failures.push(`parent:${parentReason}`);

  // A SWEEP, NOT THE MECHANISM — and deliberately skipped when the parent's own
  // deletion failed. The trigger has already deleted these auth users; each call
  // below is expected to answer "already gone" (404 → success). It stays because
  // the trigger's auth.users delete is best-effort by design: it swallows
  // insufficient_privilege so a rights problem cannot abort a parent's deletion.
  // If it ever does swallow one, this is what still removes the login.
  //
  // Running it when the parent delete FAILED would be the original bug inverted:
  // the family would keep their account and lose their children.
  if (!parentReason) {
    for (const childAuthId of childAuthIds) {
      const reason = await deleteAuthUserVerified(admin, childAuthId);
      // A surviving CHILD auth user is its own login: the synthetic
      // c<id>@children.invalid address with the parent's password still signs
      // in. Production already holds 12 such orphans, 9 of which have signed in
      // since. Collect and fail — never leave one behind quietly.
      if (reason) failures.push(`child:${reason}`);
    }
  }

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
  //
  // `studentIds` is the shared rule's answer, so a child handed to a surviving
  // co-parent is not in it and their photograph is not swept. Purging by
  // "everyone I created" would have deleted a living child's avatar.
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

export type DeleteChildCoreResult =
  | { ok: true }
  | {
      ok: false;
      errorKey:
        | "auth.child.err.childNotFound"
        | "auth.child.err.notYourChild"
        | "auth.child.err.serverError"
        | "link.err.sharedDelete";
      /**
       * Migration 174: is trying again worth anything? Absent means yes (every
       * refusal that predates this field). FALSE means the database refused on
       * a rule that will still hold in a second — today only the shared-child
       * guard — and a client that retries a permanent refusal retries forever.
       * The mobile BFF reads it to choose 409-not-retryable over 500-retryable.
       */
      retryable?: boolean;
    };

/**
 * Parent deletes ONE of their children: revoke the child's LOGIN (delete the
 * auth user, which cascades profile → students → child_credentials → links),
 * then remove that child's stored files.
 *
 * IT RETURNS A RESULT, and that is half the point of the rewrite. The web
 * action this was extracted from was `Promise<void>` and `return`ed early on a
 * missing id, a missing student and somebody ELSE's student alike — three
 * refusals a caller could not tell apart from a deletion, all of them followed
 * by the same revalidate. The mobile BFF needs exactly that distinction, and so
 * did the web: "not your child" is not "done".
 *
 * The other half is the ending, which was
 * `await admin.auth.admin.deleteUser(id).catch(() => {})` — the SAME bug
 * deleteAuthUserVerified above was written for. auth-js RETURNS AuthErrors
 * instead of throwing them, so the catch intercepted almost nothing and the
 * discarded return value was the only place a failure was ever reported. A
 * failure here deletes NOTHING: auth user, profile and student row all survive,
 * the child's login keeps working, and the parent is told the account is gone.
 * Two of five real parent-account deletions failed in precisely that way before
 * the verify step existed.
 *
 * Errors are i18n KEYS, never localized text — each surface localizes them.
 */
export async function deleteChildCore(params: {
  parentProfileId: string;
  studentProfileId: string;
}): Promise<DeleteChildCoreResult> {
  const { parentProfileId, studentProfileId } = params;
  // A malformed id and an id that matches nothing are the same answer: there is
  // no such child. Neither is worth a distinct key, and both must refuse rather
  // than fall through to the revalidate that used to imply success.
  if (!isUuid(studentProfileId)) return { ok: false, errorKey: "auth.child.err.childNotFound" };

  const admin = getAdminClient();
  // Re-verify OWNERSHIP server-side (the parent must have created this child).
  // RLS also enforces this, but we never trust the client-supplied id.
  const { data: student, error: studentError } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentProfileId)
    .maybeSingle();
  // A READ THAT FAILED IS NOT A ROW THAT IS ABSENT, and the two must not share
  // an answer. `childNotFound` now MEANS "already gone, count it as done" — the
  // mobile client treats it as success so that a retry after a slow-but-
  // completed delete stops accusing the parent of not owning their own child.
  // Letting a transient error fall into that branch would show a green
  // "account deleted" toast while the auth user, the profile, the students row
  // and the child's working 8-digit login all survive. Same reasoning, same
  // shape as childOwnershipCore in subscriptionCore.ts.
  if (studentError) {
    console.error("[child-delete] students read failed for", studentProfileId, studentError.code);
    return { ok: false, errorKey: "auth.child.err.serverError" };
  }
  if (!student) return { ok: false, errorKey: "auth.child.err.childNotFound" };
  if (student.created_by_parent_profile_id !== parentProfileId) {
    return { ok: false, errorKey: "auth.child.err.notYourChild" };
  }

  // MIGRATION 174 — A SHARED CHILD IS NOT ONE PARENT’S TO DELETE.
  //
  // The creator check above is not sufficient once a child can have a second
  // adult: the creator is exactly the person who would delete a child their
  // co-parent still depends on. trg_student_shared_delete_guard refuses that at
  // the row, so without this pre-check the refusal would arrive as a 500 out of
  // GoTrue — a permanent condition dressed as a transient one, which the mobile
  // client then retries forever.
  //
  // Asked as "is this child in the set that dies with me?" rather than as its
  // own link count, so this path and the trigger read the SAME rule
  // (public.parent_children_to_delete). A child the parent created and nobody
  // else holds is in it; a shared one is not.
  const deletable = await parentChildIds(admin, "parent_children_to_delete", parentProfileId);
  if (deletable === null) {
    // The rule could not be read. Refuse rather than guess: guessing "yes"
    // here is the one answer that destroys a living child.
    return { ok: false, errorKey: "auth.child.err.serverError" };
  }
  if (!deletable.includes(studentProfileId)) {
    console.error("[child-delete] refused: shared child", studentProfileId);
    return { ok: false, errorKey: "link.err.sharedDelete", retryable: false };
  }

  // The child's auth user comes from PROFILES, not child_credentials. Both
  // carry the same id by construction (create_child_account writes one from the
  // other), but students.profile_id → profiles.id is an FK, so a student row
  // guarantees a profile row while a credential row is merely expected to
  // exist. It is also the route fn_cascade_delete_parent_children takes, so the
  // two deletion paths resolve the login the same way.
  const { data: profile } = await admin
    .from("profiles")
    .select("auth_user_id")
    .eq("id", studentProfileId)
    .maybeSingle();
  const authUserId: string | null = profile?.auth_user_id ?? null;
  if (!authUserId) {
    // Half-finished provisioning. Refused, not skipped: the row is still there
    // afterwards, so answering ok would be the same lie in a quieter voice —
    // and deleteParentAccountCore already treats a missing auth user id as a
    // refusal rather than a no-op.
    console.error("[child-delete] no auth user for student", studentProfileId);
    return { ok: false, errorKey: "auth.child.err.serverError" };
  }

  const reason = await deleteAuthUserVerified(admin, authUserId);

  // ONE audit row either way. A REFUSED deletion of a child account is exactly
  // the event worth having a record of, and unlike parent-account deletion the
  // actor survives this operation, so the row can be written after the outcome
  // is known instead of before it.
  await writeAuditLog(parentProfileId, "parent.child_delete", {
    targetTable: "students",
    targetId: studentProfileId,
    severity: "critical",
    success: !reason,
    metadata: reason ? { failure: reason } : undefined,
  });

  if (reason) {
    // Detail server-side only; the surfaces answer with the generic key.
    console.error("[child-delete] incomplete for student", studentProfileId, reason);
    return { ok: false, errorKey: "auth.child.err.serverError" };
  }

  // FILES LAST, and only once the account is provably gone — same ordering and
  // same reasoning as deleteParentAccountCore: irreversible work goes after the
  // reversible work has succeeded, so a refusal never destroys a child's
  // photograph while leaving the child's account intact. Best-effort by design;
  // a leftover object is a retention problem, a leftover login is a security
  // one, and only the second may fail the operation.
  const storageProblems = await purgeFamilyStorage(admin, {
    studentProfileIds: [studentProfileId],
    authUserIds: [authUserId],
  });
  if (storageProblems.length > 0) {
    console.error(
      "[child-delete] storage purge incomplete for student",
      studentProfileId,
      storageProblems.join(","),
    );
  }

  return { ok: true };
}
