import { requirePanelAccess } from "@/lib/admin/guards";
import { NAV } from "@/lib/admin/nav";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { IdleTimeout } from "@/components/IdleTimeout";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getLocale, getT } from "@/i18n/server";
import { localStrings as locationStrings } from "./locations/labels";
import { localStrings as pricingStrings } from "./pricing/labels";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requirePanelAccess();
  const t = await getT();
  const locale = await getLocale();

  // Nav labels not yet in the shared dictionary fall back to the local
  // trilingual module strings (t() returns the key itself when missing) —
  // currently nav.locations (Round 21 merged Cities/Districts/Schools) and
  // nav.pricing (subscription pricing).
  const ltLocations = locationStrings(locale);
  const ltPricing = pricingStrings(locale);
  const navLabel = (key: string) => {
    const v = t(key);
    if (v !== key) return v;
    const l = ltLocations(key);
    return l !== key ? l : ltPricing(key);
  };

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
      .map((i) => ({
        label: navLabel(i.label),
        href: i.href ?? null,
        soon: !!i.soon,
      })),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="admin-layout">
      <IdleTimeout />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" aria-hidden /> OlympIQ{" "}
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
