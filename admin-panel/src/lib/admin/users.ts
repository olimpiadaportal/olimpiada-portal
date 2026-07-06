"use server";

// Create an Administrator or Content Manager from the panel.
// Least privilege: only an administrator may call this; the role is restricted to
// a fixed allowlist (no privilege escalation); the service-role client is only
// used AFTER the admin check.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guards";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/admin/audit";
import { getT } from "@/i18n/server";

const ALLOWED_ROLES = ["administrator", "content_manager"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

export type CreateUserState = { error?: string; ok?: boolean } | null;

export async function createPanelUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const ctx = await requireAdmin(); // ONLY administrators can create panel users

  if (!hasServiceRole()) {
    return {
      error:
        "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to admin-panel/.env.local (server-only) and restart.",
    };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  if (!email) return { error: "Email is required." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (!ALLOWED_ROLES.includes(role as AllowedRole))
    return { error: "Invalid role." };

  const admin = createAdminClient();

  // 1) Create the Auth user (email pre-confirmed). The signup trigger creates the profile.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });
  if (createErr) {
    // Never return raw Auth error text to the client (never log passwords).
    console.error("[admin] panel user create failed", createErr.message);
    const t = await getT();
    return { error: t("err.server") };
  }
  const authUserId = created.user?.id;
  if (!authUserId) return { error: "User was not created." };

  // 2) Activate + name the auto-provisioned profile.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!profile) return { error: "Profile was not provisioned." };
  await admin
    .from("profiles")
    .update({ status: "active", display_name: displayName || null })
    .eq("id", profile.id);

  // 3) Assign the (allowlisted) role.
  const { data: roleRow } = await admin
    .from("roles")
    .select("id")
    .eq("code", role)
    .maybeSingle();
  if (!roleRow) return { error: "Role not found." };
  const { error: assignErr } = await admin
    .from("profile_roles")
    .insert({ profile_id: profile.id, role_id: roleRow.id });
  if (assignErr) {
    // Never return raw DB error text to the client.
    console.error("[admin] panel role assign failed", assignErr.message);
    const t = await getT();
    return { error: t("err.server") };
  }

  // M3: privileged-account creation is a sensitive mutation — always audited
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
