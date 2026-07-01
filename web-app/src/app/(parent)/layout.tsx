import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { parentLogout } from "@/lib/auth/parentService";
import { getT } from "@/i18n/server";

export default async function ParentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireParent();
  const t = await getT();
  return (
    <>
      <header className="site-nav">
        <Link className="site-brand brand-compact" href="/dashboard">
          {t("app.brand")}
        </Link>
        <nav className="site-links">
          <Link href="/dashboard">{t("parent.nav.dashboard")}</Link>
          <Link href="/children/new">{t("parent.nav.addChild")}</Link>
          <Link href="/dashboard#profile">{t("nav.profile")}</Link>
          <Link href="/contact">{t("nav.contact")}</Link>
          <Link href="/faq">{t("nav.faq")}</Link>
        </nav>
        <div className="site-cta">
          <form action={parentLogout}>
            <button className="btn-ghost" type="submit">
              {t("parent.nav.logout")}
            </button>
          </form>
        </div>
      </header>
      <main className="site-main">{children}</main>
      <footer className="site-foot">
        <Link href="/dashboard#profile">{t("nav.profile")}</Link>
        <Link href="/news">{t("nav.news")}</Link>
        <Link href="/contact">{t("nav.contact")}</Link>
        <Link href="/faq">{t("nav.faq")}</Link>
      </footer>
    </>
  );
}
