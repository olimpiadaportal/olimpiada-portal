"use server";

// Parent self-service profile actions (Phase E2): change own password and set
// own avatar. Both authorize the current parent via requireParent() and act as
// the logged-in user through the SSR client (anon key + cookies), so RLS and
// Storage owner-write policies (storage.objects.owner = auth.uid()) apply.
//
// The avatar follows the AVATARS contract: upload the file to the PUBLIC
// 'profile-avatars' bucket via the user's own client → insert a media_assets
// metadata row → point profiles.avatar_media_id at it. No service-role key is
// used; the parent only ever touches their own rows.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireParent } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB (matches bucket limit)
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type ProfileActionState = { ok?: boolean; error?: string } | null;

// Change the logged-in parent's password. Validates min length 8 (matches the
// parent registration rule) before calling supabase.auth.updateUser.
export async function updateOwnPassword(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  await requireParent();
  const t = await getT();
  const password = String(formData.get("new_password") ?? "");
  if (password.length < 8) return { error: t("profile.err.passwordShort") };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: t("profile.err.updateFailed") };
  return { ok: true };
}

// Upload/replace the logged-in parent's avatar. Enforces image mime + ≤2MB,
// uploads to 'profile-avatars' as `${authUserId}/${Date.now()}.${ext}` (so the
// storage owner = auth.uid() satisfies the owner-write policy), records the
// metadata in media_assets, and links it on profiles.avatar_media_id.
export async function setOwnAvatar(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parent = await requireParent();
  const t = await getT();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: t("profile.err.uploadFailed") };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { error: t("profile.err.fileType") };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: t("profile.err.fileTooLarge") };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("profile.err.updateFailed") };

  const ext = EXT_BY_MIME[file.type] ?? "png";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: t("profile.err.uploadFailed") };

  // Record file metadata (PostgreSQL stores metadata only, never the binary).
  const { data: media, error: mediaError } = await supabase
    .from("media_assets")
    .insert({
      bucket: AVATAR_BUCKET,
      path,
      owner_profile_id: parent.profileId,
      mime_type: file.type,
      file_size_bytes: file.size,
      visibility: "public",
    })
    .select("id")
    .single();
  if (mediaError || !media) {
    // Best-effort cleanup of the orphaned object; ignore failures.
    await supabase.storage.from(AVATAR_BUCKET).remove([path]).catch(() => {});
    return { error: t("profile.err.updateFailed") };
  }

  const { error: linkError } = await supabase
    .from("profiles")
    .update({ avatar_media_id: media.id })
    .eq("id", parent.profileId);
  if (linkError) return { error: t("profile.err.updateFailed") };

  revalidatePath("/dashboard");
  return { ok: true };
}

// Detach the avatar (clears the link; leaves the historical media row/object).
export async function removeOwnAvatar(): Promise<ProfileActionState> {
  const parent = await requireParent();
  const t = await getT();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_media_id: null })
    .eq("id", parent.profileId);
  if (error) return { error: t("profile.err.updateFailed") };
  revalidatePath("/dashboard");
  return { ok: true };
}
