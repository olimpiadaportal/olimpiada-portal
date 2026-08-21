// PARENT CHECKOUT — the cookie-free core. SERVER ONLY, WEB ONLY.
//
// This is the layer that turns a plan a parent has CHOSEN — and has NOT been
// given — into a real AZN payment on the ABB / AzeriCard rail. It sits between
// the subscription RPCs (which decide what is owed), lib/payments/checkoutIntent
// (which opens and redeems the intent) and lib/payments/azericard (which knows
// the protocol), and it owns exactly two jobs:
//
//   1. open a payable checkout for an amount THE DATABASE computed, and
//   2. turn an order the parent names back into a signed, full-page redirect
//      POST to the acquirer's hosted page.
//
// THE ORDER OF OPERATIONS IS THE POINT. Until migration 125 this module was
// called AFTER the plan had already been applied, by a helper documented as
// "can only return null — it never fails the change". The money was therefore
// optional: confirm, close the tab, keep the access. Now nothing is applied
// until `checkout_redeem_plan` runs on a payment the gateway confirmed, so an
// abandoned checkout is harmless BY CONSTRUCTION rather than by anyone
// remembering to clean it up.
//
// FIVE THINGS IT DELIBERATELY DOES NOT DO
//
//   * It never accepts an amount from a client. The only amount it will ever
//     sign is one a plan RPC computed inside the same transaction that stored it
//     (`checkout_intent_open`), re-verified against a fresh quote immediately
//     before signing. A caller naming an order gets that order's stored amount
//     or an error; there is no parameter that could carry a price.
//   * It never embeds a payment form or an iframe. The cardholder types the PAN
//     on the acquirer's own page after a FULL HTTP REDIRECT — that is what keeps
//     us on PCI DSS SAQ A (docs/STORE_PAYMENTS_COMPLIANCE.md §8.3 rule 1).
//     There is no card input anywhere in this codebase and there must never be.
//   * It grants nothing. Opening and signing a charge are all that happen here;
//     the grant is the callback's redemption step, and access itself is
//     `entitlements`' job (§4.1), mirrored from the subscription by a trigger.
//   * It is NOT reachable from the mobile app. Every mobile BFF route builds its
//     JSON field-by-field and none of them imports this module; the apps are
//     purchase-silent by architecture, not by a flag (§4 / §5 NEVER-list).
//   * It is not a payment-provider abstraction. One rail exists; a second one
//     would be a new producer beside this, not a strategy interface inside it.
import "server-only";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { buildAuthRequest } from "@/lib/payments/azericard/gateway";
import { getAzericardConfig } from "@/lib/payments/azericard/config";
import { formatAmount, isValidOrder } from "@/lib/payments/azericard/format";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import {
  findOutstandingSession,
  findSessionByOrder,
  PLAN_CHECKOUT_KIND,
  type CheckoutSessionRow,
} from "@/lib/payments/azericard/store";
import { rateLimitAllow } from "@/lib/rateLimit";
import {
  openPlanIntent,
  reopenPlanIntent,
  repricePlanIntent,
  type PlanIntentKind,
} from "@/lib/payments/checkoutIntent";
import { writeAuditLog } from "@/lib/audit";
import { isUuid } from "@/lib/uuid";
import { storedBasketMatches, type PlanItemInput } from "@/lib/planBasket";
import type { Locale } from "@/i18n/config";

// The `checkout_sessions.kind` a parent plan payment carries lives in store.ts,
// beside the union it belongs to, and is re-exported here so a caller working on
// the checkout does not have to reach into the protocol module for it. It is not
// 'protocol_test' (the owner's sandbox route owns that one) and not 'olympiad' —
// a reconciliation report that cannot tell the three apart is a report nobody
// can act on.
export { PLAN_CHECKOUT_KIND };
export type { PlanIntentKind };

/**
 * Upper bound on any single plan charge, in major units. The largest basket the
 * platform can price today is 20 subjects at the yearly rate (20 x 90 = 1800
 * AZN), so this is roughly 3x the reachable maximum: high enough never to
 * refuse a real purchase, low enough that a corrupted amount cannot be signed.
 * A refusal here is a server-side log and a generic error, never a charge.
 */
