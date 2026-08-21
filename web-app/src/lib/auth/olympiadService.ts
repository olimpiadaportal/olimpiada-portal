"use server";

// Stage 14 — parent buys an olympiad package for a child (one-time, LIFETIME).
//
// THE PAYMENT CAUSES THE GRANT (migration 127). Until now this surface ran on a
// MOCK: `processOlympiadPayment` returned success unconditionally, the RPC wrote
// an ACTIVE purchase, migration 124 mirrored it into a lifetime entitlement, and
// no `payments` row existed anywhere. A parent could open the modal, confirm,
// and the child had a package forever without a manat changing hands.
//
// The order is now the same one the subscription checkout has had since 125:
//
//   dueNow === 0  ->  activate now. A package the owner priced at zero, or a
//                     repeat on one the child already owns, costs nothing —
//                     routing it through a payment would invent a charge, and a
//                     zero-amount signed request is not a thing the gateway
//                     accepts.
//   dueNow  >  0  ->  grant NOTHING. Open the intent, sign the redirect, and
//                     hand the parent one payment step. The package is written
//                     only when `checkout_redeem_plan` runs on a payment the
//                     gateway confirmed.
//
// THE SERVER MAKES THAT DECISION, NOT THE CLIENT. The branch is taken from
// `quote_olympiad_purchase`'s own `due_now`, on this side of the wire; the form
// carries a child id and a package id and has never carried a price.
//
// The checkout lives HERE, in the web action, and deliberately NOT in
// olympiadCore — that core is shared with the mobile BFF, and a checkout opened
// inside it would put a purchase path in an app binary
// (docs/STORE_PAYMENTS_COMPLIANCE.md §4).
//
// THE LIFETIME RULE IS UNCHANGED: a purchased package never expires,
// `ck_entitlement_lifetime` makes an end date unrepresentable, and
// `can_view_olympiad_package` keeps granting catalog visibility for an ARCHIVED
// package a family bought (CLAUDE.md non-negotiable).
import { requireParent } from "@/lib/auth/session";
import {
  purchaseOlympiadForChildCore,
  quoteOlympiadPurchaseCore,
} from "@/lib/auth/olympiadCore";
import { getLocale, getT } from "@/i18n/server";
import { startOlympiadPayment } from "@/lib/payments/checkoutCore";

// ---- Round 9 (T7): parent catalog purchase (useActionState) -----------------

/**
 * What the client is handed when a real AZN payment is required.
 *
 * Structurally identical to `PlanCheckout` in lib/auth/subscriptionService and
 * declared separately on purpose: both files are `"use server"` modules, and
 * importing a type across two of them to save eight lines would tie the olympiad
 * action's build to the subscription action's. The SHAPE is the signed field set
 * the bank expects, which is the gateway's contract, not ours to unify.
 */
export type OlympiadCheckout = {
  /** The merchant order — a lookup key for a resume, never an input to pricing. */
  order: string;
  /** The acquirer's hosted page: a FORM ACTION, never an iframe src. */
  action: string;
  /** Protocol fields only, signed server-side. There is no card field anywhere. */
  fields: Record<string, string>;
  /** The SERVER-computed amount, shown before the parent authorises it. */
  amount: number;
  currency: string;
};

export type PurchaseOlympiadState =
  | {
      ok: true;
      /** The child already holds this package — nothing happened, nothing owed. */
      already?: boolean;
      /**
       * Present when a real AZN payment is required BEFORE anything is granted:
       * the signed field set for the full-page redirect, plus the SERVER-computed
       * amount to show alongside it. The client posts these fields to the bank
       * and nothing else.
       */
      checkout?: OlympiadCheckout;
    }
  | { ok: false; error: string }
  | null;

/**
 * Parent activates an olympiad package for one of their children.
 *
 * Guard-first (requireParent), then: QUOTE — which is also what re-proves this
 * parent owns this child and that the package is on sale for their grade — and
 * then either the free activation or a signed redirect to the bank. Errors are
 * always the generic translated message, never raw DB text.
 */
export async function purchaseOlympiadForChild(
  _prev: PurchaseOlympiadState,
  formData: FormData,
): Promise<PurchaseOlympiadState> {
  // Authorize FIRST — before FormData, before the database.
  const parent = await requireParent();
  const t = await getT();
  const studentId = String(formData.get("student_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");

  // 1. QUOTE. Read-only, and the single computation the intent and the charge
  //    are both built from (audit invariant H7).
  const quoted = await quoteOlympiadPurchaseCore({
    parentProfileId: parent.profileId,
    studentId,
    packageId,
  });
  if (!quoted.ok) {
    // ALREADY OWNED IS NOT A FAILURE. The quote refuses it — opening a checkout
    // for something the family already holds would be the mirror of the defect
    // this change closes — but from the parent's side nothing is wrong: the
    // package IS theirs, for life. Answering `already` keeps the friendly modal
    // and flips the card to owned, which is what the pre-127 race did.
    if (quoted.errorKey === "poly.err.alreadyOwned") return { ok: true, already: true };
    return { ok: false, error: t(quoted.errorKey) };
  }

  // 2. PAYABLE: grant NOTHING. Open the intent for exactly the quoted amount and
  //    hand back the signed redirect — one payment step, and the package exists
  //    only once the bank confirms it.
  if (quoted.dueNow > 0) {
    const started = await startOlympiadPayment({
      parentProfileId: parent.profileId,
      studentId,
      packageId,
      locale: await getLocale(),
    });
    if (!started.ok) return { ok: false, error: t(started.errorKey) };
    return {
      ok: true,
      checkout: {
        order: started.order,
        action: started.action,
        fields: started.fields,
        amount: started.amount,
        currency: started.currency,
      },
    };
  }

  // 3. FREE: a package priced at zero. Activate it through the free-only RPC,
  //    which rolls the grant back if the price moved since the quote.
  const res = await purchaseOlympiadForChildCore({
    parentProfileId: parent.profileId,
    studentId,
    packageId,
    paidChanges: "free_only",
  });
  if (!res.ok) return { ok: false, error: t(res.errorKey) };
  return { ok: true, already: res.already };
}
