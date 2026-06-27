import { requirePanelAccess } from "@/lib/admin/guards";
import { NAV } from "@/lib/admin/nav";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getLocale, getT } from "@/i18n/server";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requirePanelAccess();
  const t = await getT();
  const locale = await getLocale();

  const roleLabel = ctx.isAdmin
    ? t("common.administrator")
    : t("common.contentManager");

  const groups = NAV.map((g) => ({
    label: t(g.label),
    items: g.items
      .filter((i) => {
        if (i.adminOnly) return ctx.isAdmin;
        if (i.permission)
          return ctx.isAdmin || ctx.permissions.includes(i.permission);
        return true;
      })
      .map((i) => ({ label: t(i.label), href: i.href ?? null, soon: !!i.soon })),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" aria-hidden /> Olimpiada{" "}
          <span className="brand-sub">Admin</span>
        </div>
        <Sidebar groups={groups} soonLabel={t("badge.soon")} />
        <div className="sidebar-foot">{roleLabel} · v0.1</div>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <div className="topbar-title">{roleLabel}</div>
          <div className="account-chip">
            <span className="avatar" aria-hidden />
            <span>{ctx.email ?? "—"}</span>
            <LanguageSwitcher current={locale} />
            <SignOutButton label={t("action.signOut")} />
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
