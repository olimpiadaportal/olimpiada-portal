// Server-side session helpers for the parent app. Uses the SSR client (the
// signed-in user's cookies) and the SECURITY DEFINER helpers current_profile_id()
// / has_role() to resolve the parent's profile and role. RLS is the real gate.
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Resolve the profile id + a role flag from the two helper RPCs, retrying ONCE on
// a transient error/empty result while a user session is present. This prevents a
// momentary DB/RPC hiccup from resolving to "not a parent" and bouncing a validly
// signed-in user to /login (the reported "logs me out on navigation" class of bug).
async function resolveRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roleCode: string,
): Promise<{ profileId: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [{ data: pid, error: e1 }, { data: hasRole, error: e2 }] = await Promise.all([
      supabase.rpc("current_profile_id"),
      supabase.rpc("has_role", { p_role_code: roleCode }),
    ]);
    if (!e1 && !e2 && pid && hasRole === true) return { profileId: pid as string };
    // A definitive "no such role" (no error, hasRole===false) is not transient → stop.
    if (!e1 && !e2 && hasRole === false) return null;
  }
  return null;
}

// React cache(): layout + page (and any nested server components) share ONE
// parent/child resolution per request instead of re-running the auth + RPC
// round-trips for every caller. Scoped per-request, so no cross-user leakage.
const getParentCached = cache(async (): Promise<{ profileId: string } | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return resolveRole(supabase, "parent");
});

export async function getParent(): Promise<{ profileId: string } | null> {
  return getParentCached();
}

export async function requireParent(): Promise<{ profileId: string }> {
  const parent = await getParent();
  if (!parent) redirect("/login");
  return parent;
}

const getChildCached = cache(async (): Promise<{ profileId: string } | null> => {
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
});

export async function getChild(): Promise<{ profileId: string } | null> {
  return getChildCached();
}

export async function requireChild(): Promise<{ profileId: string }> {
  const child = await getChild();
  // The standalone /child-login page is retired — the unified /login page
  // opens on its Student tab instead.
  if (!child) redirect("/login?tab=student");
  return child;
}
