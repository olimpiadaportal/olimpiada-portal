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
/**
 * The outcome of a role check.
 *
 * The third case matters: "the RPCs errored, so we do not know" is NOT the same
 * as "definitively not this role", and treating them alike is how a guard fails
 * OPEN. Callers that merely *gate a route* can collapse `unknown` into "no"
 * (worst case: a valid user is asked to sign in again). Callers that *suppress
 * UI a role must never see* must treat `unknown` as "maybe yes" and hide it.
 */
export type RoleResolution =
  | { kind: "yes"; profileId: string }
  | { kind: "no" }
  | { kind: "unknown" };

async function resolveRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roleCode: string,
): Promise<RoleResolution> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [{ data: pid, error: e1 }, { data: hasRole, error: e2 }] = await Promise.all([
      supabase.rpc("current_profile_id"),
      supabase.rpc("has_role", { p_role_code: roleCode }),
    ]);
    if (!e1 && !e2 && pid && hasRole === true) return { kind: "yes", profileId: pid as string };
    // A definitive "no such role" (no error, hasRole===false) is not transient → stop.
    if (!e1 && !e2 && hasRole === false) return { kind: "no" };
  }
  // Both attempts errored (or returned an empty profile id) while a user session
  // exists — the role is genuinely undetermined.
  return { kind: "unknown" };
}

// React cache(): layout + page (and any nested server components) share ONE
// parent/child resolution per request instead of re-running the auth + RPC
// round-trips for every caller. Scoped per-request, so no cross-user leakage.
const getParentCached = cache(async (): Promise<RoleResolution> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // No session at all → definitively not a parent (not "unknown").
  if (!user) return { kind: "no" };
  return resolveRole(supabase, "parent");
});

export async function getParent(): Promise<{ profileId: string } | null> {
  const r = await getParentCached();
  return r.kind === "yes" ? { profileId: r.profileId } : null;
}

export async function requireParent(): Promise<{ profileId: string }> {
  const parent = await getParent();
  if (!parent) redirect("/login");
  return parent;
}

const getChildCached = cache(async (): Promise<RoleResolution> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // No session at all → definitively not a child (not "unknown").
  if (!user) return { kind: "no" };
  // Round 50: this used to fire the two RPCs once and discard their errors, so a
  // transient hiccup resolved a signed-in CHILD to "not a child". That fails
  // OPEN for the public surfaces that use this to hide purchase UI. It now goes
  // through the same retrying resolver as the parent role.
  return resolveRole(supabase, "student");
});

export async function getChild(): Promise<{ profileId: string } | null> {
  const r = await getChildCached();
  return r.kind === "yes" ? { profileId: r.profileId } : null;
}

/**
 * Full child-role resolution, including the "we could not determine it" case.
 *
 * Use this — never `getChild()` — when deciding whether to render purchase UI.
 * "Children can never purchase" is a non-negotiable product rule, so an
 * undetermined role must suppress the UI (fail CLOSED); `getChild()` collapses
 * `unknown` to null and would show it.
 */
export async function getChildResolution(): Promise<RoleResolution> {
  return getChildCached();
}

/**
 * `true` when purchase-adjacent UI (prices with a buy CTA, checkout links) may
 * be rendered for the current visitor: signed-out guests and parents, yes;
 * children and unresolved sessions, no.
 */
export async function maySeePurchaseUi(): Promise<boolean> {
  return (await getChildCached()).kind === "no";
}

export async function requireChild(): Promise<{ profileId: string }> {
  const child = await getChild();
  // The standalone /child-login page is retired — the unified /login page
  // opens on its Student tab instead.
  if (!child) redirect("/login?tab=student");
  return child;
}
