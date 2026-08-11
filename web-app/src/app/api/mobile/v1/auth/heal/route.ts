// Mobile BFF — repair a parent account whose provisioning never finished.
//
// THE STATE THIS EXISTS FOR
// -------------------------
// Registration is signUp THEN setup_parent. Any failure between the two leaves
// an auth user with a profile but no roles and no `parents` row — an account
// that registration calls "already registered" while every role check says it
// is nobody. Five real accounts were in that state (migration 105 repaired
// them; the 2026-07-29 recovery had rebuilt profiles without re-running parent
// provisioning).
//
// The web fixed it inside parentLogin: after the password verifies, an
// `incomplete` classification self-heals. Mobile could not do the same — the
// app signs in against Supabase directly and has no service-role key, so it
// just landed on role "unknown" with nothing but a retry button. This is that
// same self-heal, moved behind a token.
//
// WHY NOT resolveBearerParent
// ---------------------------
// Every other BFF route authorizes with resolveBearerParent/Student, which
// require the role. This endpoint is for the case where the role is MISSING, so
// that guard would reject exactly the callers it is meant to serve. The token is
// instead verified against GoTrue directly (auth.getUser validates the
// signature server-side) — a forged or expired token resolves to no user.
//
// A caller who is ALREADY a parent gets healed:false, not an error: the app
// calls this whenever the role fails to resolve, and a network hiccup during
// role resolution must not look like a broken account.
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { classifyAccount } from "@/lib/auth/accountState";
import { extractBearerToken } from "@/lib/auth/mobileBearer";
import { rateLimitAllow } from "@/lib/rateLimit";
import { errorResponse, okResponse, unauthorizedResponse } from "@/lib/mobile/http";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST. No body is read at all — there is nothing for the
    // caller to supply: the account to repair is the one holding the token.
    const token = extractBearerToken(request);
    if (!token) return unauthorizedResponse();

    if (!isServiceRoleConfigured) {
      return errorResponse("parent.err.incompleteAccount", 503, true);
    }
    const admin = getAdminClient();

    // Verifies the JWT signature and expiry against GoTrue — this is the
    // authorization, so it happens before anything else touches the database.
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const authUser = userData?.user;
    if (userErr || !authUser?.id) return unauthorizedResponse();

    const email = (authUser.email ?? "").trim().toLowerCase();
    if (!email) return unauthorizedResponse();

    // Keyed by auth user, so a stuck client retrying cannot hammer setup_parent.
    if (!rateLimitAllow("authheal", authUser.id, 5, 15 * 60_000)) {
      return errorResponse("parent.err.tooMany", 429);
    }

    // The SAME classifier the web login and both registration paths use. Two
    // separate existence queries are what produced "already registered" on one
    // screen and "no account" on another.
    const state = await classifyAccount(email);

    // A staff address must never be turned into a parent — setup_parent refuses
    // it too (migration 105), but failing here keeps the reason specific.
    if (state === "staff") return errorResponse("parent.err.staffAccount", 403);
    if (state !== "incomplete") return okResponse({ healed: false });

    const { data: profileId, error: healErr } = await admin.rpc("setup_parent", {
      p_auth_user_id: authUser.id,
      p_display_name:
        typeof authUser.user_metadata?.display_name === "string"
          ? authUser.user_metadata.display_name
          : null,
    });
    if (healErr) {
      console.error("mobile heal: setup_parent failed", healErr.code ?? "unknown");
      return errorResponse("parent.err.incompleteAccount", 500, true);
    }

    if (typeof profileId === "string") {
      await writeAuditLog(profileId, "parent.repair");
    }
    return okResponse({ healed: true });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("parent.err.incompleteAccount", 500, true);
  }
}
