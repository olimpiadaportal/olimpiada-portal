// SERVER-ONLY child account services (parent-driven, service role).
//
// createChild: parent creates a child. A child is a real Supabase Auth user
//   (synthetic email + parent-set password); the atomic create_child_account RPC
//   does all DB writes. On any post-createUser failure we delete the orphaned auth
//   user (the RPC's own transaction already rolled back its DB writes).
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

export type CreateChildResult =
  | { ok: true; childUniqueId: string; studentProfileId: string }
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
    // 2) Atomic DB provisioning (allocates the 8-digit ID, links to the parent).
    const { data: rows, error: rpcErr } = await admin.rpc("create_child_account", {
      p_parent_profile_id: parentProfileId,
      p_auth_user_id: authUserId,
      p_first_name: info.firstName,
      p_last_name: info.lastName,
      p_city: info.city ?? null,
      p_school_name: info.schoolName ?? null,
      p_class_grade: info.classGrade ?? null,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    const childUniqueId: string | undefined = row?.new_child_unique_id;
    const studentProfileId: string | undefined = row?.new_student_profile_id;
    if (!childUniqueId || !studentProfileId) throw new Error("provisioning returned no id");

    // Defensive: never allow password == the allocated ID.
    if (password === childUniqueId) throw new Error("password equals allocated id");

    // 3) Set the canonical synthetic email derived from the allocated ID.
    const { error: updErr } = await admin.auth.admin.updateUserById(authUserId, {
      email: childSyntheticEmail(childUniqueId),
    });
    if (updErr) throw new Error(updErr.message);

    return { ok: true, childUniqueId, studentProfileId };
  } catch (e) {
    // Saga cleanup: remove the orphaned Auth user (cascades the auto-created
    // profile). The RPC transaction already rolled back any partial DB writes.
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    return { ok: false, errors: ["auth.child.err.createFailed"], detail: (e as Error).message };
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
