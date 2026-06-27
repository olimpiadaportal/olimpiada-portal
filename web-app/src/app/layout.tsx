import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Olimpiada Portal — Student & Parent",
  description: "Olimpiada preparation web app for students and parents.",
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
