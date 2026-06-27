import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Olimpiada Portal — Admin Panel",
  description: "Administrator & Content Manager panel for Olimpiada Portal.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
