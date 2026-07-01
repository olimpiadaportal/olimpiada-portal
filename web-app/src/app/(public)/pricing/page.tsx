import { getT } from "@/i18n/server";

const PLANS = [
  { key: "weekly", popular: false },
  { key: "monthly", popular: true },
  { key: "yearly", popular: false },
] as const;

export default async function PricingPage() {
  const t = await getT();
  return (
    <section className="prose">
      <h1>{t("pricing.title")}</h1>
      <p className="lead">{t("pricing.intro")}</p>
      <p className="muted">{t("pricing.subjectsNote")}</p>

      <div className="price-grid">
        {PLANS.map(({ key, popular }) => {
          const save = t(`pricing.plan.${key}.save`);
          return (
            <div
              className={popular ? "price-card popular" : "price-card"}
              key={key}
            >
              <strong>{t(`pricing.plan.${key}.name`)}</strong>
              <div className="price-amount">{t(`pricing.plan.${key}.price`)}</div>
              <div className="price-unit">{t(`pricing.plan.${key}.unit`)}</div>
              {save ? <span className="price-save">{save}</span> : null}
              <p className="muted">{t(`pricing.plan.${key}.note`)}</p>
              <p className="muted">{t("pricing.perChild")}</p>
            </div>
          );
        })}
      </div>

      <div className="price-info">
        <div className="price-callout">{t("pricing.trialLine")}</div>
        <div className="price-callout">
          <strong>{t("pricing.siblingTitle")}</strong>
          <p className="muted">{t("pricing.siblingBody")}</p>
        </div>
        <div className="price-callout">{t("pricing.disclaimer")}</div>
      </div>
    </section>
  );
}
