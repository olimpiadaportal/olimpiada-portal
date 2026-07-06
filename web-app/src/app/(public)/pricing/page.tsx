import Link from "next/link";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { getPerSubjectPrices, type PlanInterval } from "@/lib/pricing";

const PLANS: { key: "weekly" | "monthly" | "yearly"; interval: PlanInterval }[] = [
  { key: "weekly", interval: "week" },
  { key: "monthly", interval: "month" },
  { key: "yearly", interval: "year" },
];

export default async function PricingPage() {
  const t = await getT();
  // launch_promo flag gates the promotional/trial MESSAGING. The actual trial
  // behavior stays governed server-side by launch_promo_config (the RPCs).
  const promoOn = await isFeatureEnabled("launch_promo");
  // M8: real per-subject prices from subjects_pricing (the table checkout
  // prices from) — the copy strings carry a {price} placeholder, never numbers.
  const prices = await getPerSubjectPrices();

  return (
    <section className="pricing2-page">
      <header className="pricing-head">
        <h1>{t("pricing2.title")}</h1>
        <p className="pricing-sub">{t("pricing2.sub")}</p>
        {promoOn && (
          <span className="pricing2-promo">{t("pricing.trialLine")}</span>
        )}
      </header>

      <div className="plans-grid">
        {PLANS.map(({ key, interval }) => {
          const featured = key === "monthly";
          return (
            <article
              key={key}
              className={featured ? "plan-card featured" : "plan-card"}
            >
              {featured && (
                <span className="plan-badge">{t("pricing2.popular")}</span>
              )}
              <h2 className="plan-name">{t(`pricing2.${key}.name`)}</h2>
              <div className="plan-price">
                {t(`pricing2.${key}.price`).replace(
                  "{price}",
                  String(prices[interval]),
                )}
              </div>
              <div className="plan-per">{t(`pricing2.${key}.per`)}</div>
              <p className="plan-desc">{t(`pricing2.${key}.desc`)}</p>
              <ul className="plan-benefits">
                <li>{t(`pricing2.${key}.b1`)}</li>
                <li>{t(`pricing2.${key}.b2`)}</li>
                <li>{t(`pricing2.${key}.b3`)}</li>
              </ul>
              <Link
                href="/register"
                className={featured ? "plan-cta primary" : "plan-cta"}
              >
                {t(`pricing2.${key}.cta`)}
              </Link>
            </article>
          );
        })}
      </div>

      <aside className="sibling-box">
        <span className="sibling-icon" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <div>
          <strong>{t("pricing2.sibling.title")}</strong>
          <p>{t("pricing2.sibling.body")}</p>
        </div>
      </aside>

      <p className="pricing-note">{t("pricing2.note")}</p>
    </section>
  );
}
