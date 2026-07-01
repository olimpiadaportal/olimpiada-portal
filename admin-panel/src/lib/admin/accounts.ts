"use server";

// Parent/child account CRUD — Administrator-only.
//
// SECURITY POSTURE (identical for every action below):
//   1) requireAdmin() ALWAYS runs first. Only an administrator reaches any
//      privileged code path.
//   2) The SERVICE-ROLE admin client (createAdminClient — bypasses RLS) is only
//      created AFTER the admin check, and is never returned to / imported by a
//      Client Component. The service key never leaves the server.
//   3) Mutations record an audit_logs entry (best-effort) so create/delete are
//      traceable to the acting administrator.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guards";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { getT } from "@/i18n/server";

// --------------------------------------------------------------------------
// Audit helper. audit_logs (008) columns: actor_profile_id, action,
// target_table, target_id, severity, metadata_json, success. Best-effort:
// auditing must never block or fail the primary operation.
// --------------------------------------------------------------------------
type AdminClient = ReturnType<typeof createAdminClient>;

async function writeAudit(
  admin: AdminClient,
  entry: {
    actorProfileId: string | null;
    action: string;
    targetTable?: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
    severity?: "info" | "warning" | "error" | "critical";
    success?: boolean;
  },
): Promise<void> {
  try {
    await admin.from("audit_logs").insert({
      actor_profile_id: entry.actorProfileId,
      action: entry.action,
      target_table: entry.targetTable ?? null,
      target_id: entry.targetId ?? null,
      metadata_json: entry.metadata ?? {},
      severity: entry.severity ?? "info",
      success: entry.success ?? true,
    });
  } catch {
    /* never let auditing break the operation */
  }
}

