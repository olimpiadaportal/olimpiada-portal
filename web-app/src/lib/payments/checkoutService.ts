"use server";

// The parent-facing checkout server action. WEB ONLY.
//
// One action, one job: RESUME a checkout the parent already owns — one opened on
// an earlier visit and never finished — and hand back the signed field set for a
// FULL-PAGE REDIRECT POST to the acquirer's hosted page. It authorizes first,
// re-establishes every fact about the order from the database, and never sees an
// amount from the client — see checkoutCore.ts for why that is structural rather
// than a check.
//
// It is not how a NEW payment starts. Since migration 125 the plan actions open
// the intent and sign it in one step, so the parent meets one payment step with
// an honest label; this exists for the visit afterwards, when a signature can no
// longer be produced during a render (signing writes an audit row, and a side
// effect on a render fires from a prefetch or a crawler).
//
// There is no sibling action that takes a price, a subject list or a plan. The
// amount a parent pays is written onto `checkout_sessions` by the quote RPC that
// computed it, inside that RPC's own transaction (audit invariant H7: the
// preview and the charge are one computation), and RE-QUOTED before it is
// signed — this action can only ever read the answer back.
//
// NOT A MOBILE SURFACE. Nothing under app/api/mobile imports this file, and
// nothing may: the apps are purchase-silent by architecture
// (docs/STORE_PAYMENTS_COMPLIANCE.md section 4).
import { requireParent } from "@/lib/auth/session";
import { getLocale, getT } from "@/i18n/server";
import { rateLimitAllow } from "@/lib/rateLimit";
import {
  buildPlanCheckoutRedirect,
  CHECKOUT_RATE_SCOPE,
} from "@/lib/payments/checkoutCore";

export type CheckoutRedirectState =
  | {
      ok: true;
      /** The gateway's hosted page — a FORM ACTION, never an iframe src. */
      action: string;
      /** Protocol fields only. There is no card field in this codebase. */
      fields: Record<string, string>;
      /** Server-side amount, shown before the parent authorises the charge. */
      amount: number;
      currency: string;
    }
  | { ok: false; error: string }
  | null;

/**
 * Start (or resume) the payment for one plan checkout.
 *
 * FormData: `order` — the merchant order id we minted when the plan change was
 * applied. It is the ONLY input, it is treated as untrusted, and it is verified
 * against this parent's own rows before anything is signed.
 */
export async function startPlanCheckout(
  _prev: CheckoutRedirectState,
  formData: FormData,
): Promise<CheckoutRedirectState> {
  // Authorize FIRST — before reading FormData, before touching the database.
  const parent = await requireParent();
  const t = await getT();

  // A signing operation and, on a failed retry, a row insert. Neither should be
  // available in unbounded quantity to a session that has already authenticated.
  // The scope is SHARED with startPlanPayment (checkoutCore): opening and
  // resuming a checkout are the same operation from two screens, so two buckets
  // would let a caller take the full allowance twice by alternating.
  if (!rateLimitAllow(CHECKOUT_RATE_SCOPE, parent.profileId, 20, 15 * 60_000)) {
    return { ok: false, error: t("checkout.err.tooMany") };
  }

  const order = String(formData.get("order") ?? "").trim();
  const locale = await getLocale();

  const res = await buildPlanCheckoutRedirect({
    parentProfileId: parent.profileId,
    order,
    locale,
  });
  // Error KEYS only. A Postgres message, a gateway message or a configuration
  // detail must never reach a payer.
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  return {
    ok: true,
    action: res.action,
    fields: res.fields,
    amount: res.amount,
    currency: res.currency,
  };
}
