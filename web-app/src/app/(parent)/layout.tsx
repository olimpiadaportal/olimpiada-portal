import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { getLocaleSettings } from "@/lib/flags";
import { ProfileDrawer, ParentNavLinks } from "@/components/ProfileDrawer";

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

  const navItems = [
    { href: "/dashboard", label: t("nav.home"), brand: true },
    { href: "/analytics", label: t("nav.analytics") },
    { href: "/subscription", label: t("nav.subscription") },
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
            }}
          />
        </div>
      </header>
      <main className="site-main">{children}</main>
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
