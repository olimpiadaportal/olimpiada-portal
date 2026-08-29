"use server";

// Create an Administrator or Content Manager from the panel.
// Least privilege: only an administrator may call this; the role is restricted to
// a fixed allowlist (no privilege escalation); the service-role client is only
// used AFTER the admin check.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guards";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/admin/audit";
import { checkNewPassword, type PasswordProblem } from "@/lib/admin/passwordPolicy";
import { getT } from "@/i18n/server";

const ALLOWED_ROLES = ["administrator", "content_manager"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

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

export type CreateUserState = { error?: string; ok?: boolean } | null;

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
  // The one strength rule, shared with the parent/child password paths.
  const pwProblem = checkNewPassword(password);
  if (pwProblem) return { error: t(PASSWORD_PROBLEM_KEY[pwProblem]) };
  if (!ALLOWED_ROLES.includes(role as AllowedRole))
    return { error: t("users.err.role") };

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
    return { error: t("err.server") };
  }
  const authUserId = created.user?.id;
  if (!authUserId) return { error: t("users.err.notCreated") };

  // 2) Activate + name the auto-provisioned profile.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (!profile) return { error: t("users.err.noProfile") };
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
  if (!roleRow) return { error: t("users.err.roleMissing") };
  const { error: assignErr } = await admin
    .from("profile_roles")
    .insert({ profile_id: profile.id, role_id: roleRow.id });
  if (assignErr) {
    // Never return raw DB error text to the client.
    console.error("[admin] panel role assign failed", assignErr.message);
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
