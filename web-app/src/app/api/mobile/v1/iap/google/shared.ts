// Shared bits of the three parent-facing Google Play endpoints — the twin of
// ../apple/shared.ts.
//
// NOT A ROUTE. What it holds is route-layer work: turning the writer's internal
// refusal codes into trilingual KEYS. Every code→key decision lives in ONE table
// so the three routes cannot disagree about what a parent is told, and a new
// code nobody mapped falls through to a generic key instead of leaking a word
// from the database or from Google. The sell-side gates are shared with the
// Apple rail in ../_shared/gates.ts.
import "server-only";
import type {
  GoogleRequeryResult,
  GoogleWriteRefusal,
} from "@/lib/payments/google/grantEntitlement";

/**
 * A refusal code, as a trilingual key. The SAME keys the Apple rail answers,
 * except that a verification failure names Google Play rather than the App
 * Store (`iap.err.notVerifiedPlay`).
 *
 * `unknown_intent` and `intent_not_yours` share `iap.err.notFound` for the
 * Apple reason: telling them apart would make this an oracle for intent ids.
 */
export function googleErrorKeyForRefusal(reason: GoogleWriteRefusal): string {
  switch (reason) {
    case "revoked":
    case "canceled":
      return "iap.err.revoked";
    case "unknown_product":
      return "iap.err.unavailable";
    case "unknown_intent":
    case "intent_not_yours":
      return "iap.err.notFound";
    case "intent_mismatch":
    case "product_mismatch":
      return "iap.err.mismatch";
    case "transaction_claimed":
      return "iap.err.alreadyUsed";
    case "child_missing":
      return "iap.err.childGone";
    case "not_configured":
    case "grant_failed":
      return "iap.err.generic";
    default:
      return "iap.err.notVerifiedPlay";
  }
}

/** A re-query failure, as a trilingual key. */
export function googleErrorKeyForRequery(
  reason: Extract<GoogleRequeryResult, { ok: false }>["reason"],
): string {
  if (reason === "not_found" || reason === "malformed") return "iap.err.notVerifiedPlay";
  return "iap.err.generic";
}

/** The message a recorded-but-not-granted purchase answers with. */
export function googleMessageForUngranted(reason: "pending" | "test_disabled"): string {
  return reason === "pending" ? "iap.msg.pending" : "iap.msg.recorded";
}
