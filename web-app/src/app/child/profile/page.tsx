import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { StickerThemePicker, type StickerThemeCard } from "@/components/StickerThemePicker";
import { PalettePicker } from "@/components/PalettePicker";
import { ChildProfile } from "@/components/ChildProfile";

// Student profile page — Round 8 redesign. Same account-settings design
// language as the parent /profile page but student-only: identity header
// (avatar + name + 8-digit ID) and Security (change password) rendered by
// <ChildProfile/>, plus the R11 "character stickers" theme gallery
// (StickerThemePicker — replaces the old background-templates wallpapers).
// A child can never delete their account and has no email — neither is shown.
export default async function ChildProfilePage() {
  const child = await requireChild();
  const t = await getT();
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select(
      "first_name, last_name, child_unique_id, palette, city, school_name, class_grade, " +
        "grade:grade_id(name, level), district:district_id(name), school:school_id(name)",
    )
    .eq("profile_id", child.profileId)
    .maybeSingle();
  const currentPalette = ((student as any)?.palette ?? null) as
    | "sky" | "bubblegum" | "mint" | "sunset" | "rainbow" | null;
  const childFirst = (student as any)?.first_name ?? "";
  const childLast = (student as any)?.last_name ?? "";
  const childName = `${childFirst} ${childLast}`.trim();
  const childId = (student as any)?.child_unique_id ?? "";
  const childInitial = (childFirst.trim()[0] ?? childName.trim()[0] ?? "?").toUpperCase();

  // Read-only school details (structured catalog names, with the free-text
  // columns as fallback). The child SEES these but can never edit them — only a
  // parent can (parent /children/[id]/edit). "—" when nothing is on record.
  const s = (student as any) ?? {};
  const gradeInfo = s.grade
    ? `${s.grade.level} — ${s.grade.name}`
    : (s.class_grade ?? "").trim() || "—";
  const cityInfo = (s.district?.name ?? s.city ?? "").trim() || "—";
  const schoolInfo = (s.school?.name ?? s.school_name ?? "").trim() || "—";

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
    // Round 8 account-settings sections (prof2.*)
    "prof2.security",
    "prof2.securityHint",
    "prof2.idHint",
    "prof2.accountInfo",
    "prof2.name",
    // R11 fix — editable name
    "profile.saving",
    "profile.editName",
    "profile.fullName",
    "profile.firstNameLabel",
    "profile.lastNameLabel",
    "profile.err.nameRequired",
  ]) {
    profileDict[k] = t(k);
  }

  // R11 — Character-sticker themes. RLS already limits authenticated children
  // to ENABLED themes; the explicit filter just keeps intent obvious.
  const { data: themeRows } = await supabase
    .from("sticker_themes")
    .select("id, name")
    .eq("is_enabled", true)
    .order("name");
  const themeIds = ((themeRows ?? []) as any[]).map((row) => row.id as string);

  // One query for all themes' images; grouped below into ≤3 collage samples
  // (by order_index) + a per-theme total count.
  let imageRows: any[] = [];
  if (themeIds.length > 0) {
    const { data } = await supabase
      .from("sticker_images")
      .select("theme_id, order_index, media_assets:media_asset_id(bucket, path)")
      .in("theme_id", themeIds)
      .order("order_index");
    imageRows = (data ?? []) as any[];
  }
  const byTheme = new Map<string, { samples: string[]; count: number }>();
  for (const row of imageRows) {
    const entry = byTheme.get(row.theme_id) ?? { samples: [], count: 0 };
    entry.count += 1;
    const m = row.media_assets;
    if (entry.samples.length < 3 && m?.bucket && m?.path) {
      entry.samples.push(
        supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl,
      );
    }
    byTheme.set(row.theme_id, entry);
  }
  const stickerThemes: StickerThemeCard[] = ((themeRows ?? []) as any[]).map(
    (row) => ({
      id: row.id,
      name: row.name,
      samples: byTheme.get(row.id)?.samples ?? [],
      count: byTheme.get(row.id)?.count ?? 0,
    }),
  );

  const { data: stickerSel } = await supabase
    .from("child_sticker_selections")
    .select("theme_id")
    .eq("student_profile_id", child.profileId)
    .maybeSingle();
  const selectedThemeId = (stickerSel as any)?.theme_id ?? null;

  return (
    <div className="profile-page">
      <h1 className="arena-section-h" style={{ marginTop: 0 }}>
        {t("profile.title")}
      </h1>

      <div className="prof2-stack">
        <ChildProfile
          name={childName}
          firstName={childFirst}
          lastName={childLast}
          uniqueId={childId}
          initial={childInitial}
          avatarUrl={avatarUrl}
          dict={profileDict}
        />

        {/* Read-only school details — the child can see but not change these. */}
        <section className="prof2-card" aria-label={t("prof2.schoolInfo")}>
          <h2 className="prof2-sec-title">{t("prof2.schoolInfo")}</h2>
          <p className="prof2-sec-hint">{t("prof2.schoolInfoHint")}</p>
          <div className="prof2-rows">
            <div className="prof2-row">
              <span className="prof2-row-label">{t("prof2.grade")}</span>
              <span className="prof2-row-value">{gradeInfo}</span>
            </div>
            <div className="prof2-row">
              <span className="prof2-row-label">{t("prof2.city")}</span>
              <span className="prof2-row-value">{cityInfo}</span>
            </div>
            <div className="prof2-row">
              <span className="prof2-row-label">{t("prof2.school")}</span>
              <span className="prof2-row-value">{schoolInfo}</span>
            </div>
          </div>
        </section>

        {/* Character-sticker theme gallery. */}
        <section className="prof2-card" aria-label={t("stk.sectionTitle")}>
          <h2 className="prof2-sec-title">{t("stk.sectionTitle")}</h2>
          <p className="prof2-sec-hint">{t("stk.sectionDesc")}</p>
          <StickerThemePicker
            themes={stickerThemes}
            selectedId={selectedThemeId}
            dict={{
              "stk.none": t("stk.none"),
              "stk.empty": t("stk.empty"),
              "stk.countTitle": t("stk.countTitle"),
              "prof2.selected": t("prof2.selected"),
            }}
          />
        </section>

        {/* Round 12 — child-friendly light-mode palette picker. */}
        <section className="prof2-card" aria-label={t("pal.title")}>
          <h2 className="prof2-sec-title">{t("pal.title")}</h2>
          <p className="prof2-sec-hint">{t("pal.hint")}</p>
          <PalettePicker
            selected={currentPalette}
            dict={{
              "pal.default": t("pal.default"),
              "pal.sky": t("pal.sky"),
              "pal.bubblegum": t("pal.bubblegum"),
              "pal.mint": t("pal.mint"),
              "pal.sunset": t("pal.sunset"),
              "pal.rainbow": t("pal.rainbow"),
              "prof2.selected": t("prof2.selected"),
            }}
          />
        </section>
      </div>
    </div>
  );
}
