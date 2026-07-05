import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { getLocaleSettings } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { ProfileDrawer, ParentNavLinks } from "@/components/ProfileDrawer";
import { GiveawayBanner } from "@/components/GiveawayBanner";

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

  // Home is exact-matched: /dashboard/news lives under it (R10 in-panel news)
  // and must not keep the Home tab highlighted.
  const navItems = [
    { href: "/dashboard", label: t("nav.home"), brand: true, exact: true },
    { href: "/analytics", label: t("nav.analytics") },
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
        {children}
      </main>
      <footer className="site-foot">
        <div className="site-foot-inner">
          <div className="site-foot-col">
            <p className="site-foot-h">{t("app.brand")}</p>
            <Link href="/dashboard">{t("nav.home")}</Link>
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
