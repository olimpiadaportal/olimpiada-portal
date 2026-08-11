import "server-only";

// ONE definition of "does an account exist for this email", shared by
// registration and login.
//
// THE BUG THIS EXISTS TO PREVENT
// ------------------------------
// Registration and login used to answer that question from DIFFERENT tables:
//
//   register -> email_is_registered()   -> auth.users
//   login    -> parentAccountExists()   -> profiles JOIN parents
//
// So an auth user whose parent provisioning was incomplete got BOTH answers at
// once: "this email is already registered" when signing up, and "no account
// exists" when signing in. Five real accounts were in that state.
//
// Two different queries answering one question will always drift. There is now
// one classifier, and both flows read the same answer.
//
// WHY THE STATES ARE SHAPED THIS WAY
// ----------------------------------
// "Exists" is not a boolean here — the useful distinctions are:
//
//   none        no auth user. The ONLY state where registration may proceed and
//               the only one where login may say "no account".
//   parent      fully provisioned. Normal.
//   incomplete  an auth user exists but the parent rows do not. Registration
//               must refuse (the address IS taken) and login must NOT claim the
//               account is missing — it exists, and signing in repairs it.
//   staff       the address belongs to an administrator or content manager.
//               Registration refuses; login must never turn them into a parent.
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export type AccountState = "none" | "parent" | "incomplete" | "staff";

const STAFF_ROLES = ["administrator", "content_manager"];

/**
 * Classify an email. `email` must already be normalized (trimmed, lowercased) —
 * both callers use the shared validator, and GoTrue stores addresses lowercased,
 * so a case-sensitive comparison here would be a silent miss.
 *
 * Fails CLOSED to "incomplete": when the service role is unavailable or a query
 * errors we must not answer "none", because "none" is the answer that lets a
 * second account be created on a taken address and tells a real user their
 * account does not exist.
 */
export async function classifyAccount(email: string): Promise<AccountState> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return "none";
  if (!isServiceRoleConfigured) return "incomplete";

  try {
    const admin = getAdminClient();

    // 1. Does an auth user exist at all? This is the authoritative answer to
    //    "is this address taken", because auth.users owns the unique index that
    //    would reject a second signup.
    const { data: taken, error: takenErr } = await admin.rpc("email_is_registered", {
      p_email: normalized,
    });
    if (takenErr) {
      console.error("classifyAccount: existence check failed", takenErr.code ?? "unknown");
      return "incomplete";
    }
    if (taken !== true) return "none";

    // 2. It is taken — now find out in what shape. profiles.email mirrors the
    //    auth address (handle_new_user), so this resolves without reaching into
    //    the auth schema from PostgREST.
    const { data: rows, error: profErr } = await admin
      .from("profiles")
      .select("id, parents(profile_id), profile_roles(roles(code))")
      .eq("email", normalized)
      .limit(1);
    if (profErr) {
      console.error("classifyAccount: profile lookup failed", profErr.code ?? "unknown");
      return "incomplete";
    }

    // `as unknown` first: PostgREST's embedded-relation inference types `roles`
    // as an array here, and the runtime shape depends on the join cardinality.
    // Both shapes are handled below, so the narrowing is done defensively
    // rather than trusted from the generated type.
    const row = ((rows ?? [])[0] as unknown) as
      | {
          id: string;
          parents?: { profile_id: string }[] | null;
          profile_roles?: { roles?: { code?: string } | { code?: string }[] | null }[] | null;
        }
      | undefined;

    // An auth user with no profile row at all is incomplete, not absent.
    if (!row) return "incomplete";

    // `roles` arrives as an object or a one-element array depending on how
    // PostgREST resolves the embed; flatten both.
    const codes = (row.profile_roles ?? [])
      .flatMap((pr) => {
        const r = pr?.roles;
        if (!r) return [];
        return Array.isArray(r) ? r.map((x) => x?.code) : [r.code];
      })
      .filter((c): c is string => typeof c === "string");
    if (codes.some((c) => STAFF_ROLES.includes(c))) return "staff";

    const hasParentRow = (row.parents ?? []).length > 0;
    return hasParentRow ? "parent" : "incomplete";
  } catch (e) {
    console.error(
      "classifyAccount: unexpected failure",
      e instanceof Error ? e.message : "unknown",
    );
    return "incomplete";
  }
}

/** Registration may proceed only when nothing holds the address. */
export function mayRegister(state: AccountState): boolean {
  return state === "none";
}

/**
 * Should login report "no account"? ONLY when nothing exists.
 *
 * `incomplete` and `staff` both mean an account DOES exist — telling that user
 * "no account" while registration tells them "already registered" is exactly
 * the contradiction this module removes.
 */
export function loginShouldSayNoAccount(state: AccountState): boolean {
  return state === "none";
}
