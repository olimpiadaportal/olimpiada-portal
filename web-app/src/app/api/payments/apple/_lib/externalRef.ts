// THE KEY AN APPLE GRANT IS WRITTEN AND WITHDRAWN UNDER. Pure.
//
// `entitlements.external_ref`'s own column comment (007, quoted at length in
// migration 164's header) already names it:
//
//     'The producer''s idempotency key AND the upsert target, namespaced by
//      rail: … | Apple originalTransactionId | … Stable across renewals'
//
// So for the production rail the ref IS Apple's originalTransactionId, verbatim.
// `entitlement_grant` upserts on (source, external_ref) and `entitlement_revoke`
// keys on the same pair — which is the entire reason a replayed notification
// cannot double-grant and a REFUND can always find what it must take away.
//
// THIS FUNCTION MUST AGREE WITH THE SHARED WRITER, or a refund will revoke
// nothing. `lib/payments/apple/grantEntitlement.ts` passes
// `production.originalTransactionId` verbatim as `p_external_ref` — which is
// exactly what the Production branch below returns. VERIFIED against that file
// on 2026-09-01; if either side ever changes, they must change together. A
// mismatch is silent in the worst way: the grant succeeds, the revoke updates
// zero rows and returns false, and a refunded customer keeps their access
// forever.
//
// The two are separate functions rather than one shared export because the
// writer never needs the SANDBOX form (it writes nothing for sandbox) and this
// module does — a revocation key is computed on both rails.
//
// WHY SANDBOX GETS A PREFIX. A sandbox transaction id is minted in a different
// namespace from a production one and Apple gives no guarantee they cannot
// coincide. An un-prefixed sandbox ref could therefore collide with a real
// customer's production ref, and `entitlement_grant`'s upsert would MOVE that
// customer's grant — student, subject, expiry and all — onto a reviewer's test
// purchase. The prefix makes the collision unrepresentable. It is a second lock:
// the first is that a sandbox grant cannot reach the writer at all
// (`requireProductionGrant`), and nothing in this rail should ever remove it.
import type { AppleEnvironment } from "@/lib/payments/apple";

/**
 * Namespace marker for the sandbox rail.
 *
 * Chosen so it cannot be confused with the two prefixes `entitlement_grant`
 * REFUSES outright — `sub:` and `oly:`, which belong to the ABB producer mirror
 * — while still being obvious in a support query.
 */
export const APPLE_SANDBOX_REF_PREFIX = "apple_sandbox:";

/**
 * The `entitlements.external_ref` for an Apple purchase.
 *
 * Production: the originalTransactionId, unchanged, because that is what the
 * schema says and because it is the only value a later REFUND notification can
 * be joined back to.
 */
export function appleExternalRef(
  environment: AppleEnvironment,
  originalTransactionId: string,
): string {
  return environment === "Production"
    ? originalTransactionId
    : `${APPLE_SANDBOX_REF_PREFIX}${originalTransactionId}`;
}

/** True for a ref this platform would only ever have written from the sandbox rail. */
export function isSandboxRef(externalRef: string): boolean {
  return externalRef.startsWith(APPLE_SANDBOX_REF_PREFIX);
}
