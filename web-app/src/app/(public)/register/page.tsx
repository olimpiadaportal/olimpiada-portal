import Link from "next/link";
import { getT, getLocale } from "@/i18n/server";
import { maySeePurchaseUi } from "@/lib/auth/session";
import { BackLink } from "@/components/BackLink";
import { ParentAuthForm } from "@/components/ParentAuthForm";
import { getPublicSubjectPricing } from "@/lib/pricing";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  buildPlanQuery,
  computePlanQuote,
  formatAzn,
  INTERVAL_LABEL_KEY,
  parsePlanParams,
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
  // The "check your inbox" panel the form swaps to after a successful
  // registration — it renders in place rather than redirecting, so the address
  // the user just typed is still in component state and never has to be asked
  // for again. See ParentAuthForm.
  "verify.title", "verify.bodyTo", "verify.hint", "verify.resendPrompt",
  "verify.resend", "verify.resent", "verify.resendFailed", "nav.login",
];

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string | string[];
    subjects?: string | string[];
    interval?: string | string[];
  }>;
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

  // Hand-off from the /services configurator: `?plan=<uuid>:<cycle>,…` (the
  // older `?subjects=…&interval=…` pair still parses). Treated as untrusted
  // input — validated against the LIVE subject catalog (UUID shape,
  // de-duplicated, capped, unknown/archived ids dropped silently), then shown
  // back as a read-only recap so the visitor's choice visibly survives the jump
  // into registration. Nothing here is billable: the amount is informational and
  // the server re-prices at checkout.
  const catalog = await getPublicSubjectPricing();
  const { plan } = parsePlanParams(await searchParams, catalog.subjects);
  const quote = computePlanQuote(catalog.subjects, plan);
  // Rebuilt (never echoed) so the basket — cycles included — reaches Add-Child
  // after the account exists. Ids and cycles only; a price never travels.
  const planQuery = buildPlanQuery(plan);

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
            {/* Each row names the cycle the visitor chose FOR THAT SUBJECT —
                the recap is the proof their per-subject choice survived. */}
            {quote.lines.map((line) => (
              <li key={line.id}>
                <span>
                  {subjectLabel(t, line.code, line.name)} ·{" "}
                  {t(INTERVAL_LABEL_KEY[line.interval])}
                </span>
                <span className="pcfg-recap-price">
                  {line.price === null ? t("cfg.unpriced") : formatAzn(line.price, locale)}
                </span>
              </li>
            ))}
          </ul>
          <p className="pcfg-recap-total">
            {/* No period suffix: the basket may span several cycles. */}
            <span>{t("plan.dueToday")}</span>
            <strong>{formatAzn(quote.dueToday, locale)}</strong>
          </p>
          <p className="pcfg-recap-note">{t("cfg.recap.note")}</p>
          <p className="pcfg-recap-note">
            <Link href={`/children/new${planQuery}`}>{t("cfg.ctaNoteParent")}</Link>
          </p>
        </aside>
      )}

      <ParentAuthForm mode="register" dict={dict} locale={locale} />

      {/* Point of consent. Registration is where a parent starts creating child
          records, so the policy has to be one tap away right here — not only in
          the footer. Presentational only: no checkbox, no extra field and no
          change to what the form submits or validates. */}
      <p className="muted" style={{ marginTop: 14 }}>
        {t("privacy.consentPre")}{" "}
        <Link href="/privacy">{t("privacy.consentLink")}</Link>
        {t("privacy.consentPost")}{" "}
        {/* The PAYMENT terms belong at the same tap depth as the privacy
            policy: a parent registering is about to create children and then
            pay for them, and the refund rule is contractual here (no statutory
            cooling-off right exists in Azerbaijan). */}
        <Link href="/terms">{t("terms.page.title")}</Link>
      </p>

      <p className="muted" style={{ marginTop: 18 }}>
        {t("parent.auth.haveAccount")} <Link href="/login">{t("nav.login")}</Link>
      </p>
    </section>
  );
}
