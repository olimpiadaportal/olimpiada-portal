import { getT } from "@/i18n/server";

const SECTIONS = ["mission", "offer", "audience", "trust"] as const;

export default async function AboutPage() {
  const t = await getT();
  return (
    <section className="prose">
      <h1>{t("about.title")}</h1>
      <div className="about-grid">
        {SECTIONS.map((s) => (
          <div className="about-section" key={s}>
            <h2>{t(`about.${s}.title`)}</h2>
            <p>{t(`about.${s}.body`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
