import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { getLocaleSettings, isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { getParentFreeAccess } from "@/lib/freeAccess";
import { ProfileDrawer, ParentNavLinks } from "@/components/ProfileDrawer";
import { GiveawayBanner } from "@/components/GiveawayBanner";
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

function initialsOf(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return (email.trim()[0] ?? "?").toUpperCase();
}

export default async function ParentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const parent = await requireParent();
  const t = await getT();
  const locale = await getLocale();
  const { enabled: enabledLocales } = await getLocaleSettings();
  const supabase = await createClient();

  // Round 11: while a giveaway window is active every parent page shows the
  // celebratory countdown banner at the top of the panel content.
  const { giveaway } = await getPaymentModeInfo();
  const gvwStrings: Record<string, string> = {};
  if (giveaway.active) for (const k of GVW_KEYS) gvwStrings[k] = t(k);

  // Round 12: a scheduled per-parent/child FREE-ACCESS interval also shows a
  // top-of-page countdown (only when the global giveaway isn't already showing
  // one). Reuses GiveawayBanner with free-access title/subtitle + the shared
  // countdown labels.
  const freeAccess = await getParentFreeAccess();
  const showFreeBanner = !giveaway.active && freeAccess.active && !!freeAccess.endsAt;
  const faStrings: Record<string, string> = {};
  if (showFreeBanner) {
    faStrings["gvw.title"] = t("fa.title");
    faStrings["gvw.sub"] = t("fa.sub");
    faStrings["gvw.remaining"] = t("gvw.remaining");
    faStrings["gvw.days"] = t("gvw.days");
    faStrings["gvw.hours"] = t("gvw.hours");
    faStrings["gvw.minutes"] = t("gvw.minutes");
    faStrings["gvw.seconds"] = t("gvw.seconds");
    faStrings["gvw.ended"] = t("gvw.ended");
  }

  // Parent profile display data for the drawer's ACCOUNT section. Degrade
  // gracefully on any failure so the shell still renders with an initials mark.
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

  // In-app notification center (gated by the `notifications` feature flag). The
  // bell + the /notifications nav link only appear when the flag is ON.
  const notifOn = await isFeatureEnabled("notifications");
  const notifSnapshot = notifOn
    ? await getInboxSnapshot(BELL_LIMIT)
    : { items: [], unread: 0 };
  const notifDict: Record<string, string> = {};
  if (notifOn) for (const k of NOTIF_KEYS) notifDict[k] = t(k);

  // The parent leaderboard tab is gated by the same `leaderboard` feature flag
  // the student arena uses (the page itself shows the trilingual "disabled"
  // notice on a direct URL when the flag is off).
  const leaderboardOn = await isFeatureEnabled("leaderboard");

  // Home is exact-matched: /dashboard/news lives under it (R10 in-panel news)
  // and must not keep the Home tab highlighted.
  // Notifications: the header BELL is the single entry point (its dropdown
  // links to /notifications via "see all") — no dedicated nav tab.
  const navItems = [
    { href: "/dashboard", label: t("nav.home"), brand: true, exact: true },
    { href: "/analytics", label: t("nav.analytics") },
    ...(leaderboardOn ? [{ href: "/leaderboard", label: t("lb.title") }] : []),
    { href: "/olympiads", label: t("poly.nav") },
    { href: "/subscription", label: t("nav.subscription") },
    { href: "/dashboard/news", label: t("nav.news") },
    { href: "/help/faq", label: t("help.faqTitle") },
    { href: "/help/contact", label: t("help.contactTitle") },
  ];

  return (
    <>
      <header className="pnav">
        <ParentNavLinks items={navItems} />
        <div className="pnav-right">
          {notifOn && (
            <NotificationBell
              me={parent.profileId}
              initialItems={notifSnapshot.items}
              initialUnread={notifSnapshot.unread}
              seeAllHref="/notifications"
              strings={notifDict}
            />
          )}
          <ProfileDrawer
            locale={locale}
            availableLocales={enabledLocales}
            profile={{
              initials: initialsOf(name, email),
              avatarUrl,
            }}
            drawer={{
              title: t("drawer.title"),
              account: t("drawer.account"),
              language: t("drawer.language"),
              theme: t("drawer.theme"),
              close: t("drawer.close"),
              profileBtn: t("drawer.profileBtn"),
              logout: t("drawer.logout"),
              // Round 8 drawer sections + segmented theme labels.
              appearance: t("drawer2.appearance"),
              session: t("drawer2.session"),
              themeLight: t("drawer2.themeLight"),
              themeDark: t("drawer2.themeDark"),
            }}
          />
        </div>
      </header>
      <main className="site-main">
        {giveaway.active && giveaway.endsAt && (
          <GiveawayBanner endsAt={giveaway.endsAt} strings={gvwStrings} />
        )}
        {showFreeBanner && freeAccess.endsAt && (
          <GiveawayBanner endsAt={freeAccess.endsAt} strings={faStrings} />
        )}
        {children}
      </main>
      <footer className="site-foot">
        <div className="site-foot-inner">
          <div className="site-foot-col">
            <p className="site-foot-h">{t("app.brand")}</p>
            <Link href="/dashboard">{t("nav.home")}</Link>
            <Link href="/help/about">{t("nav.about")}</Link>
            <Link href="/help/faq">{t("help.faqTitle")}</Link>
            <Link href="/help/contact">{t("help.contactTitle")}</Link>
          </div>
        </div>
        <div className="site-foot-bottom">
          <div className="site-foot-bottom-inner">
            © {new Date().getFullYear()} {t("app.brand")}
          </div>
        </div>
      </footer>
    </>
  );
}