export const MAX_CHECKOUT_AMOUNT = 5000;

/**
 * The rate-limit bucket both checkout entrypoints share.
 *
 * Opening an intent and resuming one are the same operation reached from two
 * screens — each ends in a signature and an audit row — so they draw on ONE
 * budget. Two buckets would mean a caller could take the full allowance twice
 * by alternating between them.
 */
export const CHECKOUT_RATE_SCOPE = "checkoutstart";

/**
 * What the cardholder sees on the bank's page (DESC, ASCII, <=50 chars — the
 * gateway truncates and re-encodes anything else, which would break the MAC).
 * Deliberately generic: no child name, no subject list, no grade. A payment
 * page is not a place to publish who in the family is studying what.
 */
const CHECKOUT_DESCRIPTION = "OlympIQ subscription";

export type StartCheckoutResult =
  | {
      ok: true;
      /**
       * The ORDER that was actually signed. On a retry this is a NEW one, not
       * the order the caller named — so the caller must read it back rather than
       * assume, or a resume link would point at the failed attempt.
       */
      order: string;
      /** The acquirer's hosted-page URL — the FORM ACTION, never an iframe src. */
      action: string;
      /** The exact protocol fields to POST, P_SIGN included. No card fields. */
      fields: Record<string, string>;
      /** Server-side amount, for display only; it is never read back in. */
      amount: number;
      currency: string;
    }
  | { ok: false; errorKey: string };

/**
 * Open a checkout for a plan and hand back the SIGNED redirect in one step.
 *
 * ONE PAYMENT STEP, ONE HONEST LABEL. This exists so the parent meets the word
 * "pay" exactly once per screen. The confirm sheet says "continue to payment"
 * and means it: this runs, and what comes back is the form that leaves for the
 * bank. The two-click shape it replaced ("Pay now" → a second "Pay now" that was
 * the real one) asked a parent to authorise the same change twice.
 *
 * NOTHING IS APPLIED HERE. `checkout_intent_open` quotes and inserts a pending
 * session; the plan is written only when a verified payment redeems it. If the
 * parent never pays, the intent expires and no state has to be unwound.
 *
 * A SECOND CLICK RE-USES THE FIRST INTENT. The re-quote is what makes a double
 * delivery impossible — once the first payment is redeemed, a second
 * `plan_start` raises `already_subscribed` and a second `plan_change` for the
 * same basket prices at zero and raises `nothing_due` — but "impossible to
 * deliver twice" is not the same as "tidy". Minting a fresh `checkout_sessions`
 * row on every click left a trail of orders the gateway had never heard of, and
 * a second order for a payment that MIGHT STILL BE IN FLIGHT is precisely how a
 * family gets charged twice: two orders are two transactions to the acquirer,
 * and its duplicate protection is per-ORDER. So an impatient click now re-signs
 * the SAME pending order for the SAME basket, which the gateway answers with
 * ACTION=1 ("duplicate detected") rather than a second approval — the resume
 * path's reasoning, applied to the first visit as well.
 *
 * It is re-used only when it is still the same purchase: same intent kind, same
 * frozen basket, still `pending`, not expired. A `failed` session is never
 * re-signed (the gateway holds a completed, declined transaction under that
 * order) and a changed basket is a different purchase, so both mint afresh. And
 * the amount is never carried over: the session is RE-PRICED before signing, so
 * re-use can only ever change the order id, never the number.
 *
 * IT IS ALSO RATE LIMITED, on the same budget as the resume action beside it.
 * Signing writes an audit row and opening an intent inserts a row; neither
 * should be available in unbounded quantity to a session that has authenticated
 * once. The limiter lives HERE rather than in each action so a future paid flow
 * cannot forget it.
 *
 * The caller must have authorized the parent AND proven they own this child.
 */
