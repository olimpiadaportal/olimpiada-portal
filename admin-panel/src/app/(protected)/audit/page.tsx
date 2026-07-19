import Link from "next/link";
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
//   1) App-written codes from lib/admin/*.ts writeAuditLog() (admin-panel) and
//      the web-app's parent-facing server actions, e.g. "admin.news.create" /
//      "parent.child_create" — enumerated below in ACTION_KEYS.
//   2) DB-trigger rows from public.fn_audit_row (supabase/sql/011 + later
//      migrations), which writes `lower(tg_op) || ':' || tg_table_name`, e.g.
//      "insert:questions" — the op prefix maps via TRIGGER_OP_KEYS (the table
//      shows in the Entity column).
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
  // site content / pricing (Round 22)
  "admin.site_content.update": "audit.action.site_content_update",
  "admin.pricing.subject_price_upsert": "audit.action.pricing_subject_price_upsert",
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
  // web-app parent-facing server actions (Round 22 — written by the web-app,
  // read here so the panel's audit log covers parent/child activity too).
  "parent.register": "audit.action.parent_register",
  "parent.account_delete": "audit.action.parent_account_delete",
  "parent.child_create": "audit.action.parent_child_create",
  "parent.child_password_reset": "audit.action.parent_child_password_reset",
  "parent.subscription_create": "audit.action.parent_subscription_create",
  "parent.subscription_subjects_change": "audit.action.parent_subscription_subjects_change",
  "parent.subscription_cancel": "audit.action.parent_subscription_cancel",
  "parent.olympiad_purchase": "audit.action.parent_olympiad_purchase",
};

const TRIGGER_OP_KEYS: Record<string, string> = {
  insert: "audit.action.row_insert",
  update: "audit.action.row_update",
  delete: "audit.action.row_delete",
};

