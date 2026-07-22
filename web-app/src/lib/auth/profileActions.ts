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
import { removeAvatarCore, setAvatarCore } from "@/lib/auth/avatarCore";
import { updateOwnPhoneCore } from "@/lib/auth/phoneCore";
import { rateLimitAllow } from "@/lib/rateLimit";
import { getT } from "@/i18n/server";

export type ProfileActionState = { ok?: boolean; error?: string } | null;

const WINDOW_15_MIN = 15 * 60_000;

// Update the logged-in parent's display name (full name). Self-row update via
// the SSR client — the profiles_update RLS policy allows id = current_profile.
export async function updateOwnName(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parent = await requireParent();
  const t = await getT();
  const name = String(formData.get("display_name") ?? "").trim().slice(0, 120);
  if (!name) return { error: t("profile.err.nameRequired") };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", parent.profileId);
  if (error) return { error: t("profile.err.updateFailed") };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Add or change the logged-in parent's contact phone. Registration writes it
// best-effort, so accounts do exist with none — this is both the "add" and the
// "change" path. The E.164 rule, the single-column self-row write and the audit
// entry live in lib/auth/phoneCore (shared with the mobile BFF); this action is
// the cookie-session wrapper acting through the SSR client.
export async function updateOwnPhone(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parent = await requireParent();
  const t = await getT();
  // Throttle per profile like the other self-service mutations — the phone is
  // an account contact channel, not a free-text field.
  if (!rateLimitAllow("phoneupdate", parent.profileId, 5, WINDOW_15_MIN)) {
    return { error: t("parent.err.tooMany") };
  }

  const supabase = await createClient();
  const res = await updateOwnPhoneCore(
    supabase,
    parent.profileId,
    String(formData.get("phone") ?? ""),
  );
  if (!res.ok) return { error: t(res.errorKey) };
  return { ok: true };
}

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

// Upload/replace the logged-in parent's avatar. Stage M2: mime/size/byte-sniff
// enforcement, the owner-scoped Storage upload, the media_assets metadata row
// and the profiles.avatar_media_id link live in lib/auth/avatarCore.setAvatarCore
// (shared with the mobile BFF); this action stays the cookie-session wrapper
// acting through the SSR client so RLS/owner-write semantics are unchanged.
export async function setOwnAvatar(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parent = await requireParent();
  const t = await getT();

  const supabase = await createClient();
  const res = await setAvatarCore(supabase, {
    profileId: parent.profileId,
    file: formData.get("avatar"),
    // Resolved exactly where the historical action called auth.getUser()
    // (after the file checks) — the check order is unchanged.
    resolveAuthUserId: async () =>
      (await supabase.auth.getUser()).data.user?.id ?? null,
  });
  if (!res.ok) return { error: t(res.errorKey) };
  return { ok: true };
}

// Detach the avatar (clears the link; leaves the historical media row/object).
export async function removeOwnAvatar(): Promise<ProfileActionState> {
  const parent = await requireParent();
  const t = await getT();
  const supabase = await createClient();
  const res = await removeAvatarCore(supabase, parent.profileId);
  if (!res.ok) return { error: t(res.errorKey) };
  return { ok: true };
}
