import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";

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

export default async function AuditPage() {
  await requireAdmin();
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();

  // audit_logs is admin-read-only via RLS. Read the most recent entries.
  const { data: rows } = await supabase
    .from("audit_logs")
    .select(
      "id, created_at, actor_profile_id, action, target_table, target_id, severity, success",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  const logs = (rows ?? []) as any[];

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

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("nav.audit")}</h1>
        <p className="muted">{t("audit.subtitle")}</p>
      </div>

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
                <td className="muted">{r.target_table ?? "—"}</td>
                <td>{r.action}</td>
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
