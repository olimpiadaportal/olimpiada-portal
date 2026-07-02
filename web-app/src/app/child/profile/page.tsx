import Link from "next/link";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { WallpaperPicker } from "@/components/WallpaperPicker";
import { ChildProfile } from "@/components/ChildProfile";

// Student profile page (Round 5 P2) — the child equivalent of the parent
// /profile page. Full-width .profile-page rendering the student's own profile
// editor: avatar + change-password (<ChildProfile/>) and the wallpaper picker.
// A child can never delete their account (no delete control is exposed). The
// server fetch mirrors the former inline panel that lived on /child.
export default async function ChildProfilePage() {
  const child = await requireChild();
  const t = await getT();
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("first_name, last_name, child_unique_id")
    .eq("profile_id", child.profileId)
    .maybeSingle();
  const childFirst = (student as any)?.first_name ?? "";
  const childLast = (student as any)?.last_name ?? "";
  const childName = `${childFirst} ${childLast}`.trim();
  const childId = (student as any)?.child_unique_id ?? "";
  const childInitial = (childFirst.trim()[0] ?? childName.trim()[0] ?? "?").toUpperCase();

  // Avatar public URL (degrades to initials when none / on any read failure).
  let avatarUrl: string | null = null;
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("avatar_media_id, media_assets:avatar_media_id(bucket, path)")
      .eq("id", child.profileId)
      .maybeSingle();
    const m = (prof as any)?.media_assets;
    if (m?.bucket && m?.path) {
      avatarUrl = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
    }
  } catch {
    avatarUrl = null;
  }

  // Translated strings handed to the client profile component (no client i18n).
  const profileDict: Record<string, string> = {};
  for (const k of [
    "profile.account",
    "profile.changePassword",
    "profile.newPassword",
    "profile.save",
    "profile.cancel",
    "profile.passwordChanged",
    "profile.avatar",
    "profile.uploadAvatar",
    "profile.changeAvatar",
    "profile.removeAvatar",
    "profile.avatarHint",
    "profile.err.passwordShort",
    "profile.err.passwordEqualsId",
    "profile.err.fileType",
    "profile.err.fileTooLarge",
    "profile.err.uploadFailed",
    "profile.err.updateFailed",
    "child.id",
    "auth.showPassword",
    "auth.hidePassword",
  ]) {
    profileDict[k] = t(k);
  }

  const { data: wallpapers } = await supabase
    .from("wallpapers")
    .select("id, name, kind, value, media_asset_id, media_assets:media_asset_id(bucket, path)")
    .eq("status", "active")
    .order("name");
  // Resolve a public URL for image-kind wallpapers (solid colors keep value).
  const wallpaperList = ((wallpapers ?? []) as any[]).map((w) => {
    let imageUrl: string | null = null;
    const m = w.media_assets;
    if (w.kind === "image" && m?.bucket && m?.path) {
      imageUrl = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
    }
    return { id: w.id, name: w.name, kind: w.kind, value: w.value, imageUrl };
  });
  const { data: sel } = await supabase
    .from("child_wallpaper_selections")
    .select("wallpaper_id")
    .eq("student_profile_id", child.profileId)
    .maybeSingle();
  const currentId = (sel as any)?.wallpaper_id ?? null;

  return (
    <div className="profile-page">
      <h1 className="arena-section-h" style={{ marginTop: 0 }}>
        {t("profile.title")}
      </h1>

      <div className="arena-panel">
        <ChildProfile
          name={childName}
          uniqueId={childId}
          initial={childInitial}
          avatarUrl={avatarUrl}
          dict={profileDict}
        />
      </div>

      <h3 className="arena-section-h" style={{ marginTop: 26 }}>
        {t("arena.settings")}
      </h3>
      <div className="arena-panel">
        <p className="arena-muted" style={{ margin: "0 0 12px" }}>
          {t("child.wallpaperNote")}
        </p>
        <WallpaperPicker
          wallpapers={wallpaperList}
          currentId={currentId}
          defaultLabel={t("child.wallpaperDefault")}
        />
        <p style={{ marginTop: 16, marginBottom: 0 }}>
          <Link className="arena-btn-ghost arena-btn-sm" href="/child/olympiads">
            {t("child.myOlympiads")}
          </Link>
        </p>
      </div>
    </div>
  );
}
