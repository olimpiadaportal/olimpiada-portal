import type { Metadata } from "next";
import "./globals.css";
import { getLocale, getT } from "@/i18n/server";
import { getPublicSiteSettings, getContentOverrides } from "@/lib/flags";
import { I18nProvider } from "@/i18n/I18nProvider";
import { messages } from "@/i18n/messages";
import { defaultLocale } from "@/i18n/config";

export const metadata: Metadata = {
  title: "OlympIQ — Student & Parent",
  description: "OlympIQ — olympiad preparation web app for students and parents.",
};

// No-flash theme script: runs before first paint. Reads localStorage "theme"
// (falls back to "dark", the reference default) and sets it on <html> so the
// SSR default never visibly flips. Mechanism mirrored by ThemeToggle + globals.css.
const NO_FLASH_THEME = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

  // M21: build the SINGLE-locale client dictionary on the server — the bundled
  // catalog for the current locale (over the default-locale fallback) merged
  // with the admin "Website Content" DB overrides. The client I18nProvider
  // receives only this dict, so the trilingual catalog never ships client-side.
  const contentOverrides = await getContentOverrides();
  const clientDict: Record<string, string> = {
    ...messages[defaultLocale],
    ...messages[locale],
  };
  for (const [key, tri] of Object.entries(contentOverrides)) {
    const v = tri[locale];
    if (v && v.trim()) clientDict[key] = v;
  }

  // Maintenance mode (admin Settings → platform.maintenance_mode): the whole
  // web-app (public + parent + student) shows the maintenance notice. The
  // admin panel is a separate app and stays reachable to turn it back off.
  const site = await getPublicSiteSettings();
  let maintenance: React.ReactNode = null;
  if (site.maintenanceMode) {
    const t = await getT();
    const msg =
      site.maintenanceMessage[locale] ?? site.maintenanceMessage.az ?? "";
    maintenance = (
      <div className="maintenance-splash">
        <div className="maintenance-card">
          <span className="maintenance-badge" aria-hidden="true">
            ⚙
          </span>
          <h1>{t("maintenance.title")}</h1>
          <p>{msg || t("maintenance.body")}</p>
        </div>
      </div>
    );
  }

  // suppressHydrationWarning: data-theme is intentionally rewritten by the
  // no-flash script BEFORE hydration (server can't know localStorage), so the
  // server "dark" vs client "light" attribute diff is expected — this is the
  // documented Next.js pattern for pre-hydration theme attributes. It only
  // suppresses attribute mismatches on <html> itself, nothing deeper.
  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body>
        <I18nProvider locale={locale} dict={clientDict}>
          <div className="app-shell">
            {/* Theme + language controls live in each shell's own nav
                (e.g. the public navbar's .navbar-controls), so the root
                topbar no longer renders them — avoids duplicate controls. */}
            {maintenance ?? children}
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
