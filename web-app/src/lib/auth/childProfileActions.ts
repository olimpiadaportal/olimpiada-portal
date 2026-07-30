"use server";

// Child-app self-service profile actions (Round 3, Phase E3): the logged-in
// CHILD changes their own password and uploads/changes their own avatar. Both
// run under the child's own authenticated Supabase client, so RLS is the real
// gate (profiles_update self-row, students_write self-row, and — for the
// avatar — the PRIVATE `child-avatars` bucket's student-self branch). A child
// can never delete their own account — no such action exists here.
//
// Avatar privacy (2026-07-30): the child's own photo used to go to the PUBLIC
// `profile-avatars` bucket with media_assets.visibility='public', and "remove"
// only unlinked it — so a photograph of a minor stayed world-readable forever
// and could not be withdrawn. Both actions now run the SHARED child-avatar
// cores (lib/auth/childAvatarCore), i.e. exactly the model a parent-uploaded
// child photo has always used: private bucket, signed-URL reads restricted to
// the family, and a removal that really deletes the object. There is no longer
// a second child-avatar write path that can drift.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireChild } from "@/lib/auth/session";
import { updateChildOwnNameCore } from "@/lib/auth/childProfileCore";
import {
  removeOwnChildAvatarCore,
  setOwnChildAvatarPhotoCore,
} from "@/lib/auth/childAvatarCore";
import { getT } from "@/i18n/server";

export type ChildProfileState = { ok?: boolean; error?: string } | null;

// Update the logged-in child's own first/last name. Self-row update via the SSR
// client — the students_write RLS policy allows profile_id = current_profile.
// Only the name columns are written (never access/subscription fields).
// Stage M3: the trim/caps/required validation, the students update, the
// best-effort profiles.display_name sync and the /child revalidation live in
// lib/auth/childProfileCore.updateChildOwnNameCore (shared with the mobile
// BFF); this action stays the cookie-session wrapper acting through the SSR
// client so RLS semantics are unchanged.
export async function childUpdateOwnName(
  _prev: ChildProfileState,
  formData: FormData,
): Promise<ChildProfileState> {
  const child = await requireChild(); // authorize FIRST (before any FormData read)
  const t = await getT();
  const supabase = await createClient();
  const res = await updateChildOwnNameCore(
    supabase,
    child.profileId,
    String(formData.get("first_name") ?? ""),
    String(formData.get("last_name") ?? ""),
  );
  if (!res.ok) return { error: t(res.errorKey) };
  return { ok: true };
}

// The 5 child-friendly LIGHT-MODE palette slugs (must match the students.palette
// CHECK and the [data-theme="light"] .arena[data-palette] CSS in globals.css).
// "" / "default" clears the choice (NULL = default look).
const PALETTE_SLUGS = new Set(["sky", "bubblegum", "mint", "sunset", "rainbow"]);

// Set (or clear) the logged-in child's own light-mode palette. Self-row update via
// the SSR client — students_write RLS allows profile_id = current_profile; only the
// palette column is written, and only a whitelisted slug (or NULL) ever reaches it.
export async function selectPalette(
  _prev: ChildProfileState,
  formData: FormData,
): Promise<ChildProfileState> {
  const child = await requireChild(); // authorize FIRST
  const t = await getT();
  const raw = String(formData.get("palette") ?? "").trim();
  const palette = PALETTE_SLUGS.has(raw) ? raw : null; // "" / unknown -> default

  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ palette })
    .eq("profile_id", child.profileId);
  if (error) return { error: t("profile.err.updateFailed") };

  revalidatePath("/child");
  revalidatePath("/child/profile");
  return { ok: true };
}

// Web routes whose rendered avatar goes stale when the child's photo changes:
// the arena shell header (drawer trigger), the child's own profile page, and
// the parent surfaces that list children — a linked parent sees this photo too.
const AVATAR_REVALIDATE = [
  "/child",
  "/child/profile",
  "/dashboard",
  "/subscription",
];

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

// Upload (or replace) the logged-in child's own avatar. Runs the shared
// child-avatar core on the CHILD'S OWN session client: the object lands in the
// PRIVATE `child-avatars` bucket at `students/<own profile id>/<uuid>.<ext>`
// (storage RLS decides — no service role uploads anything), the students row
// records avatar_kind='photo' + avatar_media_path, and any replaced object is
// deleted. Nothing public is written: no `profile-avatars` object, no
// media_assets row, no profiles.avatar_media_id link. png/jpeg/webp, ≤2 MB,
// typed from the bytes.
export async function setChildOwnAvatar(
  _prev: ChildProfileState,
  formData: FormData,
): Promise<ChildProfileState> {
  const child = await requireChild(); // authorize FIRST (before any FormData read)
  const t = await getT();
  const supabase = await createClient();
  // The child's OWN profile id — never a client-supplied one, so there is no
  // id to re-verify: being this student IS the authorization.
  const res = await setOwnChildAvatarPhotoCore(supabase, {
    studentProfileId: child.profileId,
    file: formData.get("avatar"),
    revalidate: AVATAR_REVALIDATE,
  });
  if (!res.ok) return { error: t(res.errorKey) };
  return { ok: true };
}

// Remove the logged-in child's own avatar: back to the initials bubble AND the
// Storage object is actually deleted (best-effort — a failed delete is logged
// server-side and never fails this action). No more unlink-only retention.
export async function removeChildOwnAvatar(
  _prev: ChildProfileState,
  _formData: FormData,
): Promise<ChildProfileState> {
  const child = await requireChild(); // authorize FIRST
  const t = await getT();
  const supabase = await createClient();
  const res = await removeOwnChildAvatarCore(supabase, {
    studentProfileId: child.profileId,
    revalidate: AVATAR_REVALIDATE,
  });
  if (!res.ok) return { error: t(res.errorKey) };
  return { ok: true };
}
