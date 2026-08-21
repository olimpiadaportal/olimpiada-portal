"use client";

// The last step before the bank: what the parent sees, and the form that leaves.
//
// ONE PAYMENT STEP. When the server action that opened the checkout already
// signed it — the normal path, since the plan is not applied until the money
// arrives — this renders the departure form directly and the parent clicks once.
// The shape it replaced asked for "Pay now" and then, on the next render, asked
// for "Pay now" again; the first click charged nothing and the second was the
// real one, so a parent was asked to pay twice for one change.
//
// The RESUME path is the exception and is honest about it. A checkout the parent
// opened on an earlier visit is picked up from the subscribe page, and its
// fields cannot be signed while the page renders: signing writes an audit row,
// and a side effect that rides on a render fires from a prefetch, a crawler or a
// double-render. So resuming is a POST ("continue this payment") that signs, and
// what comes back is the same single departure button.
//
// THE DEPARTURE IS A FULL HTTP REDIRECT. A plain form whose action is the
// ACQUIRER'S OWN ORIGIN, submitted by the person: a top-level navigation away
// from this site, not an iframe and not a fetch. That is what keeps us on PCI
// DSS SAQ A (docs/STORE_PAYMENTS_COMPLIANCE.md section 8.3 rule 1), and there is
// deliberately no auto-submitting script.
//
// THE FIELDS ARE PROTOCOL FIELDS. AMOUNT, CURRENCY, ORDER, TERMINAL, TIMESTAMP,
// NONCE, P_SIGN and the rest, all built and signed server-side. There is no
// input the cardholder types into — no card number, no expiry, no security code
// — here or anywhere else in this codebase, and there must never be.
//
// It also states the amount and currency before the parent authorises anything:
// Azerbaijani consumer-disclosure practice expects the price, the interval and
// the renewal behaviour to be clear in Azerbaijani before the first charge
// (section 8.4). The number comes from the server, never from this component's
// own arithmetic.
import { useActionState } from "react";
import { startPlanCheckout, type CheckoutRedirectState } from "@/lib/payments/checkoutService";
import { useLocale, useT } from "@/i18n/I18nProvider";
import { formatAzn } from "@/lib/pricingConfigurator";

/** A checkout the server has already signed: post these fields and leave. */
export type SignedCheckout = {
  action: string;
  fields: Record<string, string>;
  amount: number;
};

export function CheckoutRedirect({
  order,
  amount,
  signed,
}: {
  /** The merchant order, for the RESUME path. A lookup key, never a price. */
  order: string;
  /** Server-computed amount to show before the parent authorises the charge. */
  amount?: number | null;
  /**
   * Present when the action that opened this checkout also signed it — the
   * normal path. Absent for a resume, which has to sign on a click.
   */
  signed?: SignedCheckout | null;
}) {
  // useT() reads the app-wide provider dictionary, so this component can never
  // be broken by a page forgetting to list its keys in a local KEYS array.
  const t = useT();
  const locale = useLocale();
  const [state, action, pending] = useActionState<CheckoutRedirectState, FormData>(
    startPlanCheckout,
    null,
  );

  // A signature is in hand — either handed in with the props, or produced by the
  // resume action a moment ago. Either way the next click leaves for the bank.
  const ready: SignedCheckout | null = state?.ok
    ? { action: state.action, fields: state.fields, amount: state.amount }
    : (signed ?? null);

  if (ready) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <p>
          <strong>{t("checkout.title")}</strong>
        </p>
        <div className="quote-row">
          <span className="q-label">{t("checkout.amount")}</span>
          <span>{formatAzn(ready.amount, locale)}</span>
        </div>
        <p className="muted">{t("checkout.redirectNote")}</p>
        {/* The full-page redirect. `action` is the acquirer's origin, listed
            explicitly in the CSP's form-action (next.config.mjs). */}
        <form method="POST" action={ready.action} acceptCharset="UTF-8">
          {Object.entries(ready.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button className="btn" type="submit">
            {t("checkout.continue")}
          </button>
        </form>
      </div>
    );
  }

  // RESUME: an unfinished checkout from an earlier visit. Nothing was granted
  // for it, so this is an offer to finish, not a debt.
  return (
    <form action={action} className="card" style={{ marginTop: 14 }}>
      <input type="hidden" name="order" value={order} />
      <p>
        <strong>{t("checkout.title")}</strong>
      </p>
      {typeof amount === "number" && (
        <div className="quote-row">
          <span className="q-label">{t("checkout.amount")}</span>
          <span>{formatAzn(amount, locale)}</span>
        </div>
      )}
      <p className="muted">{t("checkout.intro")}</p>
      {state && state.ok === false && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? t("checkout.starting") : t("checkout.resume")}
      </button>
    </form>
  );
}
