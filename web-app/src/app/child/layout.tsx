import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { getLocaleSettings, isFeatureEnabled } from "@/lib/flags";
import { ChildProfileDrawer } from "@/components/ChildProfileDrawer";
import { ParentNavLinks } from "@/components/ProfileDrawer";

// Arena (Claude-Design) shell for the Student/Child app. Dark theme is scoped
// to the `.arena` root so the parent/public areas and the admin panel are never
// affected. Logic (auth, wallpaper, logout) is unchanged from the prior shell.
export default async function ChildLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const child = await requireChild();
  const t = await getT();
  const locale = await getLocale();
  const { enabled: enabledLocales } = await getLocaleSettings();
  const supabase = await createClient();

  const { data: sel } = await supabase
    .from("child_wallpaper_selections")
    .select("wallpapers(kind, value, media_asset_id, media_assets:media_asset_id(bucket, path))")
    .eq("student_profile_id", child.profileId)
    .maybeSingle();
  const wp = (sel as any)?.wallpapers;
  const bg = wp?.kind === "solid_color" ? (wp.value as string) : undefined;
  // Image-kind wallpaper → resolve its public URL for the .arena background.
  // R7 security: the URL is interpolated into inline CSS url('…'), so encode it
  // and escape quote/paren breakers — a crafted storage path must not be able
  // to escape the CSS string context (defense in depth; the catalog is
  // admin-managed and the child only picks a wallpaper_id).
  let wpImg: string | undefined;
  if (wp?.kind === "image") {
    const m = wp.media_assets;
    if (m?.bucket && m?.path) {
      const raw = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
      wpImg = encodeURI(raw).replace(
        /['"()]/g,
        (c) => `%${c.charCodeAt(0).toString(16)}`,
      );
    }
  }

  // Arena background props: image wallpaper wins, then solid color, else the
  // theme default (no data-wallpaper → globals.css falls back to var(--bg)).
  const arenaProps: Record<string, any> = {};
  if (wpImg) {
    arenaProps["data-wallpaper"] = "";
    arenaProps["data-wp-kind"] = "image";
    arenaProps.style = { ["--wp-img" as any]: `url('${wpImg}')` };
  } else if (bg) {
    arenaProps["data-wallpaper"] = "";
    arenaProps.style = { ["--wp" as any]: bg };
  }

  const { data: student } = await supabase
    .from("students")
    .select("first_name")
    .eq("profile_id", child.profileId)
    .maybeSingle();
  const firstName = (student as any)?.first_name ?? "";
  const initial = (firstName.trim()[0] ?? "?").toUpperCase();

  // Avatar public URL for the drawer trigger (degrades to initials on any
  // failure — never blocks the shell from rendering).
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

  // Streak: count of distinct recent days the child submitted a graded attempt
  // (derived from real data; 0 when none yet — never fabricated).
  const { data: subs } = await supabase
    .from("test_attempts")
    .select("submitted_at")
    .eq("student_profile_id", child.profileId)
    .eq("status", "graded")
    .order("submitted_at", { ascending: false })
    .limit(60);
  const days = new Set<string>();
  for (const r of (subs ?? []) as any[]) {
    if (r.submitted_at) days.add(String(r.submitted_at).slice(0, 10));
  }
  const streak = days.size;

  // Same header structure as the parent shell (.pnav + ParentNavLinks +
  // .pnav-right drawer trigger). The drawer must NOT live inside a header with
  // backdrop-filter — a filtered ancestor becomes the containing block for
  // position:fixed, which broke the old .arena-nav drawer. Profile lives in the
  // drawer (avatar → Profile / Language / Theme / Logout), not as a nav tab.
  const [olympiadOn, leaderboardOn] = await Promise.all([
    isFeatureEnabled("olympiad_module"),
    isFeatureEnabled("leaderboard"),
  ]);
  const navItems = [
    { href: "/child", label: t("arena.nav.arena"), brand: true, exact: true },
    // Module gates (admin Settings) hide the tabs; the pages/actions are gated
    // server-side as well.
    ...(olympiadOn ? [{ href: "/child/olympiads", label: t("arena.nav.tasks") }] : []),
    ...(leaderboardOn ? [{ href: "/child/leaderboard", label: t("arena.nav.rank") }] : []),
    { href: "/child/news", label: t("nav.news") },
  ];

  return (
    <>
      {/* R8: body text now uses the global Azerbaijani-safe Arial stack (Chivo
          dropped — poor ə/Ə). JetBrains Mono remains for numeric accents. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap"
        rel="stylesheet"
      />
      <div className="arena" {...arenaProps}>
        <header className="pnav">
          <ParentNavLinks items={navItems} />
          <div className="pnav-right">
            <span className="arena-streak" title={t("arena.streak")}>
              🔥 {streak} {t("arena.streak")}
            </span>
            <ChildProfileDrawer
              locale={locale}
              availableLocales={enabledLocales}
              profile={{ initials: initial, avatarUrl }}
              drawer={{
                title: t("drawer.title"),
                profileBtn: t("drawer.profileBtn"),
                language: t("drawer.language"),
                theme: t("drawer.theme"),
                logout: t("drawer.logout"),
                close: t("drawer.close"),
                // Round 8 drawer sections + segmented theme labels.
                account: t("drawer2.account"),
                appearance: t("drawer2.appearance"),
                session: t("drawer2.session"),
                themeLight: t("drawer2.themeLight"),
                themeDark: t("drawer2.themeDark"),
              }}
            />
          </div>
        </header>
        <main className="arena-main">{children}</main>
      </div>
    </>
  );
}
