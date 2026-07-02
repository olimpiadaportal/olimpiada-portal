import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";

const PLANS = [
  { key: "weekly", popular: false },
  { key: "monthly", popular: true },
  { key: "yearly", popular: false },
] as const;

export default async function PricingPage() {
  const t = await getT();
  // launch_promo flag gates the promotional/trial MESSAGING. The actual trial
  // behavior stays governed server-side by launch_promo_config (the RPCs).
  const promoOn = await isFeatureEnabled("launch_promo");
  return (
    <section className="prose">
      <h1>{t("pricing.title")}</h1>
      <p className="lead">{t("pricing.intro")}</p>
      <p className="muted">{t("pricing.subjectsNote")}</p>

      {/* Three plans side-by-side; monthly is the featured column. */}
      <div className="price-row">
        {PLANS.map(({ key, popular }) => {
          const saveKey = `pricing.plan.${key}.save`;
          const save = t(saveKey);
          const hasSave = save && save !== saveKey;
          return (
            <div
              className={popular ? "price-col featured" : "price-col"}
              key={key}
            >
              <strong>{t(`pricing.plan.${key}.name`)}</strong>
              <div className="price-amount">{t(`pricing.plan.${key}.price`)}</div>
              <div className="price-unit">{t(`pricing.plan.${key}.unit`)}</div>
              {hasSave ? <span className="price-save">{save}</span> : null}
              <p className="muted">{t(`pricing.plan.${key}.note`)}</p>
              <p className="muted">{t("pricing.perChild")}</p>
            </div>
          );
        })}
      </div>

      <div className="price-info">
        {promoOn && <div className="price-callout">{t("pricing.trialLine")}</div>}
        <div className="price-callout">
          <strong>{t("pricing.siblingTitle")}</strong>
          <p className="muted">{t("pricing.siblingBody")}</p>
        </div>
        <div className="price-callout">{t("pricing.disclaimer")}</div>
      </div>
    </section>
  );
}