function f(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

// =====================================================================
// RESET CHILD PASSWORD (existing behaviour — unchanged)
// =====================================================================
export type ResetChildPasswordState = { error?: string; ok?: boolean } | null;

export async function resetChildPassword(
  _prev: ResetChildPasswordState,
  formData: FormData,
): Promise<ResetChildPasswordState> {
  const ctx = await requireAdmin(); // ONLY administrators can reset a child password
  const t = await getT();

  if (!hasServiceRole()) {
    return { error: t("accounts.reset.noServiceKey") };
  }

  const studentProfileId = String(formData.get("student_profile_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!studentProfileId) return { error: t("accounts.reset.err.missing") };
  if (password.length < 8) return { error: t("accounts.reset.err.short") };

  const admin = createAdminClient();

  // 1) Resolve the child's auth user from credentials.
  const { data: cred, error: credErr } = await admin
    .from("child_credentials")
    .select("auth_user_id, child_unique_id")
    .eq("student_profile_id", studentProfileId)
    .maybeSingle();
  if (credErr) return { error: credErr.message };
  if (!cred?.auth_user_id) return { error: t("accounts.reset.err.noCredentials") };

  // Defensive: never allow the password to equal the public 8-digit ID.
  if (password === cred.child_unique_id) {
    return { error: t("accounts.reset.err.equalsId") };
  }

  // 2) Reset the password via the Auth admin API.
  const { error: updErr } = await admin.auth.admin.updateUserById(
    cred.auth_user_id,
    { password },
  );
  if (updErr) return { error: updErr.message };

  // 3) Record who/when the password was last set.
  await admin
    .from("child_credentials")
    .update({
      password_set_by_parent_profile_id: ctx.profileId,
      password_set_at: new Date().toISOString(),
    })
    .eq("student_profile_id", studentProfileId);

  await writeAudit(admin, {
    actorProfileId: ctx.profileId,
    action: "admin.child.password_reset",
    targetTable: "child_credentials",
    targetId: studentProfileId,
    severity: "warning",
  });

  revalidatePath("/accounts");
  return { ok: true };
}

// =====================================================================
// CREATE PARENT
// Mirrors web-app registerParent provisioning, but uses admin.createUser with
// email auto-confirm (an administrator creates the account directly) followed
// by the existing setup_parent RPC (profile → parent role + parents row).
// =====================================================================
export type CreateParentState = { error?: string; ok?: boolean } | null;

export async function createParent(
  _prev: CreateParentState,
  formData: FormData,
): Promise<CreateParentState> {
  const ctx = await requireAdmin();
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const firstName = f(formData, "first_name");
  const lastName = f(formData, "last_name");
  const displayName = `${firstName} ${lastName}`.trim();
  const email = f(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!firstName || !lastName) return { error: t("accounts.create.err.required") };
  if (!email || !email.includes("@")) return { error: t("accounts.create.err.email") };
  if (password.length < 8) return { error: t("accounts.create.err.password") };

  const admin = createAdminClient();

  // 1) Create the auth user (email auto-confirmed — admin-provisioned account).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: "parent", display_name: displayName },
  });
  if (createErr || !created?.user) {
    // Supabase returns a 422 for an already-registered email.
    if (createErr && /already|registered|exists/i.test(createErr.message)) {
      return { error: t("accounts.create.err.exists") };
    }
    return { error: t("accounts.create.err.failed") };
  }

  // 2) Promote the new profile to an active parent (parent role + parents row).
  const { error: rpcErr } = await admin.rpc("setup_parent", {
    p_auth_user_id: created.user.id,
    p_display_name: displayName || null,
  });
  if (rpcErr) {
    // Roll back the orphaned auth user so a retry can succeed cleanly.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { error: t("accounts.create.err.failed") };
  }

  // Resolve the new parent's profile id for the audit target.
  const { data: prof } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", created.user.id)
    .maybeSingle();

  await writeAudit(admin, {
    actorProfileId: ctx.profileId,
    action: "admin.parent.create",
    targetTable: "profiles",
    targetId: prof?.id ?? null,
    metadata: { email },
  });

  revalidatePath("/accounts");
  return { ok: true };
}

// =====================================================================
// UPDATE PARENT — display name + account status (active / suspended).
// =====================================================================
export type UpdateParentState = { error?: string; ok?: boolean } | null;

const ALLOWED_PARENT_STATUSES = new Set(["active", "suspended"]);

export async function updateParent(
  _prev: UpdateParentState,
  formData: FormData,
): Promise<UpdateParentState> {
  const ctx = await requireAdmin();
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const parentProfileId = f(formData, "parent_profile_id");
  const displayName = f(formData, "display_name");
  const status = f(formData, "status");

  if (!parentProfileId) return { error: t("accounts.edit.err.failed") };
  // Never trust a client-submitted status outside the allowed transitions.
  if (status && !ALLOWED_PARENT_STATUSES.has(status)) {
    return { error: t("accounts.edit.err.failed") };
  }

  const admin = createAdminClient();

  // Confirm the target is actually a parent (defence-in-depth: do not let this
  // become a generic profile-status editor for admins/content managers).
  const { data: parentRole } = await admin
    .from("roles")
    .select("id")
    .eq("code", "parent")
    .maybeSingle();
  if (parentRole?.id) {
    const { data: isParent } = await admin
      .from("profile_roles")
      .select("profile_id")
      .eq("profile_id", parentProfileId)
      .eq("role_id", parentRole.id)
      .maybeSingle();
    if (!isParent) return { error: t("accounts.edit.err.failed") };
  }

  const patch: Record<string, unknown> = {
    display_name: displayName || null,
    updated_at: new Date().toISOString(),
  };
  if (status) patch.status = status;

  const { error: updErr } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", parentProfileId);
  if (updErr) return { error: t("accounts.edit.err.failed") };

  await writeAudit(admin, {
    actorProfileId: ctx.profileId,
    action: "admin.parent.update",
    targetTable: "profiles",
    targetId: parentProfileId,
    metadata: { status: status || undefined },
  });

  revalidatePath("/accounts");
  return { ok: true };
}

// =====================================================================
// DELETE CHILD — mirrors web-app deleteChild (auth delete cascades
// student/credentials/links). Admin variant skips the parent-ownership check
// (admins may delete any child) but still verifies the target is a child.
// =====================================================================
export type DeleteState = { error?: string; ok?: boolean } | null;

export async function deleteChild(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const ctx = await requireAdmin();
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const studentProfileId = f(formData, "student_profile_id");
  const confirm = f(formData, "confirm");
  if (!studentProfileId) return { error: t("accounts.delete.err.failed") };
  if (confirm !== t("accounts.delete.confirmWord")) {
    return { error: t("accounts.delete.err.confirm") };
  }

  const admin = createAdminClient();

  // Verify the target is genuinely a student before deleting.
  const { data: student } = await admin
    .from("students")
    .select("profile_id")
    .eq("profile_id", studentProfileId)
    .maybeSingle();
  if (!student) return { error: t("accounts.delete.err.failed") };

  // Delete the child auth user (cascades student/credentials/links via FK).
  const { data: cred } = await admin
    .from("child_credentials")
    .select("auth_user_id")
    .eq("student_profile_id", studentProfileId)
    .maybeSingle();
  if (cred?.auth_user_id) {
    await admin.auth.admin.deleteUser(cred.auth_user_id).catch(() => {});
  }

  await writeAudit(admin, {
    actorProfileId: ctx.profileId,
    action: "admin.child.delete",
    targetTable: "students",
    targetId: studentProfileId,
    severity: "warning",
  });

  revalidatePath("/accounts");
  return { ok: true };
}

// =====================================================================
// DELETE PARENT — mirrors web-app deleteParentAccount: delete the parent's
// children first, then the parent auth user (cascades profile/parents/links).
// =====================================================================
export async function deleteParent(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const ctx = await requireAdmin();
  const t = await getT();

  if (!hasServiceRole()) return { error: t("accounts.reset.noServiceKey") };

  const parentProfileId = f(formData, "parent_profile_id");
  const confirm = f(formData, "confirm");
  if (!parentProfileId) return { error: t("accounts.delete.err.failed") };
  if (confirm !== t("accounts.delete.confirmWord")) {
    return { error: t("accounts.delete.err.confirm") };
  }

  const admin = createAdminClient();

  // Resolve the parent's auth user id.
  const { data: parentProfile } = await admin
    .from("profiles")
    .select("id, auth_user_id")
    .eq("id", parentProfileId)
    .maybeSingle();
  if (!parentProfile?.auth_user_id) {
    return { error: t("accounts.delete.err.failed") };
  }

  // 1) Delete this parent's children (auth delete cascades their rows).
  const { data: students } = await admin
    .from("students")
    .select("profile_id")
    .eq("created_by_parent_profile_id", parentProfileId);
  const studentIds = (students ?? []).map(
    (s: { profile_id: string }) => s.profile_id,
  );
  if (studentIds.length > 0) {
    const { data: creds } = await admin
      .from("child_credentials")
      .select("auth_user_id")
      .in("student_profile_id", studentIds);
    for (const c of (creds ?? []) as { auth_user_id: string }[]) {
      if (c.auth_user_id) {
        await admin.auth.admin.deleteUser(c.auth_user_id).catch(() => {});
      }
    }
  }

  // 2) Delete the parent auth user (cascades profile/parents/links via FK).
  await admin.auth.admin.deleteUser(parentProfile.auth_user_id).catch(() => {});

  await writeAudit(admin, {
    actorProfileId: ctx.profileId,
    action: "admin.parent.delete",
    targetTable: "profiles",
    targetId: parentProfileId,
    metadata: { childrenDeleted: studentIds.length },
    severity: "warning",
  });

  revalidatePath("/accounts");
  return { ok: true };
}
