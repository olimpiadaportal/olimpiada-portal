// SERVER-ONLY child login service.
//
// The child enters ONLY an 8-digit ID + password. The server maps ID -> synthetic
// email -> signInWithPassword (SSR client, so httpOnly session cookies are set).
// The synthetic email is never exposed to the client. Brute-force is throttled by
// the DB lockout helpers (service role): >= 8 failures / 15 min locks the ID.
import "server-only";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { childSyntheticEmail, validateChildLogin } from "@/lib/auth/children";

export type ChildLoginResult =
  | { ok: true; authUserId: string }
  | { ok: false; errors: string[] };

export async function childLogin(params: {
  childUniqueId: string;
  password: string;
  ipHash?: string | null;
}): Promise<ChildLoginResult> {
  const { childUniqueId, password, ipHash = null } = params;

  const check = validateChildLogin(childUniqueId, password);
  if (!check.ok) return { ok: false, errors: check.errors };

  const admin = getAdminClient();

  // Lockout gate (do not even attempt while locked).
  const { data: locked, error: lockErr } = await admin.rpc("is_child_login_locked", {
    p_child_unique_id: childUniqueId,
  });
  if (lockErr) return { ok: false, errors: ["auth.child.err.serverError"] };
  if (locked === true) return { ok: false, errors: ["auth.child.err.locked"] };

  // Attempt sign-in on the SSR client so session cookies are written.
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: childSyntheticEmail(childUniqueId),
    password,
  });
  const success = !error && !!data?.session;

  // Record the attempt (success clears the recent failure streak).
  await admin.rpc("record_child_login_attempt", {
    p_child_unique_id: childUniqueId,
    p_ip_hash: ipHash,
    p_success: success,
  });

  // Generic error — never reveal whether the ID exists vs the password was wrong.
  if (!success || !data.user) return { ok: false, errors: ["auth.child.err.invalidCredentials"] };
  return { ok: true, authUserId: data.user.id };
}

export async function childLogout(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
}
