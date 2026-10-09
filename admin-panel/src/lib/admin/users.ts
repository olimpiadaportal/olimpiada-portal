"use server";

// Panel users: create, edit and delete Administrators and Content Managers.
//
// WHO MAY CALL: administrators only (requireAdmin is the first statement of
// every action). Content Managers never reach this module — the Users page is
// admin-only and so is its nav entry.
//
// THE SUPER ADMIN (migration 182) is never a valid target. It is refused here
// with a clear message, and refused again by database triggers that hold for
// every caller, the service-role client included — this module is the
// friendly layer, not the only one. No role in this allowlist can make another
// Super Admin: the designation is data assigned by migration, not a role.
//
// SELF-PROTECTION: an administrator may rename themselves but may not delete
// their own account or change their own role. Not a security boundary (another
// administrator can do either) — a guard against locking yourself out.
//
// WHY CREATION "FAILED SILENTLY" BEFORE 2026-10-09. Supabase Auth refuses an
// address that already has an account (422 email_exists). This action caught
// that and returned the generic "operation failed, try again", which is
// indistinguishable from nothing working. Every Auth refusal is now mapped to a
// sentence that names the reason, every step's result is checked, and a failure
// after the auth user exists deletes it again, so a retry is never blocked by a
// half-made account.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guards";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/admin/audit";
import { checkNewPassword, type PasswordProblem } from "@/lib/admin/passwordPolicy";
import { getT } from "@/i18n/server";

const ALLOWED_ROLES = ["administrator", "content_manager"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];
const isAllowedRole = (r: string): r is AllowedRole => (ALLOWED_ROLES as readonly string[]).includes(r);

const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// passwordPolicy returns a CODE, not a message, because the three apps have
// three i18n key namespaces. Same map as accounts.ts — duplicated rather than
// exported from either, because a "use server" module may only export async
// functions.
const PASSWORD_PROBLEM_KEY: Record<PasswordProblem, string> = {
  tooShort: "pw.err.tooShort",
  tooLong: "pw.err.tooLong",
  needsUpper: "pw.err.needsUpper",
  needsSpecial: "pw.err.needsSpecial",
};

/** Supabase Auth refusal → the sentence that names it. Unknown codes stay generic. */
function authErrorKey(code: string | undefined, status: number | undefined): string {
  switch (code) {
    case "email_exists":
    case "user_already_exists":
      return "users.err.emailExists";
    case "weak_password":
      return "users.err.weakPassword";
    case "email_address_invalid":
    case "validation_failed":
      return "users.err.emailInvalid";
  }
  if (status === 422) return "users.err.emailExists";
  return "err.server";
}

export type CreateUserState = { error?: string; ok?: boolean } | null;
export type UserMutationState = { error?: string; ok?: boolean } | null;

