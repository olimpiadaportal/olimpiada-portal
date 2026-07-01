// Server-side session helpers for the parent app. Uses the SSR client (the
// signed-in user's cookies) and the SECURITY DEFINER helpers current_profile_id()
// / has_role() to resolve the parent's profile and role. RLS is the real gate.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getParent(): Promise<{ profileId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: pid }, { data: isParent }] = await Promise.all([
    supabase.rpc("current_profile_id"),
    supabase.rpc("has_role", { p_role_code: "parent" }),
  ]);
  if (!pid || isParent !== true) return null;
  return { profileId: pid as string };
}

export async function requireParent(): Promise<{ profileId: string }> {
  const parent = await getParent();
  if (!parent) redirect("/login");
  return parent;
}

export async function getChild(): Promise<{ profileId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: pid }, { data: isStudent }] = await Promise.all([
    supabase.rpc("current_profile_id"),
    supabase.rpc("has_role", { p_role_code: "student" }),
  ]);
  if (!pid || isStudent !== true) return null;
  return { profileId: pid as string };
}

export async function requireChild(): Promise<{ profileId: string }> {
  const child = await getChild();
  if (!child) redirect("/child-login");
  return child;
}
