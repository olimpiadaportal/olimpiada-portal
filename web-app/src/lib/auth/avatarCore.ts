// SERVER-ONLY avatar CORES (Stage M2) — the client-agnostic hearts of
// setOwnAvatar / removeOwnAvatar (lib/auth/profileActions), shared by the web
// actions (SSR cookie client) and the mobile BFF avatar endpoint (bearer
// client). The Supabase client is INJECTED so both surfaces act AS the user:
// the Storage owner-write policy (storage.objects.owner = auth.uid()) and the
// media_assets/profiles RLS apply identically — no service-role key anywhere
// in this flow. Stage M3: the BFF also runs this core for STUDENT bearers —
// the child web actions (setChildOwnAvatar / removeChildOwnAvatar) follow the
// exact same bucket/path/media_assets/unlink contract; the optional
// `revalidate` paths let each caller refresh its own web routes (parent
// "/dashboard" by default, student "/child").
//
// AVATARS contract: upload to the PUBLIC 'profile-avatars' bucket as
// `${authUserId}/${Date.now()}.${ext}` → insert a media_assets metadata row
// (PostgreSQL stores metadata only, never the binary) → point
// profiles.avatar_media_id at it. R7 security: the upload is typed from its
// BYTES (magic numbers), never from the attacker-controlled file.type.
// Errors are i18n KEYS, never localized text.
import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sniffImageMime, EXT_BY_SNIFFED } from "@/lib/imageSniff";

export const AVATAR_BUCKET = "profile-avatars";
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB (matches bucket limit)
// Cheap early reject only — the authoritative type comes from byte sniffing.
export const ALLOWED_AVATAR_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export type AvatarCoreResult =
  | { ok: true; path: string; mediaId: string }
  | {
      ok: false;
      errorKey:
        | "profile.err.uploadFailed"
        | "profile.err.fileType"
        | "profile.err.fileTooLarge"
        | "profile.err.updateFailed";
    };

/**
 * Upload/replace the user's avatar. `resolveAuthUserId` is invoked exactly
 * where the historical action called supabase.auth.getUser() (AFTER the file
 * checks) so the check order — and therefore which error a bad request sees —
 * is unchanged on the web; the BFF passes the already-resolved id.
 */
export async function setAvatarCore(
  client: SupabaseClient,
  params: {
    profileId: string;
    file: unknown;
    resolveAuthUserId: () => Promise<string | null>;
    /** Web routes to revalidate on success (default: the parent dashboard). */
    revalidate?: string[];
  },
): Promise<AvatarCoreResult> {
  const { profileId, file } = params;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errorKey: "profile.err.uploadFailed" };
  }
  if (!ALLOWED_AVATAR_MIME.has(file.type)) {
    return { ok: false, errorKey: "profile.err.fileType" };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, errorKey: "profile.err.fileTooLarge" };
  }
  // R7 security: type the upload from its BYTES (magic numbers), never from the
  // attacker-controlled file.type. The sniffed mime drives contentType + ext +
  // the media_assets row.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) return { ok: false, errorKey: "profile.err.fileType" };

  const authUserId = await params.resolveAuthUserId();
  if (!authUserId) return { ok: false, errorKey: "profile.err.updateFailed" };

  const ext = EXT_BY_SNIFFED[sniffed];
  const path = `${authUserId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: sniffed, upsert: false });
  if (uploadError) return { ok: false, errorKey: "profile.err.uploadFailed" };

  // Record file metadata (PostgreSQL stores metadata only, never the binary).
  const { data: media, error: mediaError } = await client
    .from("media_assets")
    .insert({
      bucket: AVATAR_BUCKET,
      path,
      owner_profile_id: profileId,
      mime_type: sniffed,
      file_size_bytes: bytes.byteLength,
      visibility: "public",
    })
    .select("id")
    .single();
  if (mediaError || !media) {
    // Best-effort cleanup of the orphaned object; ignore failures.
    await client.storage.from(AVATAR_BUCKET).remove([path]).catch(() => {});
    return { ok: false, errorKey: "profile.err.updateFailed" };
  }

  const { error: linkError } = await client
    .from("profiles")
    .update({ avatar_media_id: media.id })
    .eq("id", profileId);
  if (linkError) return { ok: false, errorKey: "profile.err.updateFailed" };

  for (const route of params.revalidate ?? ["/dashboard"]) revalidatePath(route);
  return { ok: true, path, mediaId: media.id as string };
}

export type RemoveAvatarCoreResult =
  | { ok: true }
  | { ok: false; errorKey: "profile.err.updateFailed" };

/** Detach the avatar (clears the link; leaves the historical media row/object). */
export async function removeAvatarCore(
  client: SupabaseClient,
  profileId: string,
  revalidate: string[] = ["/dashboard"],
): Promise<RemoveAvatarCoreResult> {
  const { error } = await client
    .from("profiles")
    .update({ avatar_media_id: null })
    .eq("id", profileId);
  if (error) return { ok: false, errorKey: "profile.err.updateFailed" };
  for (const route of revalidate) revalidatePath(route);
  return { ok: true };
}
