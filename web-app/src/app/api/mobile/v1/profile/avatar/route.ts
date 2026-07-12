// Mobile BFF — own-avatar upload / removal (Stage M2; students added M3).
//
// Token twin of the web avatar actions for BOTH mobile roles: the parent
// setOwnAvatar / removeOwnAvatar AND the child setChildOwnAvatar /
// removeChildOwnAvatar follow the same contract, so ONE core (avatarCore)
// runs on the BEARER client for whichever role the token resolves to —
// Storage owner-write semantics (storage.objects.owner = auth.uid()), the
// public 'profile-avatars' bucket under `${authUserId}/…`, a media_assets
// metadata row and the profiles.avatar_media_id link, removal = unlink only
// (old objects/rows are kept, exactly like both web actions), all under the
// user's OWN RLS (no service role anywhere in this flow). R7 security: ≤2MB
// and the type comes from magic-byte sniffing (lib/imageSniff), never the
// client-declared mime. The role only decides which web routes get
// revalidated (parent /dashboard — the core default — vs student /child).
//
// Two request shapes on one endpoint:
//   multipart/form-data with `file`  → set/replace the avatar → {url}
//   JSON {"remove":true}             → detach the avatar
import { createBearerClient, extractBearerToken, resolveBearerUser } from "@/lib/auth/mobileBearer";
import { AVATAR_BUCKET, MAX_AVATAR_BYTES, removeAvatarCore, setAvatarCore } from "@/lib/auth/avatarCore";
import {
  errorResponse,
  okResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Multipart framing overhead on top of the 2MB file cap.
const MULTIPART_MAX_BYTES = MAX_AVATAR_BYTES + 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before reading the body. Parent OR student.
    const user = await resolveBearerUser(request);
    if (!user) return unauthorizedResponse();

    // Web parity for cache revalidation: the child actions revalidate /child;
    // the parent actions revalidate /dashboard (the core default).
    const revalidate = user.role === "student" ? ["/child"] : undefined;

    const contentType = request.headers.get("content-type") ?? "";

    // JSON branch: {"remove":true} → removeOwnAvatar / removeChildOwnAvatar parity.
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      const body = await readJsonBody(request);
      if (body.remove !== true) {
        return errorResponse("profile.err.uploadFailed", 400);
      }
      // resolveBearerUser verified this token, so it is present here.
      const client = createBearerClient(extractBearerToken(request) ?? "");
      const res = await removeAvatarCore(client, user.profileId, revalidate);
      if (!res.ok) return errorResponse(res.errorKey, 400);
      return okResponse({ removed: true });
    }

    // Multipart branch. Early size wall from the declared length (the core
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

    const client = createBearerClient(extractBearerToken(request) ?? "");
    const res = await setAvatarCore(client, {
      profileId: user.profileId,
      file: form.get("file"),
      resolveAuthUserId: async () => user.authUserId,
      revalidate,
    });
    if (!res.ok) return errorResponse(res.errorKey, 400);

    // Public bucket → stable public URL for the app to render immediately.
    const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(res.path);
    return okResponse({ url: data.publicUrl });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("profile.err.updateFailed", 500, true);
  }
}
