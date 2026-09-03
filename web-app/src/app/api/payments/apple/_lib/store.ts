// EVERY DATABASE TOUCH THE APPLE-FACING ENDPOINTS MAKE — SERVER ONLY.
//
// Three jobs, kept in one module so the notification routes and the reconcile
// sweep share one set of queries rather than growing two:
//
//   1. CLAIM / SETTLE a notification uuid           (the replay guard, 165)
//   2. REVOKE an entitlement                        (entitlement_revoke, 011)
//   3. LIST unconsumed intents for reconciliation   (iap_purchase_intents, 164)
//
// IT DOES NOT GRANT, AND IT DOES NOT READ THE CATALOGUE. Both belong to
// `lib/payments/apple/grantEntitlement.ts` — the shared write path the redeem
// and restore routes call — and there is exactly one of it on purpose: what a
// product sells, how long it lasts and which child it is for are one decision,
// and a rule enforced in two places is a rule that will be enforced in one.
//
// NOTHING HERE RETURNS A POSTGRES MESSAGE TO A CALLER. Failures come back as
// small discriminated values; the detail is logged server-side and stops there
// (project rule: never leak internals). These endpoints answer Apple and a cron,
// neither of which has any use for our error text, and one of which is a public
// URL anybody can POST to.
import "server-only";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import type { AppleEnvironment } from "@/lib/payments/apple";

/** Apple's entitlement source, spelled as `public.entitlement_source` spells it. */
export const APPLE_ENTITLEMENT_SOURCE = "apple_iap" as const;

/**
 * The only platform this rail sells on.
 *
 * ANDROID STAYS PURCHASE-SILENT, and `iap_products.platform` is the structural
 * guard: migration 164 asserts that no `android` row exists, so there is nothing
 * to sell there. This constant is a literal and not a parameter precisely so
 * that no caller can pass 'android' and invent one.
 */
export const IOS_PLATFORM = "ios" as const;

// ---------------------------------------------------------------------------
// 1. The replay guard.
// ---------------------------------------------------------------------------

/**
 * The result of trying to claim a notification uuid.
 *
 *   claimed    — nobody had this message; it is ours to process.
 *   unfinished — a previous attempt claimed it and died before settling. Process
 *                it again: every write underneath is idempotent, so a second
 *                pass converges instead of duplicating.
 *   replay     — already processed. Do nothing and answer 200.
 *   error      — we could not reach the log. NOT a licence to process blind: an
 *                unguarded run could re-query Apple in a retry storm, and the
 *                caller turns this into a retryable failure.
 */
export type NotificationClaim = "claimed" | "unfinished" | "replay" | "error";

export type NotificationClaimInput = {
  readonly notificationUuid: string;
  readonly environment: AppleEnvironment;
  readonly notificationType: string;
  readonly subtype: string | null;
};

/**
 * Claim a notification BEFORE doing any work.
 *
 * Claim-then-settle rather than settle-only, because the expensive and
 * externally-visible half (a re-query against Apple's API) happens between the
 * two and a retry storm must not repeat it. The cost of claiming first is that a
 * crash leaves an unstamped row — which is exactly the alarm
 * `idx_iap_notifications_unsettled` exists to surface, and which the
 * `unfinished` branch above re-processes rather than abandoning.
 */
export async function claimNotification(
  input: NotificationClaimInput,
): Promise<NotificationClaim> {
  if (!isServiceRoleConfigured) return "error";
  const admin = getAdminClient();

  // ON CONFLICT DO NOTHING. `ignoreDuplicates: true` is what makes this an
  // insert-if-absent rather than an upsert: an upsert here would overwrite the
  // ORIGINAL message's row with the replay's, losing received_at and — far
  // worse — clearing nothing but looking like it had.
  const { data, error } = await admin
    .from("iap_notifications")
    .upsert(
      {
        notification_uuid: input.notificationUuid,
        environment: input.environment,
        notification_type: input.notificationType.slice(0, 64),
        subtype: input.subtype === null ? null : input.subtype.slice(0, 64),
      },
      { onConflict: "notification_uuid,environment", ignoreDuplicates: true },
    )
    .select("notification_uuid");

  if (error) {
    console.error(`[apple] notification claim failed: ${error.message}`);
    return "error";
  }
  if (Array.isArray(data) && data.length > 0) return "claimed";

  // Somebody already holds the row. Whether this is a replay or an abandoned
  // attempt is the difference between doing nothing and doing the work again.
  const existing = await admin
    .from("iap_notifications")
    .select("processed_at")
    .eq("notification_uuid", input.notificationUuid)
    .eq("environment", input.environment)
    .maybeSingle();

  if (existing.error) {
    console.error(`[apple] notification claim re-read failed: ${existing.error.message}`);
    return "error";
  }
  // The row vanished between the two statements — only possible if somebody
  // deleted it by hand, and there is no policy that permits that. Treat it as a
  // fresh message rather than silently dropping a real REFUND.
  if (!existing.data) return "unfinished";
  return existing.data.processed_at === null ? "unfinished" : "replay";
}

export type NotificationSettlement = {
  readonly notificationUuid: string;
  readonly environment: AppleEnvironment;
  readonly outcome: string;
  readonly transactionId: string | null;
  readonly originalTransactionId: string | null;
  readonly productId: string | null;
};

