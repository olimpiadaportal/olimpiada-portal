import { getT } from "@/i18n/server";

export default async function SubjectsPage() {
  const t = await getT();
  const subjects = ["subject.math", "subject.science", "subject.logic", "subject.english"];
  return (
    <section className="prose">
      <h1>{t("subjects.title")}</h1>
      <p className="lead">{t("subjects.lead")}</p>
      <div className="grid">
        {subjects.map((k) => (
          <div className="card" key={k}>
            <strong>{t(k)}</strong>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        {t("subjects.note")}
      </p>
    </section>
  );
}
