import { isSupabaseConfigured } from "@/lib/env";
import { requirePanelAccess } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { AdminOverview, type AdminOverviewData } from "@/components/AdminOverview";

export default async function DashboardPage() {
  // Same guard as every other protected page — never rely on the layout alone.
  const ctx = await requirePanelAccess();
  const t = await getT();

  // R9 (T6) — real platform overview via the admin-only RPC (request-scoped
  // client; the RPC re-checks admin in-body). Content managers pass the panel
  // guard but would get an RPC error, so we don't even call it for them — the
  // dashboard simply renders without the overview section. Any error → null.
  let overview: AdminOverviewData | null = null;
  if (ctx.isAdmin && isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("get_admin_platform_overview");
      if (!error && data && typeof data === "object" && !Array.isArray(data)) {
        overview = data as AdminOverviewData;
      }
    } catch {
      overview = null;
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("dashboard.title")}</h1>
        <p className="muted">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid">
        <section className="card">
          <h3>{t("dashboard.signedInAs")}</h3>
          <p className="muted">{ctx?.email ?? "—"}</p>
          <span className="pill pill-ok">
            {ctx?.isAdmin
              ? t("common.administrator")
              : t("common.contentManager")}
          </span>
        </section>

        <section className="card">
          <h3>{t("dashboard.backend")}</h3>
          <p className="muted">{t("dashboard.backendDesc")}</p>
          <span className={isSupabaseConfigured ? "pill pill-ok" : "pill pill-warn"}>
            {isSupabaseConfigured
              ? t("backend.configured")
              : t("backend.notConfigured")}
          </span>
        </section>

        <section className="card">
          <h3>{t("dashboard.taxonomyCard")}</h3>
          <p className="muted">{t("dashboard.taxonomyCardDesc")}</p>
        </section>
      </div>

      {overview && <AdminOverview data={overview} t={t} />}
    </div>
  );
}
