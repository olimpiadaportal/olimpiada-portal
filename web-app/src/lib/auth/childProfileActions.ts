"use server";

// Child-app self-service profile actions (Round 3, Phase E3): the logged-in
// CHILD changes their own password and uploads/changes their own avatar. Both
// run under the child's own authenticated Supabase client, so RLS is the real
// gate (profiles_update self-row, media_assets owner-write, profile-avatars
// owner-write). A child can never delete their own account — no such action
// exists here.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireChild } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { sniffImageMime, EXT_BY_SNIFFED } from "@/lib/imageSniff";

export type ChildProfileState = { ok?: boolean; error?: string } | null;

// Update the logged-in child's own first/last name. Self-row update via the SSR
// client — the students_write RLS policy allows profile_id = current_profile.
// Only the name columns are written (never access/subscription fields).
export async function childUpdateOwnName(
  _prev: ChildProfileState,
  formData: FormData,
): Promise<ChildProfileState> {
  const t = await getT();
  const child = await requireChild();
  const first = String(formData.get("first_name") ?? "").trim().slice(0, 80);
  const last = String(formData.get("last_name") ?? "").trim().slice(0, 80);
  if (!first || !last) return { error: t("profile.err.nameRequired") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ first_name: first, last_name: last })
    .eq("profile_id", child.profileId);
  if (error) return { error: t("profile.err.updateFailed") };

  revalidatePath("/child");
  revalidatePath("/child/profile");
  return { ok: true };
}

// Avatar upload constraints (mirror the 'profile-avatars' bucket: 2 MB, images).
// The declared type is only a cheap early reject — the authoritative type comes
// from byte sniffing (imageSniff) in the action itself.
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

// Change the logged-in child's own login password. Enforces min length 8 and
// that the password is not equal to the child's 8-digit login ID (a trivial,
// guessable value). Uses supabase.auth.updateUser for the CHILD's own session.
export async function childChangeOwnPassword(
  _prev: ChildProfileState,
  formData: FormData,
): Promise<ChildProfileState> {
  const t = await getT();
  const child = await requireChild();
  const newPassword = String(formData.get("new_password") ?? "");

  if (newPassword.length < 8) {
    return { error: t("profile.err.passwordShort") };
  }

  const supabase = await createClient();

  // Reject password == the child's own 8-digit login ID.
  const { data: student } = await supabase
    .from("students")
    .select("child_unique_id")
    .eq("profile_id", child.profileId)
    .maybeSingle();
  const uniqueId = (student as { child_unique_id?: string | null } | null)
    ?.child_unique_id;
  if (uniqueId && newPassword === uniqueId) {
    return { error: t("profile.err.passwordEqualsId") };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { error: t("profile.err.updateFailed") };
  }
  return { ok: true };
}

// Upload (or replace) the logged-in child's own avatar. Uploads to the public
// 'profile-avatars' bucket under `${authUserId}/...` (so storage.objects.owner
// is auto-set to the child's auth.uid()), records a media_assets row, and links
// profiles.avatar_media_id. Image mime only, ≤2 MB.
export async function setChildOwnAvatar(
  _prev: ChildProfileState,
  formData: FormData,
): Promise<ChildProfileState> {
  const t = await getT();
  const child = await requireChild();
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    return { error: t("profile.err.uploadFailed") };
  }
  if (!ALLOWED_AVATAR_MIME.has(file.type)) {
    return { error: t("profile.err.fileType") };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: t("profile.err.fileTooLarge") };
  }
  // R7 security: type the upload from its BYTES (magic numbers), never from the
  // attacker-controlled file.type (mirrors the parent avatar action).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) return { error: t("profile.err.fileType") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: t("profile.err.uploadFailed") };
  }

  const ext = EXT_BY_SNIFFED[sniffed];
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("profile-avatars")
    .upload(path, bytes, { contentType: sniffed, upsert: false });
  if (uploadErr) {
    return { error: t("profile.err.uploadFailed") };
  }

  const { data: media, error: mediaErr } = await supabase
    .from("media_assets")
    .insert({
      bucket: "profile-avatars",
      path,
      owner_profile_id: child.profileId,
      mime_type: sniffed,
      file_size_bytes: bytes.byteLength,
      visibility: "public",
    })
    .select("id")
    .single();
  if (mediaErr || !media) {
    return { error: t("profile.err.uploadFailed") };
  }

  const { error: linkErr } = await supabase
    .from("profiles")
    .update({ avatar_media_id: (media as { id: string }).id })
    .eq("id", child.profileId);
  if (linkErr) {
    return { error: t("profile.err.updateFailed") };
  }

  revalidatePath("/child");
  return { ok: true };
}

// Remove the logged-in child's own avatar (unlink only; keeps the media_assets
// row and storage object harmlessly — public read, owned by the child).
export async function removeChildOwnAvatar(
  _prev: ChildProfileState,
  _formData: FormData,
): Promise<ChildProfileState> {
  const t = await getT();
  const child = await requireChild();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_media_id: null })
    .eq("id", child.profileId);
  if (error) {
    return { error: t("profile.err.updateFailed") };
  }
  revalidatePath("/child");
  return { ok: true };
}
