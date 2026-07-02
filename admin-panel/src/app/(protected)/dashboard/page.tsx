import { isSupabaseConfigured } from "@/lib/env";
import { requirePanelAccess } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";

export default async function DashboardPage() {
  // Same guard as every other protected page — never rely on the layout alone.
  const ctx = await requirePanelAccess();
  const t = await getT();

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
    </div>
  );
}
