import Link from "next/link";
import { getLocale, getT } from "@/i18n/server";
import { getLocaleSettings, getPublicSiteSettings } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageDropdown } from "@/components/LanguageDropdown";
import { GiveawayBanner } from "@/components/GiveawayBanner";

// Giveaway promo strings surfaced to logged-OUT visitors on the public site
// (item 1b — lure new customers). Same keys as the in-app banner.
const GVW_KEYS = [
  "gvw.title", "gvw.sub", "gvw.remaining",
  "gvw.days", "gvw.hours", "gvw.minutes", "gvw.seconds", "gvw.ended",
] as const;

// Public top nav: Services, About, FAQ, Contact, News.
const NAV: [string, string][] = [
  ["/services", "nav.pricing"],
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
      ["/services", "nav.pricing"],
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

// R10 (F8): inline-SVG glyphs for the supported social platforms (strict CSP —
// no external icon fonts). All are decorative; the LINK carries the label.
function SocialIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true as const,
  };
  switch (name) {
    case "Facebook":
      return (
        <svg {...common}>
          <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" />
        </svg>
      );
    case "Instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "YouTube":
      return (
        <svg {...common}>
          <path d="M23 7.2a3 3 0 0 0-2.1-2.2C19 4.5 12 4.5 12 4.5s-7 0-8.9.5A3 3 0 0 0 1 7.2 32 32 0 0 0 .5 12 32 32 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.6 8.9.6 8.9.6s7 0 8.9-.6a3 3 0 0 0 2.1-2.1A32 32 0 0 0 23.5 12 32 32 0 0 0 23 7.2ZM9.8 15.3V8.7l6 3.3-6 3.3Z" />
        </svg>
      );
    case "TikTok":
      return (
        <svg {...common}>
          <path d="M16.7 2h-3v13.3a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.4a6 6 0 0 0-.9-.1 6 6 0 1 0 6 6V8.9a7.6 7.6 0 0 0 4.2 1.3v-3a4.6 4.6 0 0 1-4.3-5.2Z" />
        </svg>
      );
    default:
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
        </svg>
      );
  }
}

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getT();
  const locale = await getLocale();
  const { enabled: enabledLocales } = await getLocaleSettings();
  // Social links (admin Settings → social.*): only non-empty ones render.
  const { social } = await getPublicSiteSettings();
  const socialLinks = (
    [
      ["Facebook", social.facebook],
      ["Instagram", social.instagram],
      ["YouTube", social.youtube],
      ["TikTok", social.tiktok],
    ] as const
  ).filter(([, url]) => Boolean(url));

  // Public giveaway promo (item 1b): show the live countdown to visitors while
  // an admin giveaway window is active. Resolved server-side (never client
  // state); the same celebratory banner the in-app panels use.
  const { giveaway } = await getPaymentModeInfo();
  const gvwStrings: Record<string, string> = {};
  if (giveaway.active) for (const k of GVW_KEYS) gvwStrings[k] = t(k);

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
        <div className="navbar-controls">
          <ThemeToggle locale={locale} />
          <LanguageDropdown current={locale} available={enabledLocales} />
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
            <span>
              © {year} {t("app.brand")} — {t("foot.rights")}
            </span>
            {socialLinks.length > 0 && (
              <span className="site-foot-social">
                {/* R10 (F8): platform ICONS instead of plain text; each link
                    keeps an accessible name via aria-label + title. */}
                {socialLinks.map(([name, url]) => (
                  <a
                    key={name}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={name}
                    title={name}
                    className="social-icon"
                  >
                    <SocialIcon name={name} />
                  </a>
                ))}
              </span>
            )}
          </div>
        </div>
      </footer>
    </>
  );
}
