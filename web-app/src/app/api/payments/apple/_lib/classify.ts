// WHAT AN APP STORE SERVER NOTIFICATION MEANS FOR A **NON-RENEWING** PRODUCT.
//
// PURE. No env var, no I/O, no `server-only` — this is a lookup table with an
// argument, and it must stay unit-testable without a key in the process.
//
// THE PRODUCT SHAPE DECIDES THE WHOLE TABLE, so read this before adding a case.
// The owner chose NON-RENEWING subscriptions on 2026-08-31, because Apple allows
// one active subscription per group per Apple ID and this product is PER CHILD:
// a parent with three children studying Maths needs three concurrent grants,
// which an auto-renewable subscription cannot express. Consequences:
//
//   * There is no renewal, no grace period and no billing retry. DID_RENEW,
//     GRACE_PERIOD_EXPIRED, DID_FAIL_TO_RENEW, DID_CHANGE_RENEWAL_STATUS and
//     their siblings CANNOT occur for our products. If one arrives it is about
//     something we do not sell, and the correct handling is to record it and do
//     nothing — NOT to improvise an interpretation. A "helpful" DID_RENEW branch
//     would be code that extends an entitlement on an event that can only reach
//     us by mistake.
//   * EXPIRED is likewise auto-renewable-only. Our access lapses because
//     `ends_at` passes, which needs no message from anyone.
//
// UNKNOWN TYPES ARE IGNORED, NEVER REJECTED. Apple adds notification types
// without asking. A default of "refuse" would turn the next addition into a 500
// and an endless retry loop against our own endpoint; a default of "ignore"
// costs one recorded row. The recorded row is how we would find out.
//
// THE ASYMMETRY BETWEEN grant AND revoke IS DELIBERATE. `grant` is only ever a
// REQUEST to go and ask Apple — the caller re-queries and grants nothing unless
// Apple's own answer supports it. `revoke` is a request to take access away,
// which is the fail-safe direction, so the caller is allowed to act on it even
// when the re-query cannot be completed. Nothing in this file grants anything.

/**
 * What the caller should DO about a message of this type.
 *
 *   grant  — go and re-query Apple; grant only what the answer supports.
 *   revoke — take the entitlement away. Never missed, never deferred.
 *   test   — Apple's own reachability probe. Prove we consumed it, change nothing.
 *   ignore — not applicable to a non-renewing product, or not yet known to us.
 */
export type NotificationAction = "grant" | "revoke" | "test" | "ignore";

/**
 * REFUND — Apple returned the customer's money.
 * REVOKE — Family Sharing access was withdrawn.
 *
 * Both mean the same thing to us: the access this transaction bought is over.
 * This is the set that "must never be missed"; everything about the calling
 * route's error handling is shaped by keeping it un-droppable.
 */
const REVOKE_TYPES: ReadonlySet<string> = new Set(["REFUND", "REVOKE"]);

/**
 * Types that assert a purchase is (or is again) real.
 *
 * ONE_TIME_CHARGE is the purchase notification for consumable, non-consumable
 * and NON-RENEWING products — the one our catalogue actually produces.
 *
 * REFUND_REVERSED is Apple undoing a refund it previously granted (a reversed
 * chargeback). Access must come back, and `entitlement_grant` un-revokes on
 * conflict, so the ordinary grant path is exactly right for it.
 *
 * CONSUMPTION_REQUEST is Apple ASKING US for consumption data because the
 * customer has requested a refund. Treating it as a grant looks odd until you
 * follow what the caller does with it: it re-queries, and Apple's answer decides.
 * If the refund has already gone through, the re-queried transaction carries a
 * revocationDate and the caller revokes instead. So this entry costs one
 * re-query and buys a second chance to notice a refund we were never told about
 * — which is the failure mode this rail is most exposed to.
 *
 * NOT INCLUDED, and each for a reason a reader would otherwise supply wrongly:
 *   SUBSCRIBED / OFFER_REDEEMED / RENEWAL_EXTENDED — auto-renewable only.
 *   REFUND_DECLINED — the customer ASKED for a refund and Apple said no. Nothing
 *     changed; granting again would be a no-op at best and noise at worst.
 *   EXTERNAL_PURCHASE_TOKEN — the alternative-payments programme, which
 *     Azerbaijan is not in and this app does not use
 *     (docs/STORE_PAYMENTS_COMPLIANCE.md).
 */
const GRANT_TYPES: ReadonlySet<string> = new Set([
  "ONE_TIME_CHARGE",
  "REFUND_REVERSED",
  "CONSUMPTION_REQUEST",
]);

/**
 * Auto-renewable-only types, listed EXPLICITLY rather than left to the default.
 *
 * They fall into the same `ignore` bucket an unknown type does, so this set
 * changes no behaviour. It exists so that the log line says "we know what this
 * is and it does not apply to us" instead of "we have never heard of this", and
 * so that the next person to read Apple's documentation can see these were
 * considered and rejected rather than overlooked.
 */
const AUTO_RENEWABLE_ONLY_TYPES: ReadonlySet<string> = new Set([
  "DID_RENEW",
  "DID_FAIL_TO_RENEW",
  "DID_CHANGE_RENEWAL_PREF",
  "DID_CHANGE_RENEWAL_STATUS",
  "EXPIRED",
  "GRACE_PERIOD_EXPIRED",
  "OFFER_REDEEMED",
  "PRICE_INCREASE",
  "RENEWAL_EXTENDED",
  "RENEWAL_EXTENSION",
  "SUBSCRIBED",
]);

/** True for a type that only exists for auto-renewable subscriptions. */
export function isAutoRenewableOnly(notificationType: string): boolean {
  return AUTO_RENEWABLE_ONLY_TYPES.has(notificationType);
}

/** What to do about a message of this type. Total: every string maps somewhere. */
export function classifyNotification(notificationType: string): NotificationAction {
  if (REVOKE_TYPES.has(notificationType)) return "revoke";
  if (GRANT_TYPES.has(notificationType)) return "grant";
  if (notificationType === "TEST") return "test";
  return "ignore";
}

/**
 * The vocabularies, exported for the tests and for a human reading a log.
 *
 * Frozen arrays rather than the Sets themselves: a caller that could `.add()` to
 * REVOKE_TYPES could make a REFUND stop being a refund from anywhere in the
 * process.
 */
export const NOTIFICATION_VOCABULARY = Object.freeze({
  revoke: Object.freeze([...REVOKE_TYPES]),
  grant: Object.freeze([...GRANT_TYPES]),
  autoRenewableOnly: Object.freeze([...AUTO_RENEWABLE_ONLY_TYPES]),
});
