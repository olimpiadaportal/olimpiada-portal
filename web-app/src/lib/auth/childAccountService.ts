// SERVER-ONLY child account services (parent-driven, service role).
//
// createChild: parent creates a child. A child is a real Supabase Auth user
//   (parent-set password); the atomic create_child_account RPC does all DB writes.
//   Batch H: the 8-digit login ID is DEFERRED — it is NOT allocated here. The auth
//   user keeps its temporary pending email until the parent chooses a plan; the
//   subscribe step allocates the ID and sets the canonical synthetic email
//   (see allocateChildIdFromSubscribe + subscriptionService.subscribeChild).
//   On any post-createUser failure we delete the orphaned auth user (the RPC's own
//   transaction already rolled back its DB writes).
// resetChildPassword: parent restores their child's ability to sign in
//   (ownership-checked): refuse an id-less account, reconcile the synthetic
//   login email, set the password, void the failed-login lockout. See the
//   comment above the function for why all four are one operation.
//
// Callers (Stage 10 parent server actions) MUST authorize the parent first; this
// client bypasses RLS.
import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  type ChildInfo,
  childPendingEmail,
  childSyntheticEmail,
  validateChildInfo,
  validateChildPassword,
} from "@/lib/auth/children";
import { writeAuditLog } from "@/lib/audit";

export type CreateChildResult =
  // childUniqueId is now allocated on subscribe, so it is null at create time.
  | { ok: true; childUniqueId: string | null; studentProfileId: string }
  | { ok: false; errors: string[]; detail?: string };

export async function createChild(params: {
  parentProfileId: string;
  password: string;
  info: ChildInfo;
}): Promise<CreateChildResult> {
  const { parentProfileId, password, info } = params;

  // Validate inputs (the final 8-digit ID is allocated server-side, so the
  // password!=id rule is re-checked after allocation below).
  const infoCheck = validateChildInfo(info);
  const pwCheck = validateChildPassword(password);
  const errors = [
    ...(infoCheck.ok ? [] : infoCheck.errors),
    ...(pwCheck.ok ? [] : pwCheck.errors),
  ];
  if (errors.length) return { ok: false, errors };

  const admin = getAdminClient();

  // 1) Create the Auth user with a temporary, unique synthetic email.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: childPendingEmail(crypto.randomUUID()),
    password,
    email_confirm: true,
    user_metadata: { account_type: "child", created_by_parent_profile_id: parentProfileId },
  });
  if (createErr || !created?.user) {
    return { ok: false, errors: ["auth.child.err.createFailed"], detail: createErr?.message };
  }
  const authUserId = created.user.id;

  try {
    // 2) Atomic DB provisioning (links to the parent). Batch H: the 8-digit ID is
    //    NOT allocated here — it is deferred to the subscribe step. The auth user
    //    keeps its temporary pending email until then.
    const { data: rows, error: rpcErr } = await admin.rpc("create_child_account", {
      p_parent_profile_id: parentProfileId,
      p_auth_user_id: authUserId,
      p_first_name: info.firstName,
      p_last_name: info.lastName,
      p_city: info.city ?? null,
      p_school_name: info.schoolName ?? null,
      p_class_grade: info.classGrade ?? null,
      p_grade_id: info.gradeId ?? null,
      // D2 wizard: structured catalog FKs (migration 017; Round 21 migration 064
      // added p_city_district_id — the 11-arg signature). NAMING: p_district_id
      // is the CITY (historic naming); p_city_district_id is the real rayon.
      p_district_id: info.districtId ?? null,
      p_school_id: info.schoolId ?? null,
      p_city_district_id: info.cityDistrictId || null,
    });
    if (rpcErr) {
      // Round 21: surface the RPC's rayon validation as a FIELD error instead
      // of the generic create failure. hint 'district_required' = the chosen
      // city has active rayons but none was posted; the other check_violations
      // ("district … is not in city …", "school … is not in district …") mean
      // a stale/contradicting rayon reached the server.
      const districtViolation =
        rpcErr.hint === "district_required" ||
        (rpcErr.code === "23514" && /district/i.test(rpcErr.message ?? ""));
      const err = new Error(rpcErr.message) as Error & { i18nKey?: string };
      if (districtViolation) err.i18nKey = "addchild.err.districtRequired";
      throw err;
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    const studentProfileId: string | undefined = row?.new_student_profile_id;
    if (!studentProfileId) throw new Error("provisioning returned no student id");

    await writeAuditLog(parentProfileId, "parent.child_create", {
      targetTable: "students",
      targetId: studentProfileId,
    });

    // MIGRATION 146: the id exists NOW, not after a subscription. Set the
    // canonical synthetic auth email from it immediately — without that the id
    // is a number the child cannot log in with, which is the state two
    // production accounts were left in while payments were off.
    const childUniqueId: string | null = row?.new_child_unique_id ?? null;
    if (childUniqueId) {
      const applied = await applyAllocatedChildEmail({ authUserId, childUniqueId });
      if (!applied.ok) {
        // The DB row is committed and correct; only the login mapping failed.
        // Reported rather than swallowed: the parent must not be told the child
        // is ready when they cannot sign in.
        console.error("[child] synthetic email not applied");
        return {
          ok: false,
          errors: ["auth.child.err.createFailed"],
          detail: applied.detail,
        };
      }
    }

    return { ok: true, childUniqueId, studentProfileId };
  } catch (e) {
    // Saga cleanup: remove the orphaned Auth user (cascades the auto-created
    // profile). The RPC transaction already rolled back any partial DB writes.
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    // Round 21: a tagged rayon violation keeps its specific field error key.
    const key = (e as { i18nKey?: string }).i18nKey ?? "auth.child.err.createFailed";
    return { ok: false, errors: [key], detail: (e as Error).message };
  }
}