/**
 * Stamp a claimed notification as consumed.
 *
 * Best-effort by design: the work has already happened and is already durable
 * (the entitlement row is the record that matters). A failure here costs a
 * duplicate re-query on Apple's next retry, which is noise, not damage — so it
 * is logged and swallowed rather than turned into a 500 that would ask Apple to
 * send the message again.
 */
export async function settleNotification(input: NotificationSettlement): Promise<void> {
  if (!isServiceRoleConfigured) return;
  const admin = getAdminClient();
  const { error } = await admin
    .from("iap_notifications")
    .update({
      processed_at: new Date().toISOString(),
      outcome: input.outcome.slice(0, 40),
      transaction_id: input.transactionId,
      original_transaction_id: input.originalTransactionId,
      product_id: input.productId,
    })
    .eq("notification_uuid", input.notificationUuid)
    .eq("environment", input.environment);
  if (error) console.error(`[apple] notification settle failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// 2. Revocation.
// ---------------------------------------------------------------------------

/**
 * Withdraw an Apple grant.
 *
 * `entitlement_revoke(source, external_ref, reason)` is service_role-only, keys
 * on exactly the pair `entitlement_grant` upserts on, and only touches rows
 * whose `revoked_at` is still null — so calling it twice is a no-op and calling
 * it for a purchase we never granted returns false without writing anything.
 * That is what lets a REFUND notification be handled by simply calling this,
 * with no "did we grant this?" question first.
 *
 * Returns `true` only when a live grant was actually taken away; `false` covers
 * both "there was nothing to revoke" and "the call failed", which the caller
 * distinguishes by nothing at all — because for a refund the correct response to
 * either is the same: record it and move on. A failure is logged.
 */
export async function revokeAppleEntitlement(
  externalRef: string,
  reason: string,
): Promise<boolean> {
  if (!isServiceRoleConfigured) return false;
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("entitlement_revoke", {
    p_source: APPLE_ENTITLEMENT_SOURCE,
    p_external_ref: externalRef,
    p_reason: reason.slice(0, 200),
  });
  if (error) {
    console.error(`[apple] entitlement revoke failed: ${error.message}`);
    return false;
  }
  return data === true;
}

// ---------------------------------------------------------------------------
// 3. Reconciliation candidates.
// ---------------------------------------------------------------------------

export type PendingIntent = {
  readonly intentId: string;
  readonly productId: string;
  readonly originalTransactionId: string;
};

/**
 * Intents whose transaction id is known but which were never consumed.
 *
 * THIS IS THE ONLY SET THE SWEEP CAN ASK APPLE ABOUT, and the reason is a real
 * limitation rather than a design choice: the App Store Server API is addressed
 * BY TRANSACTION ID. There is no endpoint that takes an appAccountToken, so an
 * intent that never recorded a transaction id is one we have no way to ask a
 * question about. `countUnattributableIntents` counts those separately so the
 * backlog is visible instead of invisible.
 *
 * `original_transaction_id is not null and consumed_at is null` is precisely the
 * asymmetry migration 164 built into `ck_iap_intent_txn_required`: the id is
 * recorded the instant it is known, even if the grant then fails, because it is
 * the only key that can later revoke or refund the purchase. Every row this
 * returns is therefore a purchase we saw and did not finish.
 *
 * Oldest first: a family that has been waiting longest is served first, and a
 * backlog drains in a stable order across passes instead of starving its tail.
 */
export async function listUnconsumedIntents(limit: number): Promise<PendingIntent[]> {
  if (!isServiceRoleConfigured) return [];
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("iap_purchase_intents")
    .select("id, product_id, original_transaction_id")
    .eq("platform", IOS_PLATFORM)
    .is("consumed_at", null)
    .not("original_transaction_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error(`[apple] reconcile candidate query failed: ${error.message}`);
    return [];
  }
  const rows = (data ?? []) as { id: string; product_id: string; original_transaction_id: string | null }[];
  return rows
    .filter((r): r is { id: string; product_id: string; original_transaction_id: string } =>
      typeof r.original_transaction_id === "string" && r.original_transaction_id !== "",
    )
    .map((r) => ({
      intentId: r.id,
      productId: r.product_id,
      originalTransactionId: r.original_transaction_id,
    }));
}

/**
 * How many unconsumed intents carry NO transaction id at all.
 *
 * A count and not a list, because there is nothing to be done with the rows:
 * most of them are abandoned taps (the store sheet opened and was dismissed),
 * and the rest are purchases whose transaction id never reached us — which no
 * Apple endpoint can resolve from an appAccountToken. Reported so that a number
 * that starts climbing is visible to an operator, which is the difference
 * between a known limitation and a silent one.
 */
export async function countUnattributableIntents(): Promise<number> {
  if (!isServiceRoleConfigured) return 0;
  const admin = getAdminClient();
  const { count, error } = await admin
    .from("iap_purchase_intents")
    .select("id", { count: "exact", head: true })
    .eq("platform", IOS_PLATFORM)
    .is("consumed_at", null)
    .is("original_transaction_id", null);
  if (error) {
    console.error(`[apple] unattributable intent count failed: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}
