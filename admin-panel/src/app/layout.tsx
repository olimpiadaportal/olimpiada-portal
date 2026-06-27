import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Olimpiada Portal — Admin Panel",
  description: "Administrator & Content Manager panel for Olimpiada Portal.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="az">
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
