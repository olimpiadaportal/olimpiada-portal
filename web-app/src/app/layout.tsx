import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Olimpiada Portal — Student & Parent",
  description: "Olimpiada preparation web app for students and parents.",
};

// No-flash theme script: runs before first paint. Reads localStorage "theme"
// (falls back to "dark", the reference default) and sets it on <html> so the
// SSR default never visibly flips. Mechanism mirrored by ThemeToggle + globals.css.
const NO_FLASH_THEME = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body>
        <div className="app-shell">
          <div className="topbar-lite">
            <ThemeToggle locale={locale} />
            <LanguageSwitcher current={locale} />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
