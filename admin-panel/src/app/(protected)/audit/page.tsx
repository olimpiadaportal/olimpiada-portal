import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale, type T } from "@/i18n/server";

function severityPill(s: string): string {
  if (s === "critical" || s === "error") return "pill-warn";
  if (s === "warning") return "pill-muted";
  return "pill-ok";
}

// Render an audit timestamp in the Asia/Baku timezone (UTC+4, no DST).
// The DB stores created_at as timestamptz (UTC); the previous code used
// toLocaleString() with the SERVER's timezone, so times were wrong. We pin the
// zone to Asia/Baku and localize with the admin's active locale.
function formatBakuTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Baku",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Round 10 (F6): human-readable action/entity mapping layer.
//
// audit_logs.action holds two formats:
//   1) App-written codes from lib/admin/*.ts writeAuditLog(), e.g.
//      "admin.news.create" — enumerated below in ACTION_KEYS.
//   2) DB-trigger rows from public.fn_audit_row (supabase/sql/011), which
//      writes `lower(tg_op) || ':' || tg_table_name`, e.g. "insert:questions"
//      — the op prefix maps via TRIGGER_OP_KEYS (the table shows in Entity).
// Unknown values fall back to a cleaned form (separators → spaces), never a
// raw i18n key.
// ---------------------------------------------------------------------------

const ACTION_KEYS: Record<string, string> = {
  // accounts.ts
  "admin.child.password_reset": "audit.action.child_password_reset",
  "admin.child.delete": "audit.action.child_delete",
  "admin.parent.create": "audit.action.parent_create",
  "admin.parent.update": "audit.action.parent_update",
  "admin.parent.delete": "audit.action.parent_delete",
  // Full parent/child profile edits (Accounts section editors).
  "admin.account.parent.update": "audit.action.account_parent_update",
  "admin.account.child.update": "audit.action.account_child_update",
  // news.ts
  "admin.news.create": "audit.action.news_create",
  "admin.news.update": "audit.action.news_update",
  "admin.news.transition": "audit.action.news_transition",
  "admin.news.cover_attach": "audit.action.news_cover_attach",
  "admin.news.cover_detach": "audit.action.news_cover_detach",
  "admin.news.delete": "audit.action.news_delete",
  // olympiad.ts
  "admin.olympiad.create": "audit.action.olympiad_create",
  "admin.olympiad.update": "audit.action.olympiad_update",
  "admin.olympiad.bulk_import": "audit.action.olympiad_bulk_import",
  "admin.olympiad.cover_attach": "audit.action.olympiad_cover_attach",
  "admin.olympiad.cover_detach": "audit.action.olympiad_cover_detach",
  "admin.olympiad.archive": "audit.action.olympiad_archive",
  // wallpapers.ts (module retired R11 — codes kept so HISTORICAL rows render)
  "admin.wallpaper.create": "audit.action.wallpaper_create",
  "admin.wallpaper.status": "audit.action.wallpaper_status",
  // stickers.ts (R11)
  "admin.sticker_theme.create": "audit.action.sticker_theme_create",
  "admin.sticker_theme.rename": "audit.action.sticker_theme_rename",
  "admin.sticker_theme.toggle": "audit.action.sticker_theme_toggle",
  "admin.sticker_theme.delete": "audit.action.sticker_theme_delete",
  "admin.sticker_image.add": "audit.action.sticker_image_add",
  "admin.sticker_image.delete": "audit.action.sticker_image_delete",
  // accounts.ts (R11 admin-created child + free-access grant)
  "admin.child.create": "audit.action.child_create",
  "admin.child.access_grant": "audit.action.child_access_grant",
  // freeAccess.ts (R12 admin-scheduled free-access windows)
  "admin.free_access.create": "audit.action.free_access_create",
  "admin.free_access.deactivate": "audit.action.free_access_deactivate",
  // settings.ts
  "admin.settings.flag_toggle": "audit.action.flag_toggle",
  "admin.settings.update": "audit.action.setting_update",
  // notifications.ts
  "admin.notification.send": "audit.action.notification_send",
  "admin.notification.template.upsert": "audit.action.notification_template_upsert",
  "admin.notification.template.delete": "audit.action.notification_template_delete",
  // leaderboard.ts (L2 season close / hard reset)
  "admin.leaderboard.reset": "audit.action.leaderboard_reset",
  // leaderboard.ts (named-season CRUD)
  "admin.leaderboard.season.create": "audit.action.lbseason_create",
  "admin.leaderboard.season.update": "audit.action.lbseason_update",
  "admin.leaderboard.season.delete": "audit.action.lbseason_delete",
  "admin.leaderboard.season.close": "audit.action.lbseason_close",
  "admin.leaderboard.season.reopen": "audit.action.lbseason_reopen",
  // mobileApp.ts
  "admin.mobile_version.update": "audit.action.mobile_version_update",
};

const TRIGGER_OP_KEYS: Record<string, string> = {
  insert: "audit.action.row_insert",
  update: "audit.action.row_update",
  delete: "audit.action.row_delete",
};

