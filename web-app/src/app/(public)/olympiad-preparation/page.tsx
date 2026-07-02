import { notFound } from "next/navigation";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";

export default async function OlympiadPreparationPage() {
  const t = await getT();
  // Module gate (admin Settings → olympiad_module): the marketing page 404s
  // while the module is off — same pattern as the news_public gate.
  if (!(await isFeatureEnabled("olympiad_module"))) notFound();
  return (
    <section className="prose">
      <h1>{t("oly.title")}</h1>
      <p className="lead">{t("oly.lead")}</p>
      <p>{t("oly.p1")}</p>
      <div className="grid">
        <div className="card">
          <strong>{t("oly.lifetime")}</strong>
        </div>
        <div className="card">
          <p className="muted">{t("oly.attempt")}</p>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        {t("oly.note")}
      </p>
    </section>
  );
}
