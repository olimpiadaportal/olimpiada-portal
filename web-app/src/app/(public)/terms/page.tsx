import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/i18n/server";

// Public PAYMENT TERMS. Reachable without a session and must never move: the
// register form links here beside the privacy policy, the checkout links here,
// and a bank reviewing a dispute needs a URL that still resolves months later.
//
// WHY THIS IS NOT PART OF THE PRIVACY POLICY. That document explains what
// personal data we hold and who may see it. Refund and renewal rules are
// COMMERCIAL terms. Folding one into the other weakens both — a parent looking
// for the refund rule would not think to open a privacy policy, and a regulator
// reading the privacy policy should not have to wade through billing.
//
// WHY IT EXISTS AT ALL. docs/STORE_PAYMENTS_COMPLIANCE.md §8.4: no EU-style
// cooling-off right exists in Azerbaijan, so our refund policy is CONTRACTUAL
// and must be written explicitly, in Azerbaijani, before the parent authorises
// the first charge. Visa and Mastercard separately require the refund and
// cancellation policy to be disclosed at the point of sale — undisclosed, a
// chargeback is lost by default.
//
// Every statement here is something the code already enforces:
//   * no refunds ................ cancelChildSubscriptionCore
//   * access to the period end .. recompute_child_access
//   * renewal is manual ......... ABB has not approved card-on-file recurring
//   * per-subject periods ....... migration 109
//   * lifetime olympiad access .. purchases are never deleted
//   * parent-only purchasing .... every checkout guard
export const metadata: Metadata = {
  title: "Payment Terms — OlympIQ",
  description:
    "How payment works for OlympIQ subscriptions and olympiad packages: refunds, renewal, cancellation, per-subject periods and currency.",
};

export default async function TermsPage() {
  const t = await getT();

  return (
    <section className="pp-page">
      <header className="pp-head">
        <h1>{t("terms.page.title")}</h1>
        <p className="muted">{t("terms.page.intro")}</p>
      </header>

      <section className="pp-sec" id="terms-refund">
        <h2>{t("terms.h.refund")}</h2>
        <p>{t("terms.norefund")}</p>
      </section>

      <section className="pp-sec" id="terms-renewal">
        <h2>{t("terms.h.renewal")}</h2>
        <p>{t("terms.manual")}</p>
        <p>{t("terms.cancel.how")}</p>
      </section>

      <section className="pp-sec" id="terms-cycles">
        <h2>{t("terms.h.cycles")}</h2>
        <p>{t("terms.percycle")}</p>
      </section>

      <section className="pp-sec" id="terms-olympiad">
        <h2>{t("terms.h.olympiad")}</h2>
        <p>{t("terms.olympiad")}</p>
      </section>

      <section className="pp-sec" id="terms-payment">
        <h2>{t("terms.h.payment")}</h2>
        <p>{t("terms.currency")}</p>
        <p>{t("terms.payment.who")}</p>
        <p>{t("terms.payment.card")}</p>
      </section>

      <section className="pp-sec" id="terms-contact">
        <h2>{t("terms.contact.title")}</h2>
        <p>{t("terms.contact.body")}</p>
        <Link className="btn btn-ghost" href="/contact">
          {t("terms.contact.cta")}
        </Link>
      </section>
    </section>
  );
}
