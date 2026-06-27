import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Olimpiada Portal — Admin Panel",
  description: "Administrator & Content Manager panel for Olimpiada Portal.",
};

// Planned admin areas. Only "Dashboard" exists in this foundation; the rest are
// shown as disabled "soon" items (built in later stages) so nothing is faked.
const NAV: { label: string; href?: string; active?: boolean }[] = [
  { label: "Dashboard", href: "/", active: true },
  { label: "Users", },
  { label: "Taxonomy" },
  { label: "Questions" },
  { label: "Tests & Daily Tasks" },
  { label: "Subscriptions" },
  { label: "Reports" },
  { label: "Audit Logs" },
  { label: "Settings" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="az">
      <body>
        <div className="admin-layout">
          <aside className="sidebar">
            <div className="brand">
              <span className="brand-dot" aria-hidden />
              Olimpiada <span className="brand-sub">Admin</span>
            </div>
            <nav className="nav" aria-label="Admin sections">
              <span className="nav-section-label">Platform</span>
              {NAV.map((item) =>
                item.active && item.href ? (
                  <Link key={item.label} href={item.href} className="nav-item active">
                    {item.label}
                  </Link>
                ) : (
                  <span
                    key={item.label}
                    className="nav-item disabled"
                    aria-disabled="true"
                  >
                    {item.label}
                    <span className="badge-soon">soon</span>
                  </span>
                ),
              )}
            </nav>
            <div className="sidebar-foot">Foundation preview · v0.1</div>
          </aside>

          <div className="admin-main">
            <header className="topbar">
              <div className="topbar-title">Administrator &amp; Content Manager</div>
              <div className="account-chip">
                <span className="avatar" aria-hidden />
                Not signed in
              </div>
            </header>
            <main className="admin-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
