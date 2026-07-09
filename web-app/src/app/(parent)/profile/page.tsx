import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { ParentProfile } from "@/components/ParentProfile";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import { getNotificationPreferences } from "@/lib/notifications/prefsActions";
import { NOTIF_KEYS } from "@/lib/notifications/types";

// Dedicated full-width parent profile page (Round 5). Profile EDITING moved off
// the cramped 360px drawer onto this .profile-page: avatar upload/change/remove,
// change password, delete account, logout — all rendered by <ParentProfile/>.
// The localized profile.* strings the component needs are gathered server-side
// into a dict and passed straight through, exactly as the drawer used to do.
const PROFILE_KEYS = [
  "profile.title", "profile.account", "profile.logout", "profile.deleteAccount",
  "profile.changePassword", "profile.currentPassword", "profile.newPassword",
  "profile.save", "profile.saving", "profile.saved", "profile.cancel", "profile.passwordChanged",
  "profile.editName", "profile.fullName", "profile.firstNameLabel", "profile.lastNameLabel",
  "profile.err.nameRequired",
  "profile.avatar", "profile.uploadAvatar", "profile.changeAvatar",
  "profile.removeAvatar", "profile.avatarHint", "profile.noAvatar",
  "profile.err.passwordShort", "profile.err.passwordEqualsId",
  "profile.err.fileType", "profile.err.fileTooLarge", "profile.err.uploadFailed",
  "profile.err.updateFailed", "account.deleteConfirm", "profile.phoneLabel",
  "auth.showPassword", "auth.hidePassword",
  // Round 8 account-settings sections (prof2.*)
  "prof2.accountInfo", "prof2.name", "prof2.email",
  "prof2.security", "prof2.securityHint",
  "prof2.danger", "prof2.dangerHint",
  "prof2.session", "prof2.sessionHint",
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
  let phone: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "display_name, email, phone, avatar_media_id, media_assets:avatar_media_id(bucket, path)",
      )
      .eq("id", parent.profileId)
      .single();
    if (profile) {
      name = (profile as { display_name?: string }).display_name ?? "";
      email = (profile as { email?: string }).email ?? "";
      phone = (profile as { phone?: string | null }).phone ?? null;
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

  // Notification preferences section (gated by the `notifications` flag). Parent
  // manages their own channels + one row per child (prefs read via the
  // owner-checked RPC). Any failure degrades to hiding the section.
  const notifOn = await isFeatureEnabled("notifications");
  let notifBlock: React.ReactNode = null;
  if (notifOn) {
    try {
      const { data: childrenData } = await supabase
        .from("students")
        .select("profile_id, first_name, last_name")
        .eq("created_by_parent_profile_id", parent.profileId)
        .order("created_at", { ascending: true });
      const childRows = ((childrenData ?? []) as {
        profile_id: string;
        first_name: string | null;
        last_name: string | null;
      }[]).filter((k) => !!k.profile_id);

      const [selfPrefs, ...childPrefs] = await Promise.all([
        getNotificationPreferences(),
        ...childRows.map((k) => getNotificationPreferences(k.profile_id)),
      ]);

      const kids = childRows.map((k, i) => ({
        profileId: k.profile_id,
        name:
          `${k.first_name ?? ""} ${k.last_name ?? ""}`.trim() ||
          t("notif.prefs.children"),
        prefs: childPrefs[i],
      }));

      const notifDict: Record<string, string> = {};
      for (const k of NOTIF_KEYS) notifDict[k] = t(k);

      notifBlock = (
        <NotificationPreferences
          self={selfPrefs}
          selfLabel={name || email || t("profile.account")}
          kids={kids}
          strings={notifDict}
        />
      );
    } catch {
      notifBlock = null;
    }
  }

  return (
    <div className="profile-page">
      <h1 className="profile-page-title">{t("profile.title")}</h1>
      <ParentProfile
        name={name || email || t("profile.account")}
        displayName={name}
        email={email}
        phone={phone}
        initials={initialsOf(name, email)}
        avatarUrl={avatarUrl}
        dict={profileDict}
      />
      {notifBlock}
    </div>
  );
}
