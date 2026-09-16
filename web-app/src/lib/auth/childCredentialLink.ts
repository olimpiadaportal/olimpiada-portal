// SERVER-ONLY. Grant a parent access to an EXISTING child by verifying that
// child's own credentials (8-digit id + the password their parent set).
//
// THIS REPLACED AN APPROVAL FLOW, AND THE DIFFERENCE MATTERS. Until 2026-09-16 a
// second adult was NOMINATED: they redeemed a one-time code and the creating
// parent had to approve a named person. That design never completed a link in
// production - issuing a new code revokes any pending redemption, so a parent who
// redeemed and then generated a fresh code to retry destroyed their own request
// (migration 177's header has the timestamps). The owner removed approval
// entirely. What approval also provided, silently, was CONSENT and a
// NOTIFICATION, and neither survives on its own, so they are rebuilt as
// mechanism here and in the RPC:
//
//   * the child's lockout is READ but never written (see below),
//   * this flow has its own throttle that cannot be aimed at a child,
//   * the RPC notifies the creating parent at priority 1 on every link,
//   * the RPC audits the grant at severity warning.
//
// NEVER CALL childLoginService.childLogin() FROM HERE. It signs in on the SSR
// client, which writes httpOnly session cookies - the PARENT would be silently
// logged in AS THE CHILD. This module uses a bare token client whose session is
// discarded before the function returns.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";
import { childSyntheticEmail, validateChildLogin } from "@/lib/auth/children";

const CHILD_ID_RE = /^\d{8}$/;

export type CredentialLinkResult =
  | { ok: true; studentProfileId: string; childName: string }
  | { ok: false; errorKey: string };

/**
 * RPC result codes -> i18n keys.
 *
 * `invalid` deliberately covers BOTH "no child has that id" and "the password is
 * wrong". Every child-credential path in this codebase refuses to distinguish
 * them, because an endpoint that does turns a 10^8 id space into an enumerable
 * directory of real minors. Do not add a friendlier key for one of them.
 */
const LINK_ERROR_KEYS: Record<string, string> = {
  invalid: "link.err.credentialsInvalid",
  forbidden: "link.err.forbidden",
  alreadyOwner: "link.err.alreadyOwner",
  alreadyLinked: "link.err.alreadyLinked",
  limit: "link.err.limit",
};

function fail(code: string): CredentialLinkResult {
  return { ok: false, errorKey: LINK_ERROR_KEYS[code] ?? "link.err.generic" };
}

/**
 * Verify a child's credentials and, on success, link them to `actorProfileId`.
 *
 * The caller MUST have authorized the actor as a parent first. This function
 * re-checks that the actor is an ACTIVE parent inside the RPC, but it is not the
 * authorization boundary - `requireParent()` / `resolveBearerParent()` is.
 */
export async function linkChildByCredentials(params: {
  actorProfileId: string;
  childUniqueId: string;
  password: string;
  ipHash?: string | null;
}): Promise<CredentialLinkResult> {
  const { actorProfileId, ipHash = null } = params;
  const childUniqueId = params.childUniqueId.replace(/\s/g, "");
  const password = params.password;

  // Shape checks before any privileged call, so a malformed id never reaches the
  // database and never consumes a throttle slot.
  if (!isUuid(actorProfileId) || !CHILD_ID_RE.test(childUniqueId)) return fail("invalid");

  // validateChildLogin, NOT validateChildPassword. The former applies no strength
  // policy on purpose: every child password created before the policy existed
  // must keep working, and a strength check here would refuse exactly the
  // households most likely to need this flow.
  const shape = validateChildLogin(childUniqueId, password);
  if (!shape.ok) return fail("invalid");

  const admin = getAdminClient();

  // CEILING 1 - ours. Keyed on the acting parent and their IP, so grinding costs
  // the attacker rather than the child. The IP arm matters because parent
  // accounts are free to create, which makes an actor-only limit resettable.
  const { data: selfLocked, error: selfErr } = await admin.rpc("is_parent_link_verify_locked", {
    p_actor: actorProfileId,
    p_ip_hash: ipHash,
  });
  if (selfErr) return fail("generic");
  if (selfLocked === true) return { ok: false, errorKey: "link.err.rate" };

  // CEILING 2 - the child's own. READ ONLY. If the child is already locked out
  // through the login form, do not also probe them here. We never WRITE to that
  // ledger: eight deliberate wrong guesses from this endpoint would otherwise
  // lock a real minor out of their own app for fifteen minutes, deniably, from a
  // parent-facing screen.
  const { data: childLocked, error: childErr } = await admin.rpc("is_child_login_locked", {
    p_child_unique_id: childUniqueId,
  });
  if (childErr) return fail("generic");
  if (childLocked === true) return { ok: false, errorKey: "link.err.rate" };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return fail("generic");

  // Bare token client: no cookies, no persistence, nothing written to the
  // parent's session. The child's session exists only inside this function.
  const bare = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let verified = false;
  try {
    const { data, error } = await bare.auth.signInWithPassword({
      email: childSyntheticEmail(childUniqueId),
      password,
    });
    verified = !error && !!data?.session && !!data?.user;
  } finally {
    // Revoke the refresh token we just minted rather than leaving a live session
    // for a child who never asked to be signed in. persistSession:false keeps it
    // out of this process; signOut() ends it at Supabase too.
    await bare.auth.signOut().catch(() => {});
  }

  // Recorded in OUR ledger, never the child's. A success here also does not clear
  // the child's real failure streak, which record_child_login_attempt would do -
  // that would silently unlock an account someone was in the middle of attacking.
  await admin
    .rpc("record_parent_link_verify_attempt", {
      p_actor: actorProfileId,
      p_child_unique_id: childUniqueId,
      p_ip_hash: ipHash,
      p_success: verified,
    })
    .then(
      () => undefined,
      () => undefined,
    );

  if (!verified) return fail("invalid");

  const { data, error } = await admin.rpc("link_child_by_verified_credentials", {
    p_actor: actorProfileId,
    p_child_unique_id: childUniqueId,
    p_ip_hash: ipHash,
  });
  if (error || !data || typeof data !== "object") return fail("generic");

  const row = data as Record<string, unknown>;
  if (row.ok !== true) return fail(typeof row.code === "string" ? row.code : "generic");

  return {
    ok: true,
    studentProfileId: String(row.student_profile_id ?? ""),
    childName: String(row.child_name ?? ""),
  };
}

export type ChildAccessAdult = {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  role: "creator" | "linked";
  since: string | null;
};

/**
 * The adults who can reach this child, for the "who has access" panel.
 *
 * Readable only by an adult who already has access (creator or active link) -
 * the RPC enforces that, so this never becomes a way to discover the adults
 * around an arbitrary minor.
 */
export async function getChildAccessAdults(
  actorProfileId: string,
  studentProfileId: string,
): Promise<ChildAccessAdult[]> {
  if (!isUuid(actorProfileId) || !isUuid(studentProfileId)) return [];
  const { data, error } = await getAdminClient().rpc("child_access_adults", {
    p_actor: actorProfileId,
    p_student: studentProfileId,
  });
  if (error || !data || typeof data !== "object") return [];
  const row = data as Record<string, unknown>;
  if (row.ok !== true || !Array.isArray(row.adults)) return [];
  return row.adults as ChildAccessAdult[];
}