export type ResetChildPasswordResult =
  | { ok: true }
  | { ok: false; errors: string[]; detail?: string };

// A password reset means "make this child able to sign in", not "write a new
// password". They are different operations because ONE password store (Supabase
// Auth) is addressed by TWO keys that nothing keeps in sync: this function used
// to update the auth user by PRIMARY KEY (which always succeeds, so the UI
// truthfully reported success), while child login signs in by the SYNTHETIC
// EMAIL derived from the 8-digit id — see childLoginService and the mobile
// child-login route, both of which call childSyntheticEmail(child_unique_id).
//
// The two keys diverge for real accounts. Migration 146 backfilled ids for the
// children created while payments were off, and its header records the half it
// could not do: SQL cannot write auth.users.email. So the Parent Panel now
// DISPLAYS an 8-digit id for auth users still carrying their throwaway
// pending-<uuid>@children.invalid address, and every password set on those
// accounts landed somewhere no login would ever look.
//
// Hence the order below, which is the whole point of the function:
//   refuse an account with no id -> repair the address -> set the password ->
//   void the failure streak the forgotten password produced.
// This is the single shared core: the parent server action and the mobile BFF
// route are both thin wrappers, so both platforms are fixed here.
export async function resetChildPassword(params: {
  parentProfileId: string;
  studentProfileId: string;
  newPassword: string;
}): Promise<ResetChildPasswordResult> {
  const { parentProfileId, studentProfileId, newPassword } = params;
  const admin = getAdminClient();

  // Look up the child's credential mapping (auth user id + 8-digit ID).
  const { data: cred, error: credErr } = await admin
    .from("child_credentials")
    .select("auth_user_id, child_unique_id")
    .eq("student_profile_id", studentProfileId)
    .single();
  if (credErr || !cred) return { ok: false, errors: ["auth.child.err.childNotFound"] };

  // Authorize: the requesting parent must be the creator OR have an active link.
  const ownsChild = await parentOwnsChild(parentProfileId, studentProfileId);
  if (!ownsChild) return { ok: false, errors: ["auth.child.err.notYourChild"] };

  // A child with no 8-digit id has no username: there is no password that would
  // let them in, so "password updated" would be a lie. Refused with its own key
  // rather than folded into updateFailed — the parent needs to know the account
  // is unfinished, not that a retry might work.
  const childUniqueId: string | null = cred.child_unique_id ?? null;
  if (!childUniqueId) return { ok: false, errors: ["auth.child.err.noLoginId"] };

  // Password rules (the 8-digit ID is known here, so enforce password != id).
  const pwCheck = validateChildPassword(newPassword, { childUniqueId });
  if (!pwCheck.ok) return { ok: false, errors: pwCheck.errors };

  // Repair the login mapping BEFORE the password is set. If this fails the
  // password is deliberately left untouched: writing it would put the account
  // back in exactly the state this function exists to end — a new password the
  // child cannot use and a parent who was told it worked.
  const reconciled = await reconcileChildLoginEmail({
    authUserId: cred.auth_user_id,
    childUniqueId,
  });
  if (!reconciled.ok) {
    console.error("[child] login email reconcile failed");
    return {
      ok: false,
      errors: ["auth.child.err.updateFailed"],
      detail: reconciled.detail,
    };
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(cred.auth_user_id, {
    password: newPassword,
  });
  if (updErr) return { ok: false, errors: ["auth.child.err.updateFailed"], detail: updErr.message };

  await admin
    .from("child_credentials")
    .update({
      password_set_by_parent_profile_id: parentProfileId,
      password_set_at: new Date().toISOString(),
    })
    .eq("student_profile_id", studentProfileId);

  const lockoutCleared = await clearChildLoginFailures(childUniqueId);

  await writeAuditLog(parentProfileId, "parent.child_password_reset", {
    severity: "warning",
    targetTable: "students",
    targetId: studentProfileId,
    // Support reads these two: a reconcile means the account was one that could
    // never sign in, and an uncleared lockout explains a child still being
    // refused for the rest of the 15-minute window.
    metadata: { emailReconciled: reconciled.changed, lockoutCleared },
  });

  return { ok: true };
}

// Make the child's auth user carry the canonical synthetic login email
// (c<8digits>@children.invalid) that child login derives from the 8-digit id.
// That address IS the child's username, so a correct password on a user still
// holding its pending- address is unreachable.
//
// Idempotent: an already-correct address costs one read and no write, which is
// what makes it safe to run on every reset rather than only on the broken ones.
//
// A FAILED READ FALLS THROUGH TO THE WRITE instead of skipping it. Skipping on a
// read error is the one outcome nothing downstream could detect — the caller
// would be told the mapping is fine while the account stays unusable.
async function reconcileChildLoginEmail(params: {
  authUserId: string;
  childUniqueId: string;
}): Promise<{ ok: boolean; changed: boolean; detail?: string }> {
  const admin = getAdminClient();
  const desired = childSyntheticEmail(params.childUniqueId);

  const { data: existing } = await admin.auth.admin.getUserById(params.authUserId);
  const currentEmail = existing?.user?.email?.trim().toLowerCase() ?? null;
  if (currentEmail === desired) return { ok: true, changed: false };

  // email_confirm keeps the new address confirmed: GoTrue refuses
  // signInWithPassword on an unconfirmed email, which would trade one silent
  // login failure for another.
  const { error } = await admin.auth.admin.updateUserById(params.authUserId, {
    email: desired,
    email_confirm: true,
  });
  if (error) return { ok: false, changed: false, detail: error.message };
  return { ok: true, changed: true };
}

// Void a child's recent failed-login streak.
//
// is_child_login_locked counts failures in the last 15 minutes and ONLY a
// SUCCESSFUL login clears them (record_child_login_attempt). That is why the
// commonest reset in production still failed: the child forgets the password,
// gets it wrong eight times, the parent resets, and the brand-new password is
// refused for the rest of the window. A reset is precisely the event that should
// void the failure history. Successful attempts are kept — they are login
// history, not a lockout.
//
// Best-effort: the password is ALREADY changed by the time this runs, so a
// failure here must not be reported as a failed reset. It is logged and recorded
// in the audit row instead.
async function clearChildLoginFailures(childUniqueId: string): Promise<boolean> {
  const admin = getAdminClient();
  const { error } = await admin
    .from("child_login_attempts")
    .delete()
    .eq("child_unique_id", childUniqueId)
    .eq("success", false);
  if (error) {
    console.error("[child] could not clear the login lockout after a reset");
    return false;
  }
  return true;
}

// Batch H: after the subscribe RPC allocates the deferred 8-digit ID, set the
// child's canonical synthetic auth email so that child login (ID -> synthetic
// email -> signInWithPassword) works. Called from the subscribe server action and
// the checkout-intent grant, which have already authorized the parent + child.
// Thin wrapper over the same reconcile the reset path uses, so there is exactly
// one implementation of "make this id the login address".
export async function applyAllocatedChildEmail(params: {
  authUserId: string;
  childUniqueId: string;
}): Promise<{ ok: boolean; detail?: string }> {
  const res = await reconcileChildLoginEmail(params);
  return res.ok ? { ok: true } : { ok: false, detail: res.detail };
}

/** True if the parent created the child or has an active parent_student_links row. */
async function parentOwnsChild(parentProfileId: string, studentProfileId: string): Promise<boolean> {
  const admin = getAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("created_by_parent_profile_id")
    .eq("profile_id", studentProfileId)
    .single();
  if (student?.created_by_parent_profile_id === parentProfileId) return true;

  const { data: link } = await admin
    .from("parent_student_links")
    .select("id")
    .eq("parent_profile_id", parentProfileId)
    .eq("student_profile_id", studentProfileId)
    .eq("status", "active")
    .maybeSingle();
  return !!link;
}
