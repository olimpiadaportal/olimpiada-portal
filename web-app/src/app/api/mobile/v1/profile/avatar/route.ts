// Mobile BFF — own-avatar upload / removal (Stage M2; students added M3).
//
// Token twin of the web "my own avatar" actions, for BOTH mobile roles — but
// the two roles do NOT share a storage model, and that split is the point:
//
//   PARENT  → avatarCore: the PUBLIC 'profile-avatars' bucket under
//             `${authUserId}/…`, a media_assets row, the
//             profiles.avatar_media_id link, removal = unlink. An adult
//             publishing their own picture is their own call; unchanged here.
//   STUDENT → the shared child-avatar cores (lib/auth/childAvatarCore), i.e.
//             the same model a parent-uploaded child photo has always had: the
//             PRIVATE 'child-avatars' bucket, students.avatar_media_path, NO
//             media_assets row, reads only through short-lived signed URLs the
//             viewer's own session creates, and removal that really DELETES the
//             object. Before 2026-07-30 a child's self-upload ran the parent
//             core, so a photograph of a minor was world-readable and could
//             never be withdrawn (removal only unlinked it).
//
// Both paths run on the BEARER client, so the user's own RLS is the gate and no
// service-role key touches the upload. R7 security: ≤2MB and the type comes
// from magic-byte sniffing (lib/imageSniff), never the client-declared mime.
//
// Two request shapes on one endpoint:
//   multipart/form-data with `file`  → set/replace the avatar
//   JSON {"remove":true}             → remove the avatar
// Parent success → {url} (its bucket is public, so a stable URL is fine).
// Student success → {avatar_kind, avatar_key, has_photo} — the same shape the
// parent-managed child endpoint returns. A student response NEVER carries a
// public URL; the app re-signs the private object with its own session.
import { createBearerClient, extractBearerToken, resolveBearerUser } from "@/lib/auth/mobileBearer";
import { AVATAR_BUCKET, MAX_AVATAR_BYTES, removeAvatarCore, setAvatarCore } from "@/lib/auth/avatarCore";
import {
  removeOwnChildAvatarCore,
  setOwnChildAvatarPhotoCore,
} from "@/lib/auth/childAvatarCore";
import {
  errorResponse,
  okResponse,
  readJsonBody,
  statusForErrorKey,
  unauthorizedResponse,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Multipart framing overhead on top of the 2MB file cap. Both buckets cap at
// 2MB, so one wall serves both roles.
const MULTIPART_MAX_BYTES = MAX_AVATAR_BYTES + 64 * 1024;

// Web parity for cache revalidation: a child's photo shows in the arena shell,
// on their own profile page AND on their linked parent's screens.
const STUDENT_REVALIDATE = ["/child", "/child/profile", "/dashboard", "/subscription"];

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before reading the body. Parent OR student.
    const user = await resolveBearerUser(request);
    if (!user) return unauthorizedResponse();

    const isStudent = user.role === "student";
    // Web parity for cache revalidation: the parent actions revalidate
    // /dashboard (the core default).
    const revalidate = isStudent ? STUDENT_REVALIDATE : undefined;

    const contentType = request.headers.get("content-type") ?? "";

    // JSON branch: {"remove":true} → removeOwnAvatar / removeChildOwnAvatar parity.
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      const body = await readJsonBody(request);
      if (body.remove !== true) {
        return errorResponse("profile.err.uploadFailed", 400);
      }
      // resolveBearerUser verified this token, so it is present here.
      const client = createBearerClient(extractBearerToken(request) ?? "");

      if (isStudent) {
        // The child's OWN profile id — no client-supplied id anywhere in this
        // request, so being this student IS the authorization.
        const res = await removeOwnChildAvatarCore(client, {
          studentProfileId: user.profileId,
          revalidate,
        });
        if (!res.ok) return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
        return okResponse({
          avatar_kind: res.state.avatar_kind,
          avatar_key: res.state.avatar_key,
          has_photo: res.state.has_photo,
          removed: true,
        });
      }

      const res = await removeAvatarCore(client, user.profileId, revalidate);
      if (!res.ok) return errorResponse(res.errorKey, 400);
      return okResponse({ removed: true });
    }

    // Multipart branch. Early size wall from the declared length (the cores
    // re-enforce the 2MB cap from the actual bytes either way).
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

    const client = createBearerClient(extractBearerToken(request) ?? "");

    if (isStudent) {
      const res = await setOwnChildAvatarPhotoCore(client, {
        studentProfileId: user.profileId,
        file: form.get("file"),
        revalidate,
      });
      if (!res.ok) return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
      // Deliberately NO url: the object is private and a public URL for it does
      // not exist. The app signs it with the viewer's own session.
      return okResponse({
        avatar_kind: res.state.avatar_kind,
        avatar_key: res.state.avatar_key,
        has_photo: res.state.has_photo,
      });
    }

    const res = await setAvatarCore(client, {
      profileId: user.profileId,
      file: form.get("file"),
      resolveAuthUserId: async () => user.authUserId,
      revalidate,
    });
    if (!res.ok) return errorResponse(res.errorKey, 400);

    // Parent only: public bucket → stable public URL for the app to render.
    const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(res.path);
    return okResponse({ url: data.publicUrl });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("profile.err.updateFailed", 500, true);
  }
}
