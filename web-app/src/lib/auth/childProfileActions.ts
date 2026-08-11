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
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolvePaletteChoice } from "@/lib/theme/palettes";
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

// Set (or clear) the logged-in child's own light-mode palette. Self-row update via
// the SSR client — students_write RLS allows profile_id = current_profile; only the
// palette/theme_pref columns are written, and only a whitelisted slug (or NULL)
// ever reaches the palette column. The whitelist is the shared catalogue
// (lib/theme/palettes.ts), which is also what generates the CSS and what the
// students_palette_chk CHECK is asserted against — one whitelist, not three.
export async function selectPalette(
  _prev: ChildProfileState,
  formData: FormData,
): Promise<ChildProfileState> {
  const child = await requireChild(); // authorize FIRST
  const t = await getT();
  // "" / unknown -> default; a real slug additionally turns Dark Mode off (the
  // rule lives in the catalogue module so it is unit-testable).
  const { palette, themePref } = resolvePaletteChoice(formData.get("palette"));

  const patch: { palette: string | null; theme_pref?: "light" } = { palette };
  if (themePref) patch.theme_pref = themePref;

  const supabase = await createClient();
  // .select() is REQUIRED, not decoration: PostgREST returns no error when an
  // UPDATE matches zero rows (RLS denial, missing students row), so without it
  // the action reported ok, the optimistic flip in PalettePicker was never
  // rolled back, and the choice quietly vanished on the next refresh — the very
  // "persistence looks fine but isn't" failure this feature exists to fix.
  const { data: saved, error } = await supabase
    .from("students")
    .update(patch)
    .eq("profile_id", child.profileId)
    .select("profile_id");
  if (error || !saved || saved.length === 0) {
    return { error: t("profile.err.updateFailed") };
  }

  // Keep the server-rendered <html data-theme> in step with the column on the
  // very next render. httpOnly:false is deliberate and required — the boot
  // migration script reads it — and it carries no secret.
  if (palette !== null) await writeThemeCookie("light");

  revalidatePath("/child");
  revalidatePath("/child/profile");
  return { ok: true };
}

// Persist the logged-in child's own dark/light choice. Deliberately does NOT
// touch `palette`: two independent columns are what make "dark may override the
// palette but must never erase it" structural rather than something a restore
// path has to get right.
export async function setChildThemePref(
  theme: string,
): Promise<ChildProfileState> {
  const child = await requireChild(); // authorize FIRST
  const t = await getT();
  // Explicit enum whitelist — the client string never reaches the column.
  const next = theme === "light" ? "light" : theme === "dark" ? "dark" : null;
  if (!next) return { error: t("profile.err.updateFailed") };

  const supabase = await createClient();
  // Zero matched rows is not an error in PostgREST — see selectPalette above.
  const { data: saved, error } = await supabase
    .from("students")
    .update({ theme_pref: next })
    .eq("profile_id", child.profileId)
    .select("profile_id");
  if (error || !saved || saved.length === 0) {
    return { error: t("profile.err.updateFailed") };
  }

  // No revalidatePath here on purpose: nothing rendered reads theme_pref (the
  // root layout paints <html data-theme> from the cookie, which is already
  // updated), so refreshing would re-run every child query on each toggle click
  // for no visible change.
  await writeThemeCookie(next);
  return { ok: true };
}

// The SSR transport for the theme (see app/layout.tsx): a readable, secret-free
// cookie the root layout turns into <html data-theme>.
async function writeThemeCookie(value: "light" | "dark") {
  (await cookies()).set("theme", value, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
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
