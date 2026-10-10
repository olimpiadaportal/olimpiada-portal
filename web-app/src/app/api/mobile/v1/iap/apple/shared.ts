// Shared bits of the three parent-facing Apple IAP endpoints.
//
// NOT A ROUTE. Only `route.ts` becomes an endpoint under the app router; this
// file sits beside the three of them because what it holds is route-layer work
// — turning internal refusal codes into trilingual KEYS. The sell-side gates the
// purchase endpoint runs before it opens an intent live in ../_shared/gates.ts
// (shared with the Google Play rail) and are re-exported at the bottom.
//
// WHY THE MAPPING LIVES HERE AND NOT IN THE LIBRARY. `lib/payments/apple/`
// returns internal codes (`bundle_id_mismatch`, `mirrored_grant`, …) that are
// safe to log and must never be returned to a client — the project rule is one
// generic, translated sentence out and the detail in the server log. Keeping
// every code→key decision in ONE table means the three routes cannot disagree
// about what a parent is told, and a new refusal code that nobody mapped falls
// through to the generic key instead of leaking a database word.
import "server-only";
import type { AppleWriteRefusal, AppleRequeryResult } from "@/lib/payments/apple/grantEntitlement";

/**
 * Apple's transaction ids are numeric strings today. The 100-character bound is
 * not arbitrary: it is the same one `iap_purchase_intents.original_transaction_id`
 * carries as a CHECK, so an id accepted here is always one the database can
 * store.
 */
export const TRANSACTION_ID_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * An internal refusal code, as a trilingual key.
 *
 * TWO CODES SHARE ONE KEY ON PURPOSE. `unknown_intent` and `intent_not_yours`
 * both answer `iap.err.notFound`: telling the two apart would turn this endpoint
 * into an oracle for "does this intent id exist", and an intent id is the token
 * that names another family's child.
 */
export function errorKeyForRefusal(reason: AppleWriteRefusal): string {
  switch (reason) {
    case "revoked":
      return "iap.err.revoked";
    case "unknown_product":
      return "iap.err.unavailable";
    case "unknown_intent":
    case "intent_not_yours":
      return "iap.err.notFound";
    case "intent_mismatch":
      return "iap.err.mismatch";
    case "transaction_claimed":
      return "iap.err.alreadyUsed";
    case "child_missing":
      return "iap.err.childGone";
    case "not_configured":
    case "grant_failed":
      return "iap.err.generic";
    default:
      // Every remaining code is a verification failure: the payload did not say
      // what a genuine purchase of one of our products would say. One sentence
      // covers all of them, and the specific code is in the server log.
      return "iap.err.notVerified";
  }
}

/** A re-query failure, as a trilingual key. */
export function errorKeyForRequery(
  reason: Extract<AppleRequeryResult, { ok: false }>["reason"],
): string {
  if (reason === "not_found") return "iap.err.notFound";
  if (reason === "unverified") return "iap.err.notVerified";
  // not_configured / unavailable — ours or Apple's, and worth retrying.
  return "iap.err.generic";
}

// The sell-side gates now live in ../_shared/gates.ts, shared with the Google
// Play rail so the two stores refuse exactly the same sales. Re-exported so
// every existing import of this module keeps working unchanged.
export {
  PRODUCT_ID_MAX,
  freeAccessClosedKey,
  packageUnsellableKey,
  paymentsClosedKey,
  subjectUnsellableKey,
} from "../_shared/gates";
