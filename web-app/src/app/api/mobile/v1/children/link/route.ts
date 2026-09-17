// Mobile BFF — existing-child access for a second adult.
//
// ONE ROUTE IN, AND NO APPROVAL BEHIND IT. Migration 177 (2026-09-16) removed
// the approval step and let a second parent prove they may reach the child by
// entering that child's OWN credentials. Migration 180 (2026-09-17) brought the
// invite CODE back beside it on the same terms — `redeem` creates the ACTIVE
// link itself and notifies the creator, returning {ok:true, state:'saved'}.
// Migration 181, the same day, withdrew the credential route: an invite code is
// a one-time, expiring secret the CREATING parent generates deliberately, while
// a child's password is a standing secret the CHILD also knows and can pass on.
// The weaker of two overlapping doors was closed.
//
//   state        the caller's children and which of them they created. Wire
//                shape UNCHANGED on purpose — this ships as an OTA update, and
//                a device still running yesterday's bundle keeps posting the
//                old body until its next launch.
//   access       the adults who can reach ONE child, for the "who has access"
//                list. child_access_adults refuses a caller who has no access
//                of their own, so this can never become a way to enumerate the
//                adults around an arbitrary minor.
//   issue        creator-only: mint a one-time code. The RAW code is in the
//   redeem       response ONCE (only its sha256 is stored); redeem spends it.
//                Both ride manage_child_link through the passthrough below,
//                which re-validates the action and every id shape.
//
// `credentials` is handled explicitly below and refused — see the comment there;
// it is a DEPLOY-WINDOW case, not a legacy one. `approve`, `reject` and
// `revokeInvite` are offered by no screen and are not blocked here either: an
// old binary can still post them, and the right answer to that is the
// database's — 180 dropped those branches, so the RPC rejects them with its own
// error code, which reaches the old UI as an ordinary refusal. `revoke` and
// `leave` are not legacy at all — they are the only way access is ever taken
// away, and the screen still uses both.
//
// WHAT THIS ROUTE MUST NEVER DO: call childLoginService.childLogin(). That signs
// in on the SSR cookie client, which would write the CHILD's session cookies
// onto the PARENT's request and silently log the parent in as their own child.
// Nothing here verifies a child password any more, and nothing here should start
// to — linking is the invite code's job and the RPC's.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { getChildLinkState, mutateChildLink } from "@/lib/auth/childLinkCore";
import { getChildAccessAdults } from "@/lib/auth/childAccessAdults";
import { bodyStr, errorResponse, okResponse, readJsonBody, unauthorizedResponse } from "@/lib/mobile/http";
import { isUuid } from "@/lib/uuid";
import type { ChildLinkAction } from "@/lib/childLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * i18n key → HTTP status.
 *
 * NEVER 401 on a rejection of the submitted BODY. The mobile client maps ANY
 * 401 on a Bearer call to "your session expired" (classifyBffResponse in
 * mobile-app/src/lib/api.ts) — correctly, because there a 401 means the TOKEN
 * was rejected. A mistyped invite code answered with 401 would therefore throw
 * the parent out of their own account instead of telling them the code was
 * wrong. The rejection is a 400 about what was submitted, not about the caller.
 */
function linkStatus(errorKey: string): number {
  if (errorKey === "link.err.rate") return 429;
  if (errorKey.endsWith("forbidden") || errorKey.endsWith("creatorOnly")) return 403;
  return 400;
}

function isRetryable(errorKey: string): boolean {
  return errorKey === "link.err.rate" || errorKey.endsWith("generic");
}

export async function POST(request: Request): Promise<Response> {
  try {
    // AUTHORIZE FIRST — before the body is read. An endpoint that parses input
    // before it knows who is calling is one refactor away from being callable
    // by anyone.
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

    // THE DEPLOY WINDOW, HANDLED ON PURPOSE. The credential route was withdrawn
    // on 2026-09-17 (migration 181) and the mobile screen that posted this went
    // with it — but the two halves do not land together. The web app deploys on
    // push, so this file stops accepting `credentials` the moment it merges; the
    // mobile fix ships as an OTA update that only applies on a user's NEXT
    // LAUNCH. Between the two there is a real window in which a parent running
    // yesterday's bundle taps a password form this route no longer serves.
    //
    // They get a clean, TRANSLATED refusal for it: `link.err.invalid` is an
    // existing generic key that is in the old bundle's dictionary too (which is
    // what matters — the OLD app renders this key from the OLD catalog, so a key
    // minted today would ship to that parent as a raw string). Not a 500, not an
    // unhandled fall-through, and not retryable: retrying cannot help, because
    // the route will never accept this action again. The RPC behind it is
    // dropped in the same migration, so there is nothing left to call even if
    // this branch were removed — but "the database would reject it anyway" is
    // how an unhandled body becomes a 500 on somebody's phone.
    if (action === "credentials") {
      // link.err.unavailable, NOT link.err.invalid. Both exist in the OLD
      // catalog - that constraint is what rules out minting a new key, since an
      // un-updated bundle would render a fresh key as its own raw string. Of the
      // two that DO resolve there, "this invitation is no longer available" is
      // true; "check the information and try again" is not, and it sends a
      // parent who typed a CORRECT id and password into retrying forever.
      return errorResponse("link.err.unavailable", 400);
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
