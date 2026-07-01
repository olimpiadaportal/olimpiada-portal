import { getT } from "@/i18n/server";

export default async function OlympiadPreparationPage() {
  const t = await getT();
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