// target_table values: written by app actions (news/olympiad_packages/
// wallpapers/feature_flags/system_settings/profiles/students/child_credentials)
// and by the fn_audit_row triggers attached in 011/014/015.
const ENTITY_KEYS: Record<string, string> = {
  profiles: "audit.entity.profiles",
  students: "audit.entity.students",
  child_credentials: "audit.entity.child_credentials",
  profile_roles: "audit.entity.profile_roles",
  parent_student_links: "audit.entity.parent_student_links",
  subscriptions: "audit.entity.subscriptions",
  child_subscriptions: "audit.entity.child_subscriptions",
  payments: "audit.entity.payments",
  questions: "audit.entity.questions",
  tests: "audit.entity.tests",
  daily_task_packages: "audit.entity.daily_task_packages",
  news: "audit.entity.news",
  olympiad_packages: "audit.entity.olympiad_packages",
  olympiad_purchases: "audit.entity.olympiad_purchases",
  wallpapers: "audit.entity.wallpapers",
  free_access_intervals: "audit.entity.free_access_intervals",
  leaderboard_seasons: "audit.entity.leaderboard_seasons",
  sticker_themes: "audit.entity.sticker_themes",
  sticker_images: "audit.entity.sticker_images",
  admin_notifications: "audit.entity.admin_notifications",
  notification_templates: "audit.entity.notification_templates",
  feature_flags: "audit.entity.feature_flags",
  system_settings: "audit.entity.system_settings",
  mobile_app_versions: "audit.entity.mobile_app_versions",
};

// Fallback for unknown codes: separators become spaces (never show a raw key).
function cleanCode(code: string): string {
  return code.replace(/[.:_]+/g, " ").trim();
}

function actionLabel(action: string, t: T): string {
  const key = ACTION_KEYS[action];
  if (key) return t(key);
  const trigger = action.match(/^(insert|update|delete):/);
  if (trigger) return t(TRIGGER_OP_KEYS[trigger[1]]);
  return cleanCode(action);
}

function entityLabel(table: string | null, t: T): string {
  if (!table) return "—";
  const key = ENTITY_KEYS[table];
  return key ? t(key) : cleanCode(table);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();

  // Optional entity filter (?entity=news). Validated against the known-entity
  // allowlist so arbitrary client input never reaches the query.
  const sp = (await searchParams) ?? {};
  const rawEntity = typeof sp.entity === "string" ? sp.entity : "";
  const entity = rawEntity && ENTITY_KEYS[rawEntity] ? rawEntity : "";

  // Round 10 (F6): the log shows PANEL-STAFF activity only, scoped at QUERY
  // level (not hidden client-side): resolve profiles holding the administrator
  // or content_manager role, then filter audit_logs to those actors. `.in(...)`
  // also excludes actor_profile_id IS NULL rows (system/trigger writes from
  // regular user activity) by construction.
  const { data: staffRows } = await supabase
    .from("profile_roles")
    .select("profile_id, roles!inner(code)")
    .in("roles.code", ["administrator", "content_manager"]);
  const staffIds = Array.from(
    new Set(
      (staffRows ?? []).map((r: any) => r.profile_id as string).filter(Boolean),
    ),
  );

  let logs: any[] = [];
  if (staffIds.length > 0) {
    let query = supabase
      .from("audit_logs")
      .select(
        "id, created_at, actor_profile_id, action, target_table, target_id, severity, success",
      )
      .in("actor_profile_id", staffIds);
    if (entity) query = query.eq("target_table", entity);
    const { data: rows } = await query
      .order("created_at", { ascending: false })
      .limit(100);
    logs = (rows ?? []) as any[];
  }

  // Resolve actor display names/emails for readability.
  const actorIds = Array.from(
    new Set(logs.map((r) => r.actor_profile_id).filter(Boolean)),
  );
  let actorById = new Map<string, any>();
  if (actorIds.length) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", actorIds);
    actorById = new Map((actors ?? []).map((a: any) => [a.id, a]));
  }

  const fmt = (iso: string): string => formatBakuTime(iso, locale);

  const actorLabel = (id: string | null): string => {
    if (!id) return t("audit.systemActor");
    const a = actorById.get(id);
    return a?.display_name || a?.email || id;
  };

  // Entity filter options, sorted by their translated label.
  const entityOptions = Object.keys(ENTITY_KEYS)
    .map((table) => ({ table, label: entityLabel(table, t) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.audit")}</h1>
        <p className="muted">{t("audit.subtitle2")}</p>
      </div>

      <form method="get" className="audit2-filter">
        <label htmlFor="audit-entity">{t("audit.filter.entity")}</label>
        <select id="audit-entity" name="entity" defaultValue={entity}>
          <option value="">{t("audit.filter.all")}</option>
          {entityOptions.map((o) => (
            <option key={o.table} value={o.table}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost btn-sm">
          {t("audit.filter.apply")}
        </button>
      </form>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{t("audit.when")}</th>
              <th>{t("audit.actor")}</th>
              <th>{t("audit.entity")}</th>
              <th>{t("audit.action")}</th>
              <th>{t("audit.severity")}</th>
              <th>{t("audit.result")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {t("audit.none")}
                </td>
              </tr>
            )}
            {logs.map((r) => (
              <tr key={r.id}>
                <td className="muted">{fmt(r.created_at)}</td>
                <td>{actorLabel(r.actor_profile_id)}</td>
                <td className="muted">{entityLabel(r.target_table, t)}</td>
                <td>{actionLabel(r.action, t)}</td>
                <td>
                  <span className={`pill ${severityPill(r.severity)}`}>
                    {t(`audit.sev.${r.severity}`)}
                  </span>
                </td>
                <td>
                  {r.success ? t("audit.ok") : t("audit.failed")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
