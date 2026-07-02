import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { ParentProfile } from "@/components/ParentProfile";

// Dedicated full-width parent profile page (Round 5). Profile EDITING moved off
// the cramped 360px drawer onto this .profile-page: avatar upload/change/remove,
// change password, delete account, logout — all rendered by <ParentProfile/>.
// The localized profile.* strings the component needs are gathered server-side
// into a dict and passed straight through, exactly as the drawer used to do.
const PROFILE_KEYS = [
  "profile.title", "profile.account", "profile.logout", "profile.deleteAccount",
  "profile.changePassword", "profile.currentPassword", "profile.newPassword",
  "profile.save", "profile.saved", "profile.cancel", "profile.passwordChanged",
  "profile.avatar", "profile.uploadAvatar", "profile.changeAvatar",
  "profile.removeAvatar", "profile.avatarHint", "profile.noAvatar",
  "profile.err.passwordShort", "profile.err.passwordEqualsId",
  "profile.err.fileType", "profile.err.fileTooLarge", "profile.err.uploadFailed",
  "profile.err.updateFailed", "account.deleteConfirm",
  "auth.showPassword", "auth.hidePassword",
];

function initialsOf(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
}

export default async function ParentProfilePage() {
  const parent = await requireParent();
  const t = await getT();
  const supabase = await createClient();

  // Parent profile display data. Degrade gracefully on any failure so the page
  // still renders with an initials mark.
  let name = "";
  let email = "";
  let avatarUrl: string | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "display_name, email, avatar_media_id, media_assets:avatar_media_id(bucket, path)",
      )
      .eq("id", parent.profileId)
      .single();
    if (profile) {
      name = (profile as { display_name?: string }).display_name ?? "";
      email = (profile as { email?: string }).email ?? "";
      const m = (profile as { media_assets?: { bucket?: string; path?: string } }).media_assets;
      if (m?.bucket && m?.path) {
        avatarUrl = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
      }
    }
  } catch {
    // keep defaults
  }

  const profileDict: Record<string, string> = {};
  for (const k of PROFILE_KEYS) profileDict[k] = t(k);

  return (
    <div className="profile-page">
      <h1 className="profile-page-title">{t("profile.title")}</h1>
      <ParentProfile
        name={name || email || t("profile.account")}
        email={email}
        initials={initialsOf(name, email)}
        avatarUrl={avatarUrl}
        dict={profileDict}
      />
    </div>
  );
}
