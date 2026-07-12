// Mobile BFF — shared Bearer-token auth resolver (Stage M2; students M3).
//
// The React Native app has no cookie jar: every authenticated BFF request
// carries `Authorization: Bearer <supabase access_token>`. This module is the
// token-based twin of lib/auth/session.getParent() / getChild():
//
//   resolveBearerParent(request) / resolveBearerStudent(request)
//     Bearer token → admin.auth.getUser(token) (signature + expiry verified by
//     GoTrue) → profiles row by auth_user_id → ROLE verified via the
//     profile_roles→roles join (one service-role query — cheapest reliable
//     path; the has_role RPC would need a second, token-bound round-trip).
//     Returns { profileId, authUserId } or null. Callers answer null with
//     401 {error:"parent.err.invalid", retryable:false} (the app-wide generic
//     401 — no role disambiguation). resolveBearerStudent mirrors
//     requireChild() conceptually: the same profiles + role membership check
//     (current_profile_id + has_role('student') on the web) — a token only
//     resolves while its auth user still maps to a live student profile.
//
//   resolveBearerUser(request)
//     Role-aware variant for the endpoints BOTH roles share (e.g.
//     /profile/avatar): resolves parent OR student in the same single query
//     and reports which one matched.
//
//   createBearerClient(token)
//     A supabase-js client BOUND to the user's token (anon key + Authorization
//     header, no persistence) for the few calls that must run AS the user:
//     caller-scoped RPCs (e.g. is_child_free_access_active) and Storage
//     uploads with owner semantics (storage.objects.owner = auth.uid()).
//
// Authorization discipline is unchanged from the web: this resolver only
// AUTHENTICATES; every route still re-verifies ownership of client-supplied
// ids server-side before privileged work.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import type { FreeAccessChecker } from "@/lib/auth/subscriptionCore";

export type BearerParent = { profileId: string; authUserId: string };
export type BearerStudent = { profileId: string; authUserId: string };
export type BearerUser = {
  profileId: string;
  authUserId: string;
  role: "parent" | "student";
};

// The only account kinds the mobile app serves (staff never call the BFF).
const BEARER_ROLE_CODES = ["parent", "student"] as const;
type BearerRoleCode = (typeof BEARER_ROLE_CODES)[number];

// Supabase access tokens are JWTs well under 4KB; anything bigger is not a
// real client (and never reaches GoTrue).
const TOKEN_MAX_LENGTH = 4096;

/** Extracts the Bearer token from the Authorization header (null when absent/malformed). */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim() ?? "";
  if (!token || token.length > TOKEN_MAX_LENGTH) return null;
  return token;
}

/**
 * Shared resolver core: verifies the token against GoTrue, then requires the
 * auth user's profile to hold ONE of the allowed role codes — the same single
 * profiles + profile_roles→roles inner-join query M2 established, with the
 * role filter widened to a set. Returns which role matched. Never throws.
 */
async function resolveBearerUserForRoles(
  request: Request,
  roleCodes: readonly BearerRoleCode[],
): Promise<BearerUser | null> {
  try {
    const token = extractBearerToken(request);
    if (!token || !isServiceRoleConfigured) return null;

    const admin = getAdminClient();
    // Verify the token against GoTrue (signature, expiry, revocation).
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    const authUserId = data.user.id;

    // Profile + role check in ONE query: inner joins make the row disappear
    // unless a profile_roles→roles row with an allowed code exists.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, profile_roles!inner(roles!inner(code))")
      .eq("auth_user_id", authUserId)
      .in("profile_roles.roles.code", [...roleCodes])
      .maybeSingle();
    if (profileError || !profile?.id) return null;

    // Which allowed code matched. No account holds both roles in practice;
    // roleCodes order decides the theoretical tie.
    const joined = (
      profile as {
        profile_roles?: { roles?: { code?: string | null } | null }[] | null;
      }
    ).profile_roles;
    const held = new Set(
      (joined ?? []).map((row) => row.roles?.code ?? "").filter(Boolean),
    );
    const role = roleCodes.find((code) => held.has(code));
    if (!role) return null;

    return { profileId: profile.id as string, authUserId, role };
  } catch {
    return null;
  }
}

/**
 * Resolves the requesting PARENT from the Bearer token, or null when the
 * request is unauthenticated, the token is invalid/expired, or the account is
 * not a parent (children and staff can never call the parent BFF surface).
 * Never throws.
 */
export async function resolveBearerParent(
  request: Request,
): Promise<BearerParent | null> {
  const user = await resolveBearerUserForRoles(request, ["parent"]);
  return user ? { profileId: user.profileId, authUserId: user.authUserId } : null;
}

/**
 * Resolves the requesting STUDENT (child) from the Bearer token, or null when
 * the request is unauthenticated, the token is invalid/expired, or the account
 * is not a student (parents and staff can never call the student BFF surface).
 * Token twin of session.getChild()/requireChild(): the same profile + student
 * role membership check, so a token only resolves while the auth user still
 * maps to a live student profile. Never throws.
 */
export async function resolveBearerStudent(
  request: Request,
): Promise<BearerStudent | null> {
  const user = await resolveBearerUserForRoles(request, ["student"]);
  return user ? { profileId: user.profileId, authUserId: user.authUserId } : null;
}

/**
 * Resolves the requesting PARENT or STUDENT (for the endpoints both roles
 * share, e.g. /profile/avatar) in one query and reports which role matched.
 * Null on any other account kind. Never throws.
 */
export async function resolveBearerUser(
  request: Request,
): Promise<BearerUser | null> {
  return resolveBearerUserForRoles(request, BEARER_ROLE_CODES);
}

/**
 * A supabase-js client bound to the user's access token — requests run AS the
 * user (RLS + caller-scoped RPCs + Storage owner semantics), exactly like the
 * web SSR client, minus cookies. No session persistence/refresh: the client
 * lives for one request.
 */
export function createBearerClient(token: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Free-access checker for the BFF path — the token-bound twin of
 * lib/freeAccess.isChildFreeAccessActive: the SAME caller-scoped
 * `is_child_free_access_active` RPC (SECURITY DEFINER, returns false unless
 * the caller is the child's parent — identical semantics AND identical
 * resolution order to the web gate), just invoked through the bearer client
 * instead of the cookie client. Safe fallback = false.
 */
export function bearerFreeAccessChecker(client: SupabaseClient): FreeAccessChecker {
  return async (studentId: string): Promise<boolean> => {
    if (!studentId) return false;
    try {
      const { data, error } = await client.rpc("is_child_free_access_active", {
        p_student: studentId,
      });
      if (error) return false;
      return data === true;
    } catch {
      return false;
    }
  };
}