export async function startPlanPayment(params: {
  parentProfileId: string;
  studentId: string;
  kind: PlanIntentKind;
  /** The DESIRED basket, already validated by the caller and re-validated by SQL. */
  items: PlanItemInput[];
  locale: Locale;
}): Promise<StartCheckoutResult> {
  const { parentProfileId, studentId, kind, items, locale } = params;
  if (!isServiceRoleConfigured) return { ok: false, errorKey: "checkout.err.unavailable" };
  if (!isUuid(parentProfileId) || !isUuid(studentId)) {
    return { ok: false, errorKey: "checkout.err.unavailable" };
  }

  // The mode is read HERE as well as in the caller's own gate: a giveaway window
  // that opened in between must stop the charge, and the gate and the charge are
  // far enough apart in the request for that to be a real possibility.
  const { mode } = await getPaymentModeInfo();
  if (mode === "off") return { ok: false, errorKey: "gate.paymentsOff" };
  if (mode === "giveaway") return { ok: false, errorKey: "gate.giveawayFree" };

  // ONE budget shared with the resume action (lib/payments/checkoutService),
  // because they are the same operation reached from two screens.
  if (!rateLimitAllow(CHECKOUT_RATE_SCOPE, parentProfileId, 20, 15 * 60_000)) {
    return { ok: false, errorKey: "checkout.err.tooMany" };
  }

  const config = getAzericardConfig();
  if (!config) {
    // Not configured is not an error the parent caused; it is an operator
    // problem. Say so in the server log and open no session.
    console.error("[checkout] refusing to open a session: gateway not configured");
    return { ok: false, errorKey: "checkout.err.unavailable" };
  }

  // A pending intent for exactly this purchase? Re-sign it instead of minting a
  // parallel order. Re-priced first, so the parent is never sent to the bank
  // with yesterday's number, and a stale one stops here with a sentence they can
  // act on rather than becoming a `needs_review` after the charge.
  const open = await findOutstandingSession(parentProfileId, studentId);
  if (open && open.status === "pending" && matchesRequestedIntent(open, kind, items)) {
    const repriced = await repricePlanIntent(open.order);
    if (repriced.ok && isChargeableAmount(repriced.amount)) {
      if (open.currency !== config.currency) {
        console.error("[checkout] session currency does not match the terminal currency");
        return { ok: false, errorKey: "checkout.err.unavailable" };
      }
      return signOrder({
        parentProfileId,
        checkoutSessionId: open.id,
        order: open.order,
        amount: repriced.amount,
        currency: open.currency,
        locale,
      });
    }
    // NOT AN ERROR PATH. The stored intent no longer prices — the catalog or the
    // plan moved under it — so it is simply not the purchase being asked for.
    // Fall through and open a fresh one, which will fail with the real reason if
    // the new basket does not price either.
  }

  const opened = await openPlanIntent({ studentId, kind, items });
  if (!opened.ok) return { ok: false, errorKey: opened.errorKey };

  // The terminal is bound to ONE currency. Signing a plan priced in a different
  // one would produce a charge in the terminal's currency for the plan's number
  // — the quiet kind of wrong that only shows up in a settlement report.
  if (opened.currency !== config.currency) {
    console.error("[checkout] plan currency does not match the terminal currency");
    return { ok: false, errorKey: "checkout.err.unavailable" };
  }

  return signOrder({
    parentProfileId,
    checkoutSessionId: null,
    order: opened.order,
    amount: opened.amount,
    currency: opened.currency,
    locale,
  });
}

/**
 * The unfinished checkout a parent still has open for a child, if there is one.
 *
 * `pending` = opened and never completed (the parent closed the tab, or never
 * reached the bank). `failed` = the gateway told us, through our own status
 * query, that the transaction did not go through. Both are things the parent
 * can act on; `paid`, redeemed and expired ones are excluded in the query.
 *
 * KEYED ON THE CHILD, not on a subscription: a first plan has no subscription
 * until its payment is redeemed, and that is exactly the checkout a family most
 * needs to be able to find again.
 *
 * ONE row, the newest. A family that abandons two checkouts sees only the later
 * one — which is now harmless rather than a debt, because neither granted
 * anything. Chasing an unpaid balance would be DUNNING (§8.3 rules 6 and 7), and
 * after this change there is no unpaid balance to chase: there is only an offer
 * the parent did not take.
 */
