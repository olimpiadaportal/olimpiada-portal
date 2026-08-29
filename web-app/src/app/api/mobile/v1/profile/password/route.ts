// Mobile BFF — the signed-in user changes their OWN password (parents AND
// students; both mobile roles have a "change my password" screen).
//
// This endpoint exists because the app used to call
// `supabase.auth.updateUser({ password })` DIRECTLY from the device. GoTrue has
// no hook that validates a password at the moment it is CHOSEN (see
// lib/auth/passwordPolicy), so a direct client call means the strength rule is
// enforced nowhere the user cannot edit — a rebuilt binary, or anything holding
// a valid access token, walks straight past it. Routing the change through the
// server is what makes the rule real; the client-side check stays as UX.
//
// Token twin of the web paths (parentService.updatePassword /
// childProfileActions.childChangeOwnPassword): the same shared rule, the same
// `pwupdate` rate-limit bucket keyed by PROFILE (so the 15-minute budget is per
// account, not per surface), and — for a student — the same "your password may
// not be your 8-digit login ID" rule.
//
// The write runs on the BEARER client: auth.updateUser acts on the token's own
// user, so no service-role key touches this path and no client-supplied id is
// accepted (being the token holder IS the authorization).
//
// Request: JSON {"password":"…"} → {ok:true, data:{updated:true}}
import {
  createBearerClient,
  extractBearerToken,
  resolveBearerUser,
} from "@/lib/auth/mobileBearer";
import { checkNewPassword } from "@/lib/auth/passwordPolicy";
import { rateLimitAllow } from "@/lib/rateLimit";
import {
  bodyStr,
  errorResponse,
  okResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before reading the body. Parent OR student.
    const user = await resolveBearerUser(request);
    if (!user) return unauthorizedResponse();

    // Same bucket and budget as the web password paths — credential-adjacent.
    if (!rateLimitAllow("pwupdate", user.profileId, 5, 15 * 60_000)) {
      return errorResponse("parent.err.tooMany", 429);
    }

    const body = await readJsonBody(request);
    const password = bodyStr(body, "password");

    // Both roles answer with the key their own screen already renders, so the
    // app needs no new copy: parents get parent.err.*, students the
    // profile.err.* strings their profile screen uses.
    const weak = checkNewPassword(password);
    if (weak) {
      const isLength = weak === "tooShort" || weak === "tooLong";
      const key =
        user.role === "student"
          ? isLength
            ? "profile.err.passwordShort"
            : "profile.err.passwordWeak"
          : isLength
            ? "parent.err.password"
            : "parent.err.passwordWeak";
      return errorResponse(key, 400);
    }

    // resolveBearerUser verified this token, so it is present here.
    const client = createBearerClient(extractBearerToken(request) ?? "");

    if (user.role === "student") {
      // Web parity (childChangeOwnPassword): reject password == the child's own
      // 8-digit login ID. Read through the student's OWN client, so RLS decides
      // which row is readable — the profile id comes from the token, never the
      // body.
      const { data: student } = await client
        .from("students")
        .select("child_unique_id")
        .eq("profile_id", user.profileId)
        .maybeSingle();
      const uniqueId = (student as { child_unique_id?: string | null } | null)
        ?.child_unique_id;
      if (uniqueId && password === uniqueId) {
        return errorResponse("profile.err.passwordEqualsId", 400);
      }
    }

    const { error } = await client.auth.updateUser({ password });
    if (error) {
      // Never leak error.message; log the code server-side only.
      console.error("mobile password update failed", error.status ?? "unknown");
      return errorResponse("profile.err.updateFailed", 400);
    }
    return okResponse({ updated: true });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("profile.err.updateFailed", 500, true);
  }
}
