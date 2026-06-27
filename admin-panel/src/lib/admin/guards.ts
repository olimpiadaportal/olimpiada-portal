// Server-side auth + permission resolution for the Admin Panel.
// Authorization is ALWAYS enforced here (and by RLS) — never by hiding UI.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthContext = {
  userId: string;
  email: string | null;
  profileId: string | null;
  roleCodes: string[];
  permissions: string[];
  isAdmin: boolean;
  isContentManager: boolean;
};

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const profileId = profile?.id ?? null;

  // Scope to THIS profile explicitly. (For an admin, RLS would otherwise return
  // every profile_roles row, polluting roleCodes/permissions with other users'.)
  const { data: prRows } = profileId
    ? await supabase
        .from("profile_roles")
        .select("role_id, roles(code)")
        .eq("profile_id", profileId)
    : { data: [] as any[] };

  const roleIds: string[] = (prRows ?? []).map((r: any) => r.role_id);
  const roleCodes: string[] = (prRows ?? [])
    .map((r: any) => r.roles?.code)
    .filter(Boolean);

  let permissions: string[] = [];
  if (roleIds.length) {
    const { data: rpRows } = await supabase
      .from("role_permissions")
      .select("permissions(code)")
      .in("role_id", roleIds);
    permissions = Array.from(
      new Set(
        (rpRows ?? []).map((r: any) => r.permissions?.code).filter(Boolean),
      ),
    );
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    profileId,
    roleCodes,
    permissions,
    isAdmin: roleCodes.includes("administrator"),
    isContentManager: roleCodes.includes("content_manager"),
  };
}

export async function requireAuthed(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

// Authenticated AND allowed into the panel at all (admin or content manager).
export async function requirePanelAccess(): Promise<AuthContext> {
  const ctx = await requireAuthed();
  if (!ctx.isAdmin && !ctx.isContentManager) redirect("/unauthorized");
  return ctx;
}

export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireAuthed();
  if (!ctx.isAdmin) redirect("/unauthorized");
  return ctx;
}

export async function requirePermission(code: string): Promise<AuthContext> {
  const ctx = await requirePanelAccess();
  if (!ctx.isAdmin && !ctx.permissions.includes(code)) redirect("/unauthorized");
  return ctx;
}
