// Mobile BFF — parent sets/replaces/removes a CHILD'S avatar (parent-managed;
// token twin of the web saveChildAvatar action). Same cores
// (lib/auth/childAvatarCore): ownership re-verified server-side, photo bytes
// sniffed (png/jpeg/webp, ≤2MB), the upload runs on the BEARER client (the
// parent's own token — private `child-avatars` bucket RLS applies), the
// students-row write is service-role AFTER authorization.
//
// Three request shapes on one endpoint:
//   multipart/form-data with `file`   → photo avatar
//   JSON {"preset":"boy"|"girl"}      → preset avatar
//   JSON {"remove":true}              → back to the default initials bubble
// Success: {ok:true, data:{avatar_kind, avatar_key, has_photo}}. Errors are
// i18n KEYS (the app translates locally).
import {
  createBearerClient,
  extractBearerToken,
  resolveBearerParent,
} from "@/lib/auth/mobileBearer";
import {
  removeChildAvatarCore,
  setChildAvatarPhotoCore,
  setChildAvatarPresetCore,
  type ChildAvatarCoreResult,
} from "@/lib/auth/childAvatarCore";
import { MAX_CHILD_AVATAR_BYTES } from "@/lib/childAvatar";
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

// Multipart framing overhead on top of the 2MB file cap.
const MULTIPART_MAX_BYTES = MAX_CHILD_AVATAR_BYTES + 64 * 1024;

// Web parity for cache revalidation (the same routes the web action refreshes).
const REVALIDATE = ["/dashboard", "/subscription", "/child", "/child/profile"];

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    // Authorize FIRST — parent only (children never manage avatars here).
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    const { id: studentId } = await ctx.params;
    if (!isUuid(studentId)) return errorResponse("childedit.err.generic", 400);

    // resolveBearerParent verified this token, so it is present here.
    const client = createBearerClient(extractBearerToken(request) ?? "");
    const base = {
      parentProfileId: parent.profileId,
      studentProfileId: studentId,
      revalidate: REVALIDATE,
    };

    const contentType = request.headers.get("content-type") ?? "";
    let res: ChildAvatarCoreResult;

    if (contentType.toLowerCase().includes("multipart/form-data")) {
      // Photo branch. Early size wall from the declared length (the core
      // re-enforces the 2MB cap from the actual bytes either way).
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (Number.isFinite(declared) && declared > MULTIPART_MAX_BYTES) {
        return errorResponse("profile.err.fileTooLarge", 400);
      }
      // Malformed multipart must be a 400, never a 500.
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return errorResponse("profile.err.uploadFailed", 400);
      }
      res = await setChildAvatarPhotoCore(client, {
        ...base,
        file: form.get("file"),
      });
    } else {
      const body = await readJsonBody(request);
      if (body.remove === true) {
        res = await removeChildAvatarCore(client, base);
      } else if (typeof body.preset === "string") {
        // Enum whitelist happens inside the core.
        res = await setChildAvatarPresetCore(client, {
          ...base,
          preset: body.preset,
        });
      } else {
        return errorResponse("childedit.err.generic", 400);
      }
    }

    if (!res.ok) return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    return okResponse({
      avatar_kind: res.state.avatar_kind,
      avatar_key: res.state.avatar_key,
      has_photo: res.state.has_photo,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("profile.err.updateFailed", 500, true);
  }
}
