import { requirePanelAccess } from "@/lib/admin/guards";
import { NAV } from "@/lib/admin/nav";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { IdleTimeout } from "@/components/IdleTimeout";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { getAdminInboxSnapshot } from "@/lib/admin/notif-inbox";
import { BELL_LIMIT } from "@/lib/admin/notif-types";
import { getLocale, getT } from "@/i18n/server";
import { localStrings as locationStrings } from "./locations/labels";
import { localStrings as pricingStrings } from "./pricing/labels";
import { localStrings as alertsStrings } from "./alerts/labels";

const BELL_STRING_KEYS = [
  "alerts.bell",
  "alerts.markAllRead",
  "alerts.seeAll",
  "alerts.empty",
  "alerts.emptyHint",
  "alerts.timeNow",
  "alerts.timeMin",
  "alerts.timeHour",
  "alerts.timeDay",
] as const;

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requirePanelAccess();
  const t = await getT();
  const locale = await getLocale();

  // Nav labels not yet in the shared dictionary fall back to the local
  // trilingual module strings (t() returns the key itself when missing) —
  // currently nav.locations (Round 21 merged Cities/Districts/Schools),
  // nav.pricing (subscription pricing) and nav.alerts (received alerts page).
  const ltLocations = locationStrings(locale);
  const ltPricing = pricingStrings(locale);
  const ltAlerts = alertsStrings(locale);
  const navLabel = (key: string) => {
    const v = t(key);
    if (v !== key) return v;
    const l = ltLocations(key);
    if (l !== key) return l;
    const p = ltPricing(key);
    return p !== key ? p : ltAlerts(key);
  };

  // Admin notification bell — reads ONLY the acting admin's own rows (RLS
  // notif_select is self-scoped since migration 076, and getAdminInboxSnapshot
  // adds an explicit recipient_profile_id filter on top as defense in depth).
  // Content Managers can also receive staff-audience sends now (the composer's
  // "content_managers" audience), so the snapshot is seeded for every panel user.
  const notifSnapshot = await getAdminInboxSnapshot(BELL_LIMIT, ctx.profileId);
  const bellStrings: Record<string, string> = {};
  for (const k of BELL_STRING_KEYS) bellStrings[k] = ltAlerts(k);

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
            <NotificationBell
              initialItems={notifSnapshot.items}
              initialUnread={notifSnapshot.unread}
              seeAllHref="/alerts"
              strings={bellStrings}
              profileId={ctx.profileId}
            />
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
