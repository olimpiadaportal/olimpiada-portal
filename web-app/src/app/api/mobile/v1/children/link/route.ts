// Mobile BFF — existing-child access for a second adult.
//
// TWO ROUTES IN, NEITHER OF THEM APPROVED. Migration 177 (2026-09-16) removed
// the approval step: a second parent proved they may reach the child by
// entering that child's OWN credentials (8-digit id + the password the creating
// parent set), and the grant was immediate. Migration 180 (2026-09-17) brought
// the invite CODE back beside it on the same terms — `redeem` now creates the
// ACTIVE link itself and notifies the creator, returning {ok:true,
// state:'saved'}. There is no pending state behind either route.
//
//   state        the caller's children and which of them they created. Wire
//                shape UNCHANGED on purpose — this ships as an OTA update, and
//                a device still running yesterday's bundle keeps posting the
//                old body until its next launch.
//   access       the adults who can reach ONE child, for the "who has access"
//                list. child_access_adults refuses a caller who has no access
//                of their own, so this can never become a way to enumerate the
//                adults around an arbitrary minor.
//   credentials  verify the child's credentials, then link.
//   issue        creator-only: mint a one-time code. The RAW code is in the
//   redeem       response ONCE (only its sha256 is stored); redeem spends it.
//                Both ride manage_child_link through the passthrough below,
//                which re-validates the action and every id shape.
//
// `approve`, `reject` and `revokeInvite` are NOT offered by any screen and are
// not blocked here either. A binary older than the 177 update can still post
// them, and the right answer to that is the database's — if 180 dropped those
// branches the RPC rejects them with its own error code, which reaches the old
// UI as an ordinary refusal. `revoke` and `leave` are not legacy at all — they
// are the only way access is ever taken away, and the screen still uses both.
//
// WHAT THIS ROUTE MUST NEVER DO: call childLoginService.childLogin(). That
// signs in on the SSR cookie client, which would write the CHILD's session
// cookies onto the PARENT's request and silently log the parent in as their own
// child. Verification belongs to linkChildByCredentials, which uses a bare
// token client whose session is discarded before it returns; this route wraps
// it and never re-implements it.
import { createHash } from "node:crypto";
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { getChildLinkState, mutateChildLink } from "@/lib/auth/childLinkCore";
import {
  getChildAccessAdults,
  linkChildByCredentials,
} from "@/lib/auth/childCredentialLink";
import { rateLimitAllow } from "@/lib/rateLimit";
import { bodyStr, errorResponse, okResponse, readJsonBody, unauthorizedResponse } from "@/lib/mobile/http";
import { PASSWORD_MAX } from "@/lib/auth/passwordPolicy";
import { isUuid } from "@/lib/uuid";
import type { ChildLinkAction } from "@/lib/childLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHILD_ID_RE = /^\d{8}$/;

/**
 * i18n key → HTTP status.
 *
 * NEVER 401 on a credential failure. The mobile client maps ANY 401 on a
 * Bearer call to "your session expired" (classifyBffResponse in
 * mobile-app/src/lib/api.ts) — correctly, because there a 401 means the TOKEN
 * was rejected. A wrong CHILD password answered with 401 would therefore throw
 * the parent out of their own account instead of telling them the password was
 * wrong. The rejection is a 400 about the submitted body, not about the caller.
 */
function linkStatus(errorKey: string): number {
  if (errorKey === "link.err.rate") return 429;
  if (errorKey.endsWith("forbidden") || errorKey.endsWith("creatorOnly")) return 403;
  return 400;
}

function isRetryable(errorKey: string): boolean {
  return errorKey === "link.err.rate" || errorKey.endsWith("generic");
}

/** First hop of x-forwarded-for, x-real-ip fallback, "local" in dev — the same
 *  derivation the child-login route uses. Only a sha256 hash is ever passed on. */
function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  return (
    xff.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    // AUTHORIZE FIRST — before the body is read. A credential endpoint that
    // parses input before it knows who is calling is one refactor away from
    // being callable by anyone.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    const body = await readJsonBody(request);
    const action = bodyStr(body, "action");

    if (action === "state") {
      return okResponse(await getChildLinkState(parent.profileId));
    }

    if (action === "access") {
      const studentId = bodyStr(body, "student_id");
      if (!isUuid(studentId)) return errorResponse("link.err.invalid", 400);
      // Returns [] for a child this parent cannot reach — the RPC decides, and
      // an empty list is indistinguishable from "no adults", which is the point.
      return okResponse({
        adults: await getChildAccessAdults(parent.profileId, studentId),
      });
    }

    if (action === "credentials") {
      const childUniqueId = bodyStr(body, "child_id").replace(/\s/g, "");
      const password = bodyStr(body, "password");
      // Shape checks BEFORE any privileged call, so a malformed submission
      // never reaches the database and never consumes a throttle slot. The
      // single generic key covers both fields deliberately: every
      // child-credential path in this codebase refuses to say which half was
      // wrong, because an endpoint that does turns a 10^8 id space into an
      // enumerable directory of real minors.
      if (
        !CHILD_ID_RE.test(childUniqueId) ||
        password.length === 0 ||
        password.length > PASSWORD_MAX
      ) {
        return errorResponse("link.err.credentialsInvalid", 400);
      }

      // SAME scope as the web action ("childcredlink"), so a household's web and
      // app attempts share one budget — and deliberately NOT the "mchildlogin"
      // bucket, which would make an adult's typo eat a real child's login budget
      // from the same IP. This is not the real control either: rateLimit is
      // in-memory per instance, so on a multi-instance deploy the effective
      // ceiling is limit x instances. The database ledger inside
      // linkChildByCredentials is the control.
      const ip = clientIp(request);
      if (!rateLimitAllow("childcredlink", ip, 20, 15 * 60_000)) {
        return errorResponse("link.err.rate", 429, true);
      }
      const ipHash = createHash("sha256").update(ip).digest("hex");

      const result = await linkChildByCredentials({
        actorProfileId: parent.profileId,
        childUniqueId,
        password,
        ipHash,
      });
      if (!result.ok) {
        // The key travels UNCHANGED — it is already an i18n key chosen by the
        // verification module, never a Postgres/Supabase message.
        return errorResponse(
          result.errorKey,
          linkStatus(result.errorKey),
          isRetryable(result.errorKey),
        );
      }
      return okResponse({
        studentProfileId: result.studentProfileId,
        childName: result.childName,
      });
    }

    // manage_child_link passthrough: `issue` and `redeem` (the code route),
    // `revoke` and `leave` (the two ways access ends), plus the retired approval
    // actions an un-updated bundle may still post. mutateChildLink re-validates
    // the action against its own whitelist, normalizes the 8-digit id and the
    // 20-character code, and checks every uuid shape — so nothing is trusted
    // here that is not re-checked there and again in the RPC.
    const result = await mutateChildLink(parent.profileId, {
      action: action as ChildLinkAction,
      studentId: bodyStr(body, "student_id") || undefined,
      invitationId: bodyStr(body, "invitation_id") || undefined,
      parentId: bodyStr(body, "parent_id") || undefined,
      childId: bodyStr(body, "child_id") || undefined,
      code: bodyStr(body, "code") || undefined,
    });
    if (!result.ok) {
      return errorResponse(
        result.errorKey,
        linkStatus(result.errorKey),
        isRetryable(result.errorKey),
      );
    }
    return okResponse(result);
  } catch {
    return errorResponse("link.err.generic", 500, true);
  }
}