export async function findOutstandingPlanCheckout(params: {
  ownerParentProfileId: string;
  studentId: string;
}): Promise<{ order: string; amount: number; currency: string; status: string } | null> {
  const { ownerParentProfileId, studentId } = params;
  if (!isUuid(ownerParentProfileId) || !isUuid(studentId)) return null;
  const row = await findOutstandingSession(ownerParentProfileId, studentId);
  if (!row || !isChargeableAmount(row.amount)) return null;
  return {
    order: row.order,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
  };
}

/**
 * Turn an ORDER the parent names into the signed field set for the redirect.
 *
 * This is the RESUME path — a checkout opened on an earlier visit and picked up
 * again from the subscribe page. The order is CLIENT-SUPPLIED, so every fact
 * about it is re-established here from the database: that it exists, that this
 * parent owns it, that it is a plan checkout carrying an intent and not the
 * owner's protocol test, that it is not already paid or redeemed, and what it is
 * worth.
 *
 * THE PRICE IS RE-QUOTED BEFORE IT IS SIGNED. A session opened yesterday was
 * priced yesterday; a subject may have been repriced, withdrawn, or the family's
 * sibling tier may have moved. Signing the stored number anyway would take money
 * that redemption then refuses to deliver on (it re-prices too, and demands
 * exact equality). So a moved price stops here, with a sentence the parent can
 * act on, instead of becoming a `needs_review` after the charge.
 *
 * A `failed` session is not re-signed: the gateway already has a completed,
 * declined transaction under that ORDER. The retry is a NEW intent over the same
 * stored basket, freshly quoted, and the failed row stays standing as the
 * accurate ledger entry.
 *
 * A `pending` one IS reused, and that is the safer half of the rule: minting a
 * second order for a payment that might still be in flight is how a family gets
 * charged twice. Re-posting the SAME order cannot — the gateway answers ACTION=1
 * ("duplicate detected") for a transaction it already holds, which codes.ts maps
 * to `pending`, never to a second approval and never to a second `payments` row.
 * The duplicate protection is the acquirer's, and we stay inside it rather than
 * inventing our own.
 */
export async function buildPlanCheckoutRedirect(params: {
  parentProfileId: string;
  order: string;
  locale: Locale;
}): Promise<StartCheckoutResult> {
  const { parentProfileId, order, locale } = params;
  if (!isServiceRoleConfigured) return { ok: false, errorKey: "checkout.err.unavailable" };
  if (!isUuid(parentProfileId)) return { ok: false, errorKey: "checkout.err.unavailable" };
  if (!isValidOrder(order)) return { ok: false, errorKey: "checkout.err.notFound" };

  // The payment mode is re-read HERE, not trusted from whenever the session was
  // opened: a giveaway window that started in between must stop the charge, not
  // ride on a row created while payments were real.
  const { mode } = await getPaymentModeInfo();
  if (mode === "off") return { ok: false, errorKey: "gate.paymentsOff" };
  if (mode === "giveaway") return { ok: false, errorKey: "gate.giveawayFree" };

  const session = await findSessionByOrder(order);
  if (!session) return { ok: false, errorKey: "checkout.err.notFound" };
  // Ownership is re-verified server-side even though RLS would also refuse:
  // this path runs on the service-role client, which RLS does not constrain.
  // Every refusal below answers with the SAME key, so a parent probing order
  // ids cannot tell "not yours" from "does not exist".
  if (session.ownerParentProfileId !== parentProfileId) {
    return { ok: false, errorKey: "checkout.err.notFound" };
  }
  if (session.kind !== PLAN_CHECKOUT_KIND) {
    return { ok: false, errorKey: "checkout.err.notFound" };
  }
  // No intent = the owner's protocol test, or a row written before migration
  // 125. Neither can be redeemed, so neither may be charged for.
  if (!session.intentKind || !session.studentProfileId) {
    return { ok: false, errorKey: "checkout.err.notFound" };
  }
  if (session.status === "paid" || session.redeemedAt) {
    return { ok: false, errorKey: "checkout.err.alreadyPaid" };
  }
  if (session.status !== "pending" && session.status !== "failed") {
    return { ok: false, errorKey: "checkout.err.notFound" };
  }
  if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
    return { ok: false, errorKey: "checkout.err.expired" };
  }

  const config = getAzericardConfig();
  if (!config) return { ok: false, errorKey: "checkout.err.unavailable" };
  if (session.currency !== config.currency) {
    console.error("[checkout] session currency does not match the terminal currency");
    return { ok: false, errorKey: "checkout.err.unavailable" };
  }

  // A DECLINED attempt is retried as a new, re-quoted intent; a still-open one
  // keeps its order and is re-priced in place.
  if (session.status === "failed") {
    const reopened = await reopenPlanIntent({
      studentId: session.studentProfileId,
      kind: session.intentKind,
      items: session.intentItems,
    });
    if (!reopened.ok) return { ok: false, errorKey: reopened.errorKey };
    if (reopened.currency !== config.currency) {
      console.error("[checkout] session currency does not match the terminal currency");
      return { ok: false, errorKey: "checkout.err.unavailable" };
    }
    return signOrder({
      parentProfileId,
      checkoutSessionId: null,
      order: reopened.order,
      amount: reopened.amount,
      currency: reopened.currency,
      locale,
      retryOf: session.order,
    });
  }

  const repriced = await repricePlanIntent(session.order);
  if (!repriced.ok) return { ok: false, errorKey: repriced.errorKey };
  if (!isChargeableAmount(repriced.amount)) {
    console.error("[checkout] session has no usable amount");
    return { ok: false, errorKey: "checkout.err.unavailable" };
  }

  return signOrder({
    parentProfileId,
    checkoutSessionId: session.id,
    order: session.order,
    amount: repriced.amount,
    currency: session.currency,
    locale,
  });
}

