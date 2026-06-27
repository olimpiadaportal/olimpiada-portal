import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const metadata: Metadata = {
  title: "Olimpiada Portal — Student & Parent",
  description: "Olimpiada preparation web app for students and parents.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <div className="app-shell">
          <div className="topbar-lite">
            <LanguageSwitcher current={locale} />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
