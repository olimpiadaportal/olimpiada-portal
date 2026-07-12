// Mobile BFF — self-serve parent account deletion (Stage M2, danger zone).
//
// Token twin of the web deleteParentAccount action: the SAME core
// (parentCore.deleteParentAccountCore) — deletes the parent's children (auth
// users → cascade students/credentials/links) and then the parent auth user
// (cascades profile/parents/links). Irreversible, so the body MUST carry an
// explicit {"confirm":true} — a bare POST never deletes anything. There is no
// cookie session to sign out; the Bearer token simply stops verifying once
// the auth user is gone (the app drops its stored tokens on success).
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { deleteParentAccountCore } from "@/lib/auth/parentCore";
import {
  errorResponse,
  okResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before reading the body.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    const body = await readJsonBody(request);
    if (body.confirm !== true) {
      return errorResponse("parent.err.required", 400);
    }

    await deleteParentAccountCore({
      parentProfileId: parent.profileId,
      authUserId: parent.authUserId,
    });
    return okResponse({ deleted: true });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("profile.err.updateFailed", 500, true);
  }
}
