import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { getChildResolution, getParent, maySeePurchaseUi } from "@/lib/auth/session";
import { getPublicSubjectPricing } from "@/lib/pricing";
import { parsePlanParams } from "@/lib/pricingConfigurator";
import { PricingConfigurator } from "@/components/PricingConfigurator";
import { PublicOlympiadPackages } from "@/components/PublicOlympiadPackages";
import { Skeleton, SkeletonCard, skeletonStyles as s } from "@/components/skeletons";

// /services (canonical since the Services rename; /pricing 308-redirects here
// via next.config.mjs).
//
// The three static Weekly/Monthly/Yearly plan cards were replaced by an
// interactive configurator: pick subjects → pick an interval → see a live
// total → continue into the existing flow. All prices come from
// `subjects_pricing` (getPublicSubjectPricing) — the very table the checkout
// RPCs price from — so there is ONE source of truth and no hardcoded number
// anywhere on this page.
//
// The configurator is INFORMATIONAL. It hands off subject ids + an interval in
// the query string and nothing else; the purchase flow re-prices server-side
// and applies the sibling discount there.

/** Loading shape for the configurator (mirrors the .pcfg two-column grid). */
function ConfiguratorSkeleton() {
  return (
    <div className={s.stack} style={{ gap: 20 }} role="status" aria-busy="true">
      <div className="pcfg">
        <SkeletonCard r={20} pad="24px">
          <div className={s.stack} style={{ gap: 14 }}>
            <Skeleton w={160} h={16} />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={52} r={14} />
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard r={20} pad="24px">
          <div className={s.stack} style={{ gap: 14 }}>
            <Skeleton w={150} h={16} />
            <Skeleton h={44} r={999} />
            <Skeleton h={140} r={16} />
            <Skeleton h={48} r={14} />
          </div>
        </SkeletonCard>
      </div>
    </div>
  );
}

/**
 * Async island so the header + olympiad band paint while the subject catalog
 * loads, and so a slow/failed catalog read never blanks the page.
 */
async function ConfiguratorSection({
  search,
}: {
  search: {
    plan?: string | string[];
    subjects?: string | string[];
    interval?: string | string[];
  };
}) {
  const t = await getT();
  const catalog = await getPublicSubjectPricing();

  // Error state: the catalog could not be read at all.
  if (!catalog.ok) {
    return <div className="pcfg-notice pcfg-notice-error">{t("cfg.loadError")}</div>;
  }
  // Empty state: nothing is priced/active right now.
  if (catalog.subjects.length === 0) {
    return <div className="pcfg-notice">{t("cfg.noSubjects")}</div>;
  }

  // A shared/bookmarked link may carry a selection. It is USER INPUT: every id
  // is UUID-shape-checked, de-duplicated, capped, and whitelisted against the
  // live catalog — unknown or archived subjects are dropped silently.
  // Migration 109: the hand-off now carries a cycle PER SUBJECT
  // (`?plan=<uuid>:week,…`); parsePlanParams still accepts the older
  // `?subjects=…&interval=…` pair so every shared link keeps preselecting.
  const { plan } = parsePlanParams(search, catalog.subjects);

  // Who is looking? A signed-in CHILD gets no purchase CTA at all (children
  // never purchase — hard product rule). A signed-in parent goes straight into
  // the existing add-child purchase flow; everyone else registers first.
  // getParent/getChild are request-cached and already resolved by the public
  // layout, so this costs nothing extra.
  // Round 50: maySeePurchaseUi() fails CLOSED — a child OR an unresolved role
  // gets no CTA. getChild() alone returned null on a transient RPC error, which
  // showed a signed-in child the purchase path.
  // Round 51 (audit F4): the payment kill switch also drops the CTA — the DB
  // rejects checkout writes in mode 'off', so a live CTA would only dead-end.
  const [parent, mayPurchase, { mode }] = await Promise.all([
    getParent(),
    maySeePurchaseUi(),
    getPaymentModeInfo(),
  ]);
  const paymentsOff = mode === "off";
  const ctaBasePath =
    !mayPurchase || paymentsOff ? null : parent ? "/children/new" : "/register";

  return (
    <PricingConfigurator
      subjects={catalog.subjects}
      initialPlan={plan}
      ctaBasePath={ctaBasePath}
      ctaNoteKey={paymentsOff && mayPurchase ? "gate.paymentsOff" : undefined}
    />
  );
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    subjects?: string | string[];
    interval?: string | string[];
  }>;
}) {
  // Round 51 (audit F12): a signed-in CHILD is redirected off the pricing
  // surface entirely — mobile already hard-blocks students from its pricing
  // screen, and "children can never purchase" means no priced basket either.
  // An UNKNOWN resolution stays (fail-closed CTA suppression covers it).
  if ((await getChildResolution()).kind === "yes") redirect("/child");

  const t = await getT();
  // launch_promo flag gates the promotional/trial MESSAGING. The actual trial
  // behavior stays governed server-side by launch_promo_config (the RPCs).
  const promoOn = await isFeatureEnabled("launch_promo");
  const search = await searchParams;

  return (
    <section className="pricing2-page">
      <header className="pricing-head">
        <h1>{t("pricing2.title")}</h1>
        <p className="pricing-sub">{t("pricing2.sub")}</p>
        {promoOn && (
          <span className="pricing2-promo">{t("pricing.trialLine")}</span>
        )}
      </header>

      <Suspense fallback={<ConfiguratorSkeleton />}>
        <ConfiguratorSection search={search} />
      </Suspense>

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
          {/* Informational only: the sibling discount depends on how many
              children the signed-in parent has, so it is NEVER folded into the
              configurator's total — the server applies it at checkout. */}
          <p>{t("pricing2.sibling.body")}</p>
        </div>
      </aside>

      {/* Round 49: the old "these are sample prices" line (pricing2.note) was
          written for the removed ≈-cards and now contradicts the configurator
          above it, which shows exact 2-decimal list prices read from
          subjects_pricing. cfg.serverNote already tells the visitor the final
          amount — including any family discount — is computed at checkout. */}

      {/* Active olympiad packages — the shared public band (same component as
          the landing page section), below the subscription plans. */}
      <PublicOlympiadPackages />
    </section>
  );
}
