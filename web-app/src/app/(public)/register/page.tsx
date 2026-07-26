import Link from "next/link";
import { getT, getLocale } from "@/i18n/server";
import { maySeePurchaseUi } from "@/lib/auth/session";
import { BackLink } from "@/components/BackLink";
import { ParentAuthForm } from "@/components/ParentAuthForm";
import { getPublicSubjectPricing } from "@/lib/pricing";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  computeQuote,
  formatAzn,
  INTERVAL_LABEL_KEY,
  INTERVAL_PER_KEY,
  parseSelectionParams,
} from "@/lib/pricingConfigurator";

const KEYS = [
  "parent.auth.firstName", "parent.auth.lastName",
  "parent.auth.email", "parent.auth.password",
  "parent.auth.phone", "parent.auth.phonePh", "parent.auth.phoneCountry",
  "parent.auth.phoneSearch",
  "parent.auth.login", "parent.auth.register", "parent.auth.submitting",
  "parent.err.email", "parent.err.password", "parent.err.required",
  "parent.err.phone",
  "parent.err.invalid", "parent.err.createFailed", "parent.err.emailExists",
  "parent.auth.firstNamePh", "parent.auth.lastNamePh",
  "parent.auth.emailPh", "parent.auth.passwordPh",
  "auth.showPassword", "auth.hidePassword",
];

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ subjects?: string | string[]; interval?: string | string[] }>;
}) {
  const t = await getT();
  const locale = await getLocale();
  // Children NEVER see purchase UI (non-negotiable product rule). A signed-in
  // child can reach /register?subjects=…&interval=… by following a shared link,
  // and without this the priced basket recap would render for them — every
  // other public surface already gates on getChild(). Round 49 review finding.
  const mayPurchase = await maySeePurchaseUi();
  const dict: Record<string, string> = {};
  for (const k of KEYS) dict[k] = t(k);

  // Hand-off from the /services configurator: `?subjects=<uuid,…>&interval=<iv>`.
  // Treated as untrusted input — validated against the LIVE subject catalog
  // (UUID shape, de-duplicated, capped, unknown/archived ids dropped silently),
  // then shown back as a read-only recap so the visitor's choice visibly
  // survives the jump into registration. Nothing here is billable: the amount
  // is informational and the server re-prices at checkout.
  const catalog = await getPublicSubjectPricing();
  const { subjectIds, interval } = parseSelectionParams(
    await searchParams,
    catalog.subjects,
  );
  const quote = computeQuote(catalog.subjects, subjectIds, interval);

  return (
    <section className="prose" style={{ maxWidth: 440 }}>
      <BackLink label={t("nav.back")} />
      <p className="section-eyebrow">{t("app.brand")}</p>
      <h1>{t("register.title")}</h1>
      <p className="muted">{t("parent.auth.registerNote")}</p>

      {quote.hasSelection && mayPurchase && (
        <aside className="pcfg-recap">
          <p className="pcfg-recap-title">{t("cfg.recap.title")}</p>
          <ul className="pcfg-recap-list">
            {quote.lines.map((line) => (
              <li key={line.id}>
                <span>{subjectLabel(t, line.code, line.name)}</span>
                <span className="pcfg-recap-price">
                  {line.price === null ? t("cfg.unpriced") : formatAzn(line.price, locale)}
                </span>
              </li>
            ))}
          </ul>
          <p className="pcfg-recap-total">
            <span>
              {t("cfg.totalLabel")} · {t(INTERVAL_LABEL_KEY[interval])}
            </span>
            <strong>
              {formatAzn(quote.total, locale)} {t(INTERVAL_PER_KEY[interval])}
            </strong>
          </p>
          <p className="pcfg-recap-note">{t("cfg.recap.note")}</p>
        </aside>
      )}

      <ParentAuthForm mode="register" dict={dict} locale={locale} />
      <p className="muted" style={{ marginTop: 18 }}>
        {t("parent.auth.haveAccount")} <Link href="/login">{t("nav.login")}</Link>
      </p>
    </section>
  );
}