/**
 * Build and audit the signed authorisation request for one order.
 *
 * The single place `buildAuthRequest` is called, so there is exactly one line in
 * this codebase where a number becomes a signable field — and it takes its
 * amount from a database read, never from a caller's arithmetic.
 */
async function signOrder(params: {
  parentProfileId: string;
  /** For the audit target, when we already have it. Null on a freshly minted order. */
  checkoutSessionId: string | null;
  order: string;
  amount: number;
  currency: string;
  locale: Locale;
  retryOf?: string;
}): Promise<StartCheckoutResult> {
  const { parentProfileId, order, amount, currency, locale, retryOf } = params;
  if (!isChargeableAmount(amount)) {
    console.error("[checkout] refusing to sign an unusable amount");
    return { ok: false, errorKey: "checkout.err.unavailable" };
  }

  const built = buildAuthRequest({
    order,
    amount,
    description: CHECKOUT_DESCRIPTION,
    lang: locale,
  });
  if (!built) {
    // buildAuthRequest returns null for an unconfigured module or an unsignable
    // input. Neither is something to explain to a payer.
    console.error("[checkout] could not build the authorisation request");
    return { ok: false, errorKey: "checkout.err.unavailable" };
  }

  // Section 8.3 rule 8 — chargeback evidence from day one: who authorised what,
  // when, against which order. Amount and order id only; no card data exists
  // here to leak, and none is ever added.
  await writeAuditLog(parentProfileId, "parent.checkout_start", {
    targetTable: "checkout_sessions",
    targetId: params.checkoutSessionId ?? undefined,
    metadata: { order, amount, currency, retry_of: retryOf },
  });

  return { ok: true, order, action: built.action, fields: built.fields, amount, currency };
}

/**
 * Is this pending session the SAME purchase the parent just asked for?
 *
 * Three facts, all re-established from our own row: the same intent kind, still
 * inside its window, and the same frozen basket. The basket comparison itself
 * is `storedBasketMatches` in lib/planBasket — the pure module — so it can be
 * unit-tested without dragging the service-role client into a test, exactly as
 * the rest of the basket rules are.
 */
function matchesRequestedIntent(
  session: CheckoutSessionRow,
  kind: PlanIntentKind,
  items: PlanItemInput[],
): boolean {
  if (session.intentKind !== kind) return false;
  if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) return false;
  return storedBasketMatches(session.intentItems, items);
}

/** Finite, positive, representable, and inside the sanity ceiling. */
function isChargeableAmount(value: number | null | undefined): value is number {
  if (typeof value !== "number") return false;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_CHECKOUT_AMOUNT) return false;
  return formatAmount(value) !== null;
}