// target_table values: written by app actions (news/olympiad_packages/
// wallpapers/feature_flags/system_settings/profiles/students/child_credentials)
// and by the fn_audit_row triggers attached in 011/014/015 + later migrations
// (child_subscriptions/payments/subscriptions/checkout_sessions/students/
// profiles/child_credentials/system_settings/feature_flags/subjects_pricing).
const ENTITY_KEYS: Record<string, string> = {
  profiles: "audit.entity.profiles",
  students: "audit.entity.students",
  child_credentials: "audit.entity.child_credentials",
  profile_roles: "audit.entity.profile_roles",
  parent_student_links: "audit.entity.parent_student_links",
  subscriptions: "audit.entity.subscriptions",
  child_subscriptions: "audit.entity.child_subscriptions",
  payments: "audit.entity.payments",
  checkout_sessions: "audit.entity.checkout_sessions",
  subjects_pricing: "audit.entity.subjects_pricing",
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

// Which (op) events each DB-trigger-audited table actually emits — used to
// build the curated "action" filter's trigger-form options (`insert:table`,
// `update:table`, `delete:table`). Mirrors the `after insert/update/delete on
// ...` clauses in supabase/sql (011/014/015 + the child-subscriptions/
// payments/checkout/students/profiles/child_credentials/system_settings/
// feature_flags/subjects_pricing migration). Keep in sync when a new trigger
// is attached.
const TRIGGER_TABLE_OPS: Record<string, readonly ("insert" | "update" | "delete")[]> = {
  profile_roles: ["insert", "delete"],
  parent_student_links: ["insert", "update", "delete"],
  subscriptions: ["insert", "update"],
  payments: ["insert", "update"],
  questions: ["insert", "update", "delete"],
  tests: ["insert", "update", "delete"],
  daily_task_packages: ["insert", "update", "delete"],
  mobile_app_versions: ["insert", "update", "delete"],
  child_subscriptions: ["insert", "update", "delete"],
  news: ["insert", "update", "delete"],
  olympiad_packages: ["insert", "update", "delete"],
  olympiad_purchases: ["insert", "update", "delete"],
  checkout_sessions: ["insert", "update"],
  students: ["insert", "update", "delete"],
  profiles: ["update", "delete"],
  child_credentials: ["insert", "update"],
  system_settings: ["update"],
  feature_flags: ["update"],
  subjects_pricing: ["insert", "update"],
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

// Curated action-filter options: every known app action code + every real
// `op:table` trigger-form combination (built from TRIGGER_TABLE_OPS), each
// labelled distinctly so entries are findable even though the table column
// itself just shows the generic "Created/Updated/Deleted".
type ActionOption = { value: string; label: string };

function appActionOptions(t: T, locale: string): ActionOption[] {
  return Object.keys(ACTION_KEYS)
    .map((value) => ({ value, label: t(ACTION_KEYS[value]) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}

function triggerActionOptions(t: T, locale: string): ActionOption[] {
  const opts: ActionOption[] = [];
  for (const [table, ops] of Object.entries(TRIGGER_TABLE_OPS)) {
    for (const op of ops) {
      opts.push({
        value: `${op}:${table}`,
        label: `${t(TRIGGER_OP_KEYS[op])} — ${entityLabel(table, t)}`,
      });
    }
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label, locale));
}

// ---------------------------------------------------------------------------
// Round 22: expandable "what changed" details.
// - UPDATE trigger rows: a diff of before_json/after_json (changed keys only).
// - INSERT trigger rows: key fields from after_json ("created:").
// - DELETE trigger rows: key fields from before_json ("removed:").
// - App-written rows (writeAuditLog): the metadata_json key/value list.
// Any key matching /password|token|secret|hash/i is redacted, never printed.
// ---------------------------------------------------------------------------

const REDACT_RE = /password|token|secret|hash/i;
const SKIP_DIFF_KEYS = new Set(["updated_at", "created_at"]);
const MAX_DETAIL_FIELDS = 20;
const VALUE_STR_CAP = 140;

function displayValue(key: string, v: unknown): string {
  if (REDACT_RE.test(key)) return "•••";
  if (v === null || v === undefined) return "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > VALUE_STR_CAP ? `${s.slice(0, VALUE_STR_CAP)}…` : s;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fieldRows(obj: unknown): { key: string; value: string }[] {
  if (!isPlainRecord(obj)) return [];
  return Object.entries(obj)
    .filter(([k]) => !SKIP_DIFF_KEYS.has(k))
    .slice(0, MAX_DETAIL_FIELDS)
    .map(([k, v]) => ({ key: k, value: displayValue(k, v) }));
}

function diffRows(before: unknown, after: unknown): { key: string; from: string; to: string }[] {
  if (!isPlainRecord(before) || !isPlainRecord(after)) return [];
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const out: { key: string; from: string; to: string }[] = [];
  for (const k of keys) {
    if (SKIP_DIFF_KEYS.has(k)) continue;
    const bv = before[k];
    const av = after[k];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    out.push({ key: k, from: displayValue(k, bv), to: displayValue(k, av) });
    if (out.length >= MAX_DETAIL_FIELDS) break;
  }
  return out;
}

function DetailsBody({ row, t }: { row: AuditRow; t: T }) {
  const trigger = row.action.match(/^(insert|update|delete):/);

  if (trigger) {
    const op = trigger[1];
    if (op === "update") {
      const rows = diffRows(row.before_json, row.after_json);
      if (rows.length === 0) {
        return <p className="audit-details-empty muted">{t("audit.details.noChanges")}</p>;
      }
      return (
        <ul className="audit-diff-list">
          {rows.map((r) => (
            <li key={r.key}>
              <code>{r.key}</code>
              {": "}
              <span className="audit-diff-old">{r.from}</span>
              {" → "}
              <span className="audit-diff-new">{r.to}</span>
            </li>
          ))}
        </ul>
      );
    }
    const obj = op === "insert" ? row.after_json : row.before_json;
    const rows = fieldRows(obj);
    if (rows.length === 0) {
      return <p className="audit-details-empty muted">{t("audit.details.none")}</p>;
    }
    return (
      <>
        <p className="audit-details-label">
          {t(op === "insert" ? "audit.details.created" : "audit.details.removed")}
        </p>
        <ul className="audit-kv-list">
          {rows.map((r) => (
            <li key={r.key}>
              <code>{r.key}</code>
              {": "}
              {r.value}
            </li>
          ))}
        </ul>
      </>
    );
  }

  const rows = fieldRows(row.metadata_json);
  if (rows.length === 0) {
    return <p className="audit-details-empty muted">{t("audit.details.none")}</p>;
  }
  return (
    <ul className="audit-kv-list">
      {rows.map((r) => (
        <li key={r.key}>
          <code>{r.key}</code>
          {": "}
          {r.value}
        </li>
      ))}
    </ul>
  );
}

type AuditRow = {
  id: string;
  created_at: string;
  actor_profile_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  severity: string;
  success: boolean;
  metadata_json: unknown;
  before_json: unknown;
  after_json: unknown;
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}

const SEVERITIES = ["info", "warning", "critical"] as const;
const SUCCESS_VALUES = ["true", "false"] as const;
const SCOPES = ["all", "staff", "external"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 50;

// Interpret a plain YYYY-MM-DD date input as Asia/Baku local time (UTC+4, no
// DST) and return its UTC ISO instant, or null if invalid. Using an explicit
// "+04:00" offset lets Date parse the correct instant regardless of the
// server process's own timezone.
function bakuDateBoundIso(raw: string, endOfDay: boolean): string | null {
  if (!DATE_RE.test(raw)) return null;
  const iso = endOfDay ? `${raw}T23:59:59.999+04:00` : `${raw}T00:00:00.000+04:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();

  const sp = (await searchParams) ?? {};

  // ---- Validated searchParams (every value is whitelisted/regex-checked
  // before it ever reaches a query — a hand-crafted request can never inject
  // an arbitrary filter shape). --------------------------------------------
  const rawEntity = first(sp, "entity");
  const entity = rawEntity && ENTITY_KEYS[rawEntity] ? rawEntity : "";

  const appOptions = appActionOptions(t, locale);
  const triggerOptions = triggerActionOptions(t, locale);
  const actionValueSet = new Set<string>([
    ...appOptions.map((o) => o.value),
    ...triggerOptions.map((o) => o.value),
  ]);
  const rawAction = first(sp, "action");
  const action = rawAction && actionValueSet.has(rawAction) ? rawAction : "";

  const rawSeverity = first(sp, "severity");
  const severity = (SEVERITIES as readonly string[]).includes(rawSeverity) ? rawSeverity : "";

  const rawSuccess = first(sp, "success");
  const success = (SUCCESS_VALUES as readonly string[]).includes(rawSuccess) ? rawSuccess : "";

  const rawScope = first(sp, "scope");
  const scope = (SCOPES as readonly string[]).includes(rawScope) ? rawScope : "all";

  const rawFrom = first(sp, "from").trim();
  const dateFrom = DATE_RE.test(rawFrom) ? rawFrom : "";
  const rawTo = first(sp, "to").trim();
  const dateTo = DATE_RE.test(rawTo) ? rawTo : "";
  const fromIso = dateFrom ? bakuDateBoundIso(dateFrom, false) : null;
  const toIso = dateTo ? bakuDateBoundIso(dateTo, true) : null;

  const rawTarget = first(sp, "target").trim();
  const target = UUID_RE.test(rawTarget) ? rawTarget : "";

  const pageRaw = Math.floor(Number(first(sp, "page")));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 0;

  // Resolve panel-staff profile ids (administrator + content_manager roles) —
  // used only for the actor-scope filter now (the old code hard-restricted
  // the WHOLE log to these ids; that gate is removed so parent/child/system
  // activity is visible by default).
  const { data: staffRows } = await supabase
    .from("profile_roles")
    .select("profile_id, roles!inner(code)")
    .in("roles.code", ["administrator", "content_manager"]);
  const staffIds = Array.from(
    new Set(
      (staffRows ?? []).map((r: any) => r.profile_id as string).filter(Boolean),
    ),
  );

  let logs: AuditRow[] = [];
  // scope === "staff" with zero resolved staff ids can never match anything —
  // skip the query rather than sending `.in("actor_profile_id", [])`, which
  // PostgREST rejects as an empty `in.()` list.
  if (!(scope === "staff" && staffIds.length === 0)) {
    let query = supabase
      .from("audit_logs")
      .select(
        "id, created_at, actor_profile_id, action, target_table, target_id, severity, success, metadata_json, before_json, after_json",
      );

    if (entity) query = query.eq("target_table", entity);
    if (action) query = query.eq("action", action);
    if (severity) query = query.eq("severity", severity);
    if (success) query = query.eq("success", success === "true");
    if (target) query = query.eq("target_id", target);
    if (fromIso) query = query.gte("created_at", fromIso);
    if (toIso) query = query.lte("created_at", toIso);

    if (scope === "staff") {
      query = query.in("actor_profile_id", staffIds);
    } else if (scope === "external" && staffIds.length > 0) {
      // Null actor (system/trigger writes with no resolvable actor) OR any
      // actor that is NOT a staff profile id.
      query = query.or(
        `actor_profile_id.is.null,actor_profile_id.not.in.(${staffIds.join(",")})`,
      );
    }
    // scope === "all": no actor filter at all.
    // scope === "external" with zero staff ids: every row already qualifies
    // (nobody is staff), so no extra filter is needed either.

    const { data: rows } = await query
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    logs = (rows ?? []) as AuditRow[];
  }

  // Resolve actor display names/emails for readability.
  const actorIds = Array.from(
    new Set(logs.map((r) => r.actor_profile_id).filter(Boolean) as string[]),
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

  // ---- Pagination + "clear all" href helpers --------------------------------
  const buildHref = (overrides: Record<string, string>): string => {
    const base: Record<string, string> = {
      entity,
      action,
      severity,
      success,
      scope: scope === "all" ? "" : scope,
      from: dateFrom,
      to: dateTo,
      target,
      page: page > 0 ? String(page) : "",
    };
    const merged = { ...base, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/audit?${qs}` : "/audit";
  };
  const hasActiveFilters =
    Boolean(entity || action || severity || success || target || dateFrom || dateTo) ||
    scope !== "all" ||
    page > 0;
  const hasNext = logs.length === PAGE_SIZE;
  const hasPrev = page > 0;
  const shownFrom = logs.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const shownTo = page * PAGE_SIZE + logs.length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.audit")}</h1>
        <p className="muted">{t("audit.subtitle2")}</p>
      </div>

      <form method="get" className="audit2-filter">
        <div className="audit-filter-row">
          <label htmlFor="audit-entity">{t("audit.filter.entity")}</label>
          <select id="audit-entity" name="entity" defaultValue={entity}>
            <option value="">{t("audit.filter.all")}</option>
            {entityOptions.map((o) => (
              <option key={o.table} value={o.table}>
                {o.label}
              </option>
            ))}
          </select>

          <label htmlFor="audit-action">{t("audit.filter.action")}</label>
          <select id="audit-action" name="action" defaultValue={action}>
            <option value="">{t("audit.filter.all")}</option>
            <optgroup label={t("audit.filter.actionGroupApp")}>
              {appOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("audit.filter.actionGroupTrigger")}>
              {triggerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          </select>

          <label htmlFor="audit-severity">{t("audit.filter.severity")}</label>
          <select id="audit-severity" name="severity" defaultValue={severity}>
            <option value="">{t("audit.filter.all")}</option>
            <option value="info">{t("audit.sev.info")}</option>
            <option value="warning">{t("audit.sev.warning")}</option>
            <option value="critical">{t("audit.sev.critical")}</option>
          </select>

          <label htmlFor="audit-success">{t("audit.filter.result")}</label>
          <select id="audit-success" name="success" defaultValue={success}>
            <option value="">{t("audit.filter.all")}</option>
            <option value="true">{t("audit.ok")}</option>
            <option value="false">{t("audit.failed")}</option>
          </select>

          <label htmlFor="audit-scope">{t("audit.filter.scope")}</label>
          <select id="audit-scope" name="scope" defaultValue={scope}>
            <option value="all">{t("audit.filter.all")}</option>
            <option value="staff">{t("audit.filter.scopeStaff")}</option>
            <option value="external">{t("audit.filter.scopeExternal")}</option>
          </select>
        </div>

        <div className="audit-filter-row">
          <label htmlFor="audit-from">{t("audit.filter.from")}</label>
          <input id="audit-from" type="date" name="from" defaultValue={dateFrom} />

          <label htmlFor="audit-to">{t("audit.filter.to")}</label>
          <input id="audit-to" type="date" name="to" defaultValue={dateTo} />

          <label htmlFor="audit-target">{t("audit.filter.target")}</label>
          <input
            id="audit-target"
            className="audit-target-input"
            type="text"
            name="target"
            defaultValue={target}
            placeholder="00000000-0000-0000-0000-000000000000"
          />

          <button type="submit" className="btn-ghost btn-sm">
            {t("audit.filter.apply")}
          </button>
          {hasActiveFilters && (
            <Link className="qfilters-clear" href="/audit">
              {t("qfilter.clear")}
            </Link>
          )}
        </div>
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
              <th>{t("audit.details")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
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
                <td>{r.success ? t("audit.ok") : t("audit.failed")}</td>
                <td>
                  <details className="audit-details">
                    <summary>{t("audit.details.toggle")}</summary>
                    <div className="audit-details-body">
                      <DetailsBody row={r} t={t} />
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.length > 0 && (
          <div className="qpager">
            <span className="qpager-info muted">
              {t("audit.page.showing")
                .replace("{from}", String(shownFrom))
                .replace("{to}", String(shownTo))}
            </span>
            <nav className="qpager-nav" aria-label="pagination">
              {hasPrev ? (
                <Link className="qpage-link" href={buildHref({ page: page > 1 ? String(page - 1) : "" })}>
                  {t("qpage.prev")}
                </Link>
              ) : (
                <span className="qpage-link disabled">{t("qpage.prev")}</span>
              )}
              {hasNext ? (
                <Link className="qpage-link" href={buildHref({ page: String(page + 1) })}>
                  {t("qpage.next")}
                </Link>
              ) : (
                <span className="qpage-link disabled">{t("qpage.next")}</span>
              )}
            </nav>
          </div>
        )}
      </section>
    </div>
  );
}
