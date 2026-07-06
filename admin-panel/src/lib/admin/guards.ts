// Server-side auth + permission resolution for the Admin Panel.
// Authorization is ALWAYS enforced here (and by RLS) — never by hiding UI.
import { cache } from "react";
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

// Retry a Supabase query once on a hard error (transient DB/network hiccup), so a
// momentary blip does not present an authenticated admin as having no roles and
// log them out. Does NOT retry on a clean "no rows" result — only on errors.
async function withRetry<R extends { error: unknown }>(
  fn: () => PromiseLike<R>,
): Promise<R> {
  const first = await fn();
  if (!first.error) return first;
  return await fn();
}

// Wrapped in React cache() so the layout guard + page guard (+ any server
// action guard rendered in the same request) share ONE auth/role/permission
// lookup per request instead of repeating the full chain. The roles →
// permissions lookups stay sequential on purpose: permissions depend on the
// resolved role ids, so there is nothing independent to parallelize.
export const getAuthContext = cache(
  async (): Promise<AuthContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await withRetry(() =>
    supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
  );
  const profileId = profile?.id ?? null;

  // Scope to THIS profile explicitly. (For an admin, RLS would otherwise return
  // every profile_roles row, polluting roleCodes/permissions with other users'.)
  const { data: prRows } = profileId
    ? await withRetry(() =>
        supabase
          .from("profile_roles")
          .select("role_id, roles(code)")
          .eq("profile_id", profileId),
      )
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
  },
);

// No authenticated user/session → send to /login (NOT /unauthorized). A missing
// or transiently-stale session is an auth problem, not an authorization failure;
// only a genuinely authenticated user that lacks a panel role reaches a
// /unauthorized redirect (in the guards below).
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