export async function createPanelUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const ctx = await requireAdmin(); // ONLY administrators can create panel users
  const t = await getT();

  if (!hasServiceRole()) return { error: t("users.noServiceKey") };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  if (!email) return { error: t("users.err.email") };
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return { error: t("users.err.emailInvalid") };
  if (displayName.length > NAME_MAX) return { error: t("users.err.nameLong") };
  // The one strength rule, shared with the parent/child password paths.
  const pwProblem = checkNewPassword(password);
  if (pwProblem) return { error: t(PASSWORD_PROBLEM_KEY[pwProblem]) };
  if (!isAllowedRole(role)) return { error: t("users.err.role") };

  const admin = createAdminClient();

  // Resolve the role BEFORE creating anything, so a missing role row can never
  // leave an auth user behind.
  const { data: roleRow, error: roleErr } = await admin
    .from("roles")
    .select("id")
    .eq("code", role)
    .maybeSingle();
  if (roleErr) {
    console.error("[admin] panel user role lookup failed", roleErr.message);
    return { error: t("err.server") };
  }
  if (!roleRow) return { error: t("users.err.roleMissing") };

  // 1) The auth user (email pre-confirmed). The signup trigger creates the profile.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });
  if (createErr) {
    // Log the code, never the password; show a sentence that names the reason.
    console.error("[admin] panel user create refused", createErr.code ?? createErr.status, createErr.message);
    return { error: t(authErrorKey(createErr.code, createErr.status)) };
  }
  const authUserId = created.user?.id;
  if (!authUserId) return { error: t("users.err.notCreated") };

  // From here on, any failure removes the auth user again (the profile goes
  // with it — profiles.auth_user_id cascades).
  const undo = async (why: string, detail?: string) => {
    console.error(`[admin] panel user create rolled back: ${why}`, detail ?? "");
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) console.error("[admin] panel user rollback FAILED — orphan auth user", authUserId, error.message);
  };

  // 2) Activate + name the auto-provisioned profile.
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (profileErr || !profile) {
    await undo("no profile", profileErr?.message);
    return { error: t("users.err.noProfile") };
  }
  const { error: activateErr } = await admin
    .from("profiles")
    .update({ status: "active", display_name: displayName || null })
    .eq("id", profile.id);
  if (activateErr) {
    await undo("profile activation", activateErr.message);
    return { error: t("err.server") };
  }

  // 3) Assign the (allowlisted) role.
  const { error: assignErr } = await admin
    .from("profile_roles")
    .insert({ profile_id: profile.id, role_id: roleRow.id, assigned_by: ctx.profileId });
  if (assignErr) {
    await undo("role assignment", assignErr.message);
    return { error: t("err.server") };
  }

  // Privileged-account creation is a sensitive mutation — always audited
  // (small metadata; NEVER the password).
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.panel_user.create",
    targetTable: "profiles",
    targetId: profile.id,
    metadata: { email, role },
    severity: "warning",
  });

  revalidatePath("/users");
  return { ok: true };
}

type Target = {
  profileId: string;
  authUserId: string;
  email: string | null;
  isSuperAdmin: boolean;
  panelRoles: AllowedRole[];
};

/**
 * Load a profile that THIS module may act on: it must exist, hold a panel role
 * and not be the Super Admin. Returns an i18n error key otherwise.
 */
async function loadTarget(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<{ target: Target } | { errorKey: string }> {
  if (!UUID_RE.test(profileId)) return { errorKey: "users.err.notFound" };
  const { data: p, error } = await admin
    .from("profiles")
    .select("id, auth_user_id, email, is_super_admin")
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    console.error("[admin] panel user lookup failed", error.message);
    return { errorKey: "err.server" };
  }
  if (!p) return { errorKey: "users.err.notFound" };
  if (p.is_super_admin) return { errorKey: "users.err.superAdmin" };

  const { data: rows, error: rolesErr } = await admin
    .from("profile_roles")
    .select("roles(code)")
    .eq("profile_id", profileId);
  if (rolesErr) {
    console.error("[admin] panel user roles lookup failed", rolesErr.message);
    return { errorKey: "err.server" };
  }
  const panelRoles = (rows ?? [])
    .map((r: any) => r.roles?.code as string | undefined)
    .filter((c): c is AllowedRole => !!c && isAllowedRole(c));
  // Not a panel user (a parent, a student): never reachable from this module.
  if (panelRoles.length === 0) return { errorKey: "users.err.notFound" };

  return {
    target: {
      profileId: p.id,
      authUserId: p.auth_user_id,
      email: p.email ?? null,
      isSuperAdmin: false,
      panelRoles,
    },
  };
}

