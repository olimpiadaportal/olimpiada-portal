import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { getLocaleSettings, isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { ChildProfileDrawer } from "@/components/ChildProfileDrawer";
import { ParentNavLinks } from "@/components/ProfileDrawer";
import { GiveawayBanner } from "@/components/GiveawayBanner";
import { StickerDecorations } from "@/components/StickerDecorations";

// Giveaway-banner strings resolved server-side (GiveawayBanner is a client
// component and must never touch i18n or the server-only payment-mode module).
const GVW_KEYS = [
  "gvw.title",
  "gvw.sub",
  "gvw.remaining",
  "gvw.days",
  "gvw.hours",
  "gvw.minutes",
  "gvw.seconds",
  "gvw.ended",
] as const;

// Arena (Claude-Design) shell for the Student/Child app. Dark theme is scoped
// to the `.arena` root so the parent/public areas and the admin panel are never
// affected. Round 11: the wallpaper feature is retired — the arena always uses
// its normal theme background; character STICKER decorations (owner item,
// Agent F component) render inside the arena wrapper instead.
export default async function ChildLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const child = await requireChild();
  // M24: these lookups are independent — resolve them concurrently.
  const [t, locale, { enabled: enabledLocales }, supabase] = await Promise.all([
    getT(),
    getLocale(),
    getLocaleSettings(),
    createClient(),
  ]);

  // M24: the remaining reads don't depend on each other either — one round-trip
  // of latency instead of five serial awaits. (Genuinely dependent work — e.g.
  // the giveaway strings — stays after the Promise.all.)
  const [
    { giveaway },
    { data: student },
    avatarUrl,
    { data: subs },
    olympiadOn,
    leaderboardOn,
  ] = await Promise.all([
    // Round 11: while a giveaway window is active the student arena shows the
    // celebratory countdown banner at the top of the panel content.
    getPaymentModeInfo(),
    supabase
      .from("students")
      .select("first_name, palette")
      .eq("profile_id", child.profileId)
      .maybeSingle(),
    // Avatar public URL for the drawer trigger (degrades to initials on any
    // failure — never blocks the shell from rendering).
    (async (): Promise<string | null> => {
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("avatar_media_id, media_assets:avatar_media_id(bucket, path)")
          .eq("id", child.profileId)
          .maybeSingle();
        const m = (prof as any)?.media_assets;
        if (m?.bucket && m?.path) {
          return supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
        }
        return null;
      } catch {
        return null;
      }
    })(),
    // Streak source: recent graded attempts (real data; 0 when none yet).
    supabase
      .from("test_attempts")
      .select("submitted_at")
      .eq("student_profile_id", child.profileId)
      .eq("status", "graded")
      .order("submitted_at", { ascending: false })
      .limit(60),
    // Module gates (admin Settings) hide the tabs; the pages/actions are gated
    // server-side as well.
    isFeatureEnabled("olympiad_module"),
    isFeatureEnabled("leaderboard"),
  ]);

  const gvwStrings: Record<string, string> = {};
  if (giveaway.active) for (const k of GVW_KEYS) gvwStrings[k] = t(k);

  const firstName = (student as any)?.first_name ?? "";
  const initial = (firstName.trim()[0] ?? "?").toUpperCase();

  // Round 12: the child's chosen LIGHT-MODE palette (data-palette drives the
  // [data-theme="light"] .arena[data-palette] overrides in globals.css). Only a
  // whitelisted slug is applied; anything else = the default look (no attribute).
  const PALETTES = ["sky", "bubblegum", "mint", "sunset", "rainbow"] as const;
  const rawPalette = (student as any)?.palette;
  const palette = PALETTES.includes(rawPalette) ? (rawPalette as string) : null;

  // Streak: count of distinct recent days the child submitted a graded attempt
  // (derived from real data; 0 when none yet — never fabricated).
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
  const navItems = [
    { href: "/child", label: t("arena.nav.arena"), brand: true, exact: true },
    // Timed topic tests (T1) — core learning surface, deliberately NOT
    // feature-flag gated (unlike olympiads/leaderboard below).
    { href: "/child/test", label: t("arena.nav.test") },
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
      <div className="arena" data-palette={palette ?? undefined}>
        {/* Self-contained async server component (fetches its own selection;
            renders null when the child has no sticker theme selected). */}
        <StickerDecorations />
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
        <main className="arena-main">
          {giveaway.active && giveaway.endsAt && (
            <GiveawayBanner endsAt={giveaway.endsAt} strings={gvwStrings} />
          )}
          {children}
        </main>
      </div>
    </>
  );
}
