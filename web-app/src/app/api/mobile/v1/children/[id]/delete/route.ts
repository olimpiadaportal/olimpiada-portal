// Mobile BFF — parent deletes ONE of their children (Stage M2, danger zone).
//
// Token twin of the web deleteChild server action: both delegate to the SAME
// audited core (parentCore.deleteChildCore) — ownership re-verified server-side
// (the parent must have CREATED this child), the child's auth user deleted and
// then RE-READ to prove it is gone, the student/credentials/link rows cascading
// behind it. Server actions are unreachable from React Native, which is the only
// reason this endpoint exists; the BEHAVIOUR is the web's, not a second one.
//
// POST, not DELETE. Every mutating endpoint on this BFF is a POST — the shared
// envelope (lib/mobile/http) documents itself as "POST-only JSON", the app's
// only authenticated writer is `bffAuthedPost`, and the parent-account twin at
// /account/delete is a POST as well. An HTTP DELETE here would be the one verb
// the client cannot speak, for no gain: the action is named by the PATH.
//
// Irreversible, so the body MUST carry an explicit {"confirm":true} — a bare
// POST never deletes anything. Same flag, same key and same helper as the
// parent-account twin at /account/delete: the path says WHICH child, the flag
// says the caller meant it. The sibling /reset-password endpoint deliberately
// carries no such flag, and the difference is not style: a password reset is
// RECOVERABLE — set another one — while this destroys the auth user, the
// student row, the credentials and the answer history behind them, with
// nothing to reset it back from. The app's confirm sheet is presentation only;
// this flag is what a mis-routed, retried or hand-made POST cannot supply by
// accident.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { deleteChildCore } from "@/lib/auth/parentCore";
import { childOwnershipCore } from "@/lib/auth/subscriptionCore";
import { isUuid } from "@/lib/uuid";
import {
  errorResponse,
  okResponse,
  readJsonBody,
  statusForErrorKey,
  unauthorizedResponse,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    // Authorize FIRST — before the body, before params, before anything else
    // is read.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    const { id: studentProfileId } = await ctx.params;
    if (!isUuid(studentProfileId)) {
      // NOT `childNotFound`, which the app reads as "already deleted, count it
      // as done" (see the retry path below). A malformed id proves the opposite:
      // nothing was found because nothing was ASKED FOR, and a client bug that
      // sent an empty id would otherwise show a success toast and drop the card
      // for a child still sitting in the database. The key is the same generic
      // one the client falls back to when the call never arrives, so an already
      // shipped binary renders it too.
      return errorResponse("mob.child.delete.failed", 400);
    }

    // The confirm flag is demanded BEFORE the ownership read, so an unconfirmed
    // POST touches no database at all — and, more to the point, deletes nothing.
    // Its key is shared with the parent-account twin at /account/delete and says
    // what actually happened: the previous one was the LOGIN form's "enter your
    // email and password", which is what a delete sheet must never render.
    const body = await readJsonBody(request);
    if (body.confirm !== true) {
      return errorResponse("mob.err.confirmRequired", 400);
    }

    // The id is client-supplied, so THIS parent's authorship of THIS child is
    // re-verified before a destructive call is even reached. The core checks it
    // again and RLS a third time; nothing here trusts the previous layer, and
    // on a destructive path the cheap read is worth having in front of it.
    //
    // GONE and NOT YOURS are different answers, and a boolean gate could only
    // give the second. That is the retry: a child with a long history takes
    // longer to delete than the client waits, the cascade completes anyway, and
    // the parent — told it failed — presses Delete again. The row is gone by
    // then, so the ownership check cannot pass, and "this child is not yours"
    // was the app's reward for a deletion that had worked. `childNotFound` is
    // the answer the client's already-deleted path is waiting for; the 403 stays
    // a real refusal, for the linked-but-not-creating parent it was written for.
    const ownership = await childOwnershipCore(parent.profileId, studentProfileId);
    if (ownership === "absent") {
      return errorResponse("auth.child.err.childNotFound", 400);
    }
    if (ownership !== "owned") {
      return errorResponse("auth.child.err.notYourChild", 403);
    }

    const result = await deleteChildCore({
      parentProfileId: parent.profileId,
      studentProfileId,
    });
    if (!result.ok) {
      // A deletion that could not be COMPLETED is a server fault, and worth
      // retrying; a refusal ("not yours", "no such child") is neither, and
      // takes the shared key→status mapping like every other endpoint.
      const failed = result.errorKey === "auth.child.err.serverError";
      return errorResponse(
        result.errorKey,
        failed ? 500 : statusForErrorKey(result.errorKey),
        failed,
      );
    }
    return okResponse({ deleted: true });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("auth.child.err.serverError", 500, true);
  }
}