export async function updatePanelUser(
  _prev: UserMutationState,
  formData: FormData,
): Promise<UserMutationState> {
  const ctx = await requireAdmin();
  const t = await getT();
  if (!hasServiceRole()) return { error: t("users.noServiceKey") };

  const profileId = String(formData.get("profile_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (displayName.length > NAME_MAX) return { error: t("users.err.nameLong") };
  if (!isAllowedRole(role)) return { error: t("users.err.role") };

  const admin = createAdminClient();
  const loaded = await loadTarget(admin, profileId);
  if ("errorKey" in loaded) return { error: t(loaded.errorKey) };
  const { target } = loaded;

  const isSelf = target.profileId === ctx.profileId;
  const roleChanges = !(target.panelRoles.length === 1 && target.panelRoles[0] === role);
  if (isSelf && roleChanges) return { error: t("users.err.self") };

  const { error: nameErr } = await admin
    .from("profiles")
    .update({ display_name: displayName || null })
    .eq("id", target.profileId);
  if (nameErr) {
    console.error("[admin] panel user rename failed", nameErr.message);
    return { error: t("err.server") };
  }

  if (roleChanges) {
    const { data: roleRows, error: roleErr } = await admin
      .from("roles")
      .select("id, code")
      .in("code", ALLOWED_ROLES as unknown as string[]);
    if (roleErr || !roleRows) {
      console.error("[admin] panel role lookup failed", roleErr?.message);
      return { error: t("err.server") };
    }
    const idOf = new Map(roleRows.map((r: any) => [r.code as string, r.id as string]));
    const newRoleId = idOf.get(role);
    if (!newRoleId) return { error: t("users.err.roleMissing") };

    // Add the new role FIRST, then remove the others: if the second step fails
    // the account keeps a panel role rather than ending up with none.
    if (!target.panelRoles.includes(role)) {
      const { error: addErr } = await admin
        .from("profile_roles")
        .insert({ profile_id: target.profileId, role_id: newRoleId, assigned_by: ctx.profileId });
      if (addErr) {
        console.error("[admin] panel role add failed", addErr.message);
        return { error: t("err.server") };
      }
    }
    const removeIds = target.panelRoles.filter((c) => c !== role).map((c) => idOf.get(c)).filter(Boolean) as string[];
    if (removeIds.length) {
      const { error: delErr } = await admin
        .from("profile_roles")
        .delete()
        .eq("profile_id", target.profileId)
        .in("role_id", removeIds);
      if (delErr) {
        console.error("[admin] panel role remove failed", delErr.message);
        return { error: t("err.server") };
      }
    }
  }

  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.panel_user.update",
    targetTable: "profiles",
    targetId: target.profileId,
    metadata: { email: target.email, role, roleChanged: roleChanges },
    severity: roleChanges ? "warning" : "info",
  });

  revalidatePath("/users");
  return { ok: true };
}

export async function deletePanelUser(
  _prev: UserMutationState,
  formData: FormData,
): Promise<UserMutationState> {
  const ctx = await requireAdmin();
  const t = await getT();
  if (!hasServiceRole()) return { error: t("users.noServiceKey") };

  const profileId = String(formData.get("profile_id") ?? "");
  const admin = createAdminClient();
  const loaded = await loadTarget(admin, profileId);
  if ("errorKey" in loaded) return { error: t(loaded.errorKey) };
  const { target } = loaded;
  if (target.profileId === ctx.profileId) return { error: t("users.err.self") };

  // Audit FIRST: deleting the profile nulls actor_profile_id on the deleted
  // person's own past entries, so this row is where their identity survives.
  await writeAuditLog({
    actorProfileId: ctx.profileId,
    action: "admin.panel_user.delete",
    targetTable: "profiles",
    targetId: target.profileId,
    metadata: { email: target.email, roles: target.panelRoles },
    severity: "warning",
  });

  // Deleting the auth user removes the profile and its roles (cascade);
  // content they authored stays, with its author reference set to NULL.
  const { error } = await admin.auth.admin.deleteUser(target.authUserId);
  if (error) {
    console.error("[admin] panel user delete failed", error.message);
    return { error: t("err.server") };
  }

  revalidatePath("/users");
  return { ok: true };
}
