import Link from "next/link";
import { getT } from "@/i18n/server";

// Public top nav: Pricing, About, FAQ, Contact, News.
const NAV: [string, string][] = [
  ["/pricing", "nav.pricing"],
  ["/about", "nav.about"],
  ["/faq", "nav.faq"],
  ["/contact", "nav.contact"],
  ["/news", "nav.news"],
];

// Footer link columns. Section label key → list of [href, label key].
const FOOTER_COLS: { head: string; links: [string, string][] }[] = [
  {
    head: "footer.product",
    links: [
      ["/pricing", "nav.pricing"],
      ["/news", "nav.news"],
      ["/register", "nav.register"],
    ],
  },
  {
    head: "footer.company",
    links: [
      ["/about", "nav.about"],
      ["/contact", "nav.contact"],
    ],
  },
  {
    head: "footer.legal",
    links: [
      ["/faq", "nav.faq"],
      ["/login", "nav.login"],
    ],
  },
];

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getT();
  const year = new Date().getFullYear();
  return (
    <>
      <header className="site-nav">
        <Link className="site-brand" href="/">
          {t("app.brand")}
        </Link>
        <nav className="site-links">
          {NAV.map(([href, key]) => (
            <Link key={href} href={href}>
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="site-cta">
          <Link className="btn-ghost" href="/login">
            {t("nav.login")}
          </Link>
          <Link className="btn" href="/register">
            {t("nav.register")}
          </Link>
        </div>
      </header>

      <main className="site-main">{children}</main>

      <footer className="site-foot">
        <div className="site-foot-inner">
          <div>
            <Link className="site-foot-brand" href="/">
              {t("app.brand")}
            </Link>
            <p className="site-foot-tagline">{t("footer.tagline")}</p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div className="site-foot-col" key={col.head}>
              <p className="site-foot-h">{t(col.head)}</p>
              {col.links.map(([href, key]) => (
                <Link key={href} href={href}>
                  {t(key)}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="site-foot-bottom">
          <div className="site-foot-bottom-inner">
            © {year} {t("app.brand")} — {t("foot.rights")}
          </div>
        </div>
      </footer>
    </>
  );
}
