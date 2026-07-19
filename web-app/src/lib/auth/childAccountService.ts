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
// resetChildPassword: parent resets their child's password (ownership-checked).
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

    // childUniqueId is null until the parent chooses a plan (subscribe step).
    return { ok: true, childUniqueId: null, studentProfileId };
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

  // Password rules (the 8-digit ID is known here, so enforce password != id).
  const pwCheck = validateChildPassword(newPassword, { childUniqueId: cred.child_unique_id });
  if (!pwCheck.ok) return { ok: false, errors: pwCheck.errors };

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

  await writeAuditLog(parentProfileId, "parent.child_password_reset", {
    severity: "warning",
    targetTable: "students",
    targetId: studentProfileId,
  });

  return { ok: true };
}

// Batch H: after the subscribe RPC allocates the deferred 8-digit ID, set the
// child's canonical synthetic auth email (c<8digits>@children.invalid) so that
// child login (ID -> synthetic email -> signInWithPassword) works. Idempotent and
// best-effort: a child can only ever log in once this email is set. Called from the
// subscribe server action, which already authorized the parent + child.
export async function applyAllocatedChildEmail(params: {
  authUserId: string;
  childUniqueId: string;
}): Promise<{ ok: boolean; detail?: string }> {
  const admin = getAdminClient();
  const { error } = await admin.auth.admin.updateUserById(params.authUserId, {
    email: childSyntheticEmail(params.childUniqueId),
  });
  if (error) return { ok: false, detail: error.message };
  return { ok: true };
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
