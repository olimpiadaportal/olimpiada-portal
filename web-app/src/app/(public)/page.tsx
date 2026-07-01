import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function HomePage() {
  const t = await getT();
  const features = [
    ["home.f1Title", "home.f1Desc"],
    ["home.f2Title", "home.f2Desc"],
    ["home.f3Title", "home.f3Desc"],
    ["home.f4Title", "home.f4Desc"],
  ];
  return (
    <>
      <section className="hero">
        <h1>{t("home.heroTitle")}</h1>
        <p className="lead">{t("home.heroLead")}</p>
        <div className="site-cta" style={{ marginTop: 16 }}>
          <Link className="btn" href="/register">
            {t("home.ctaStart")}
          </Link>
          <Link className="btn-ghost" href="/subjects">
            {t("home.ctaSubjects")}
          </Link>
        </div>
      </section>

      <div className="grid">
        {features.map(([titleKey, descKey]) => (
          <div className="card" key={titleKey}>
            <strong>{t(titleKey)}</strong>
            <p className="muted">{t(descKey)}</p>
          </div>
        ))}
      </div>
    </>
  );
}
