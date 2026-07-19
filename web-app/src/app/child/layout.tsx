import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveChildAvatarUrl } from "@/lib/childAvatar";
import { getT, getLocale } from "@/i18n/server";
import { getLocaleSettings, isFeatureEnabled } from "@/lib/flags";
import { getSiteTypography } from "@/lib/siteTypography";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { ChildProfileDrawer } from "@/components/ChildProfileDrawer";
import { ChildNavLinks, ChildNavProvider } from "@/components/ChildNav";
import { GiveawayBanner } from "@/components/GiveawayBanner";
import { StickerDecorations } from "@/components/StickerDecorations";
import { NotificationBell } from "@/components/NotificationBell";
import { getInboxSnapshot } from "@/lib/notifications/inbox";
import { NOTIF_KEYS, BELL_LIMIT } from "@/lib/notifications/types";

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
  const [t, locale, { enabled: enabledLocales }, supabase, typography] =
    await Promise.all([
      getT(),
      getLocale(),
      getLocaleSettings(),
      createClient(),
      // Item 16: the .arena scope re-declares font-family in globals.css, so
      // the admin-chosen site font (body var) must be re-applied inline here.
      getSiteTypography(),
    ]);

  // M24: the remaining reads don't depend on each other either — one round-trip
  // of latency instead of five serial awaits. (Genuinely dependent work — e.g.
  // the giveaway strings — stays after the Promise.all.)
  const [
    { giveaway },
    { data: student },
    legacyAvatarUrl,
    { data: streakStatus },
    olympiadOn,
    leaderboardOn,
    notifOn,
  ] = await Promise.all([
    // Round 11: while a giveaway window is active the student arena shows the
    // celebratory countdown banner at the top of the panel content.
    getPaymentModeInfo(),
    supabase
      .from("students")
      .select("first_name, palette, avatar_kind, avatar_key, avatar_media_path")
      .eq("profile_id", child.profileId)
      .maybeSingle(),
    // LEGACY self-uploaded avatar URL (public bucket) for the drawer trigger
    // (degrades to initials on any failure — never blocks the shell from
    // rendering). The PARENT-SET avatar resolved below takes priority.
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
    // Streak source (L1): the real leaderboard engine RPC — students.current_
    // streak maintained by award_attempt_points, with lazy zeroing of a lost
    // streak. Replaces the old distinct-active-days approximation.
    supabase.rpc("get_streak_status"),
    // Module gates (admin Settings) hide the tabs; the pages/actions are gated
    // server-side as well.
    isFeatureEnabled("olympiad_module"),
    isFeatureEnabled("leaderboard"),
    isFeatureEnabled("notifications"),
  ]);

  const gvwStrings: Record<string, string> = {};
  if (giveaway.active) for (const k of GVW_KEYS) gvwStrings[k] = t(k);

  // In-app notification bell (gated by the `notifications` feature flag). The
  // arena keeps its nav uncluttered — the child reaches the full center via the
  // bell's "See all"; preferences are parent-managed (not editable here).
  const notifSnapshot = notifOn
    ? await getInboxSnapshot(BELL_LIMIT)
    : { items: [], unread: 0 };
  const notifDict: Record<string, string> = {};
  if (notifOn) for (const k of NOTIF_KEYS) notifDict[k] = t(k);

  const firstName = (student as any)?.first_name ?? "";
  const initial = (firstName.trim()[0] ?? "?").toUpperCase();

  // Drawer-trigger avatar priority: the PARENT-SET avatar (photo → signed URL
  // via the student's OWN session — storage RLS lets the student read their own
  // object; preset → bundled PNG) wins over the legacy self-uploaded profile
  // avatar; both fall back to the initials bubble.
  const avatarUrl =
    (await resolveChildAvatarUrl(supabase, student as any)) ?? legacyAvatarUrl;

  // Round 12: the child's chosen LIGHT-MODE palette (data-palette drives the
  // [data-theme="light"] .arena[data-palette] overrides in globals.css). Only a
  // whitelisted slug is applied; anything else = the default look (no attribute).
  const PALETTES = ["sky", "bubblegum", "mint", "sunset", "rainbow"] as const;
  const rawPalette = (student as any)?.palette;
  const palette = PALETTES.includes(rawPalette) ? (rawPalette as string) : null;

  // Streak: the engine's real consecutive-day streak (0 when none/on error —
  // never fabricated).
  const streak = Number((streakStatus as any)?.current ?? 0) || 0;

  // Same header structure as the parent shell (.pnav + ChildNavLinks +
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
      <div
        className="arena"
        data-palette={palette ?? undefined}
        // Only when an admin saved a site font — otherwise the arena keeps its
        // own stack from globals.css (zero visual regression by default).
        style={typography ? { fontFamily: "var(--site-font)" } : undefined}
      >
        {/* Self-contained async server component (fetches its own selection;
            renders null when the child has no sticker theme selected). */}
        <StickerDecorations />
        {/* ChildNavProvider lets the attempt pages (which know the attempt
            kind) pin the correct active tab — exams vs olympiads share the
            /child/test/run route, so pathname matching alone is not enough. */}
        <ChildNavProvider>
        <header className="pnav">
          <ChildNavLinks items={navItems} />
          <div className="pnav-right">
            <span className="arena-streak" title={t("arena.streak")}>
              🔥 {streak} {t("arena.streak")}
            </span>
            {notifOn && (
              <NotificationBell
                me={child.profileId}
                initialItems={notifSnapshot.items}
                initialUnread={notifSnapshot.unread}
                seeAllHref="/child/notifications"
                strings={notifDict}
              />
            )}
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
                // Info-page rows → /child/help/* (About / FAQ / Contact).
                help: t("nav.help"),
                about: t("nav.about"),
                faq: t("nav.faq"),
                contact: t("nav.contact"),
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
        </ChildNavProvider>
      </div>
    </>
  );
}
