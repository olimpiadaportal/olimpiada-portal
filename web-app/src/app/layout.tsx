import type { Metadata } from "next";
import "./globals.css";
import { getLocale, getT } from "@/i18n/server";
import { getPublicSiteSettings } from "@/lib/flags";

export const metadata: Metadata = {
  title: "OlimpIQ — Student & Parent",
  description: "OlimpIQ — olympiad preparation web app for students and parents.",
};

// No-flash theme script: runs before first paint. Reads localStorage "theme"
// (falls back to "dark", the reference default) and sets it on <html> so the
// SSR default never visibly flips. Mechanism mirrored by ThemeToggle + globals.css.
const NO_FLASH_THEME = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

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
        <div className="app-shell">
          {/* Theme + language controls live in each shell's own nav
              (e.g. the public navbar's .navbar-controls), so the root
              topbar no longer renders them — avoids duplicate controls. */}
          {maintenance ?? children}
        </div>
      </body>
    </html>
  );
}
