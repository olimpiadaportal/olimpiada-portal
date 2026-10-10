// EVERY DATABASE TOUCH THE GOOGLE-FACING ENDPOINTS MAKE — SERVER ONLY.
// The twin of ../../apple/_lib/store.ts:
//
//   1. CLAIM / SETTLE a notification          (iap_notifications, platform android)
//   2. REVOKE a Google grant                   (entitlement_revoke, 011)
//   3. FIND which candidate refs are live      (for the voided-purchase sweep)
//
// IT DOES NOT GRANT. That is lib/payments/google/grantEntitlement.ts, the one
// writer redeem, restore and the notification consumer share.
//
// NOTHING HERE RETURNS A POSTGRES MESSAGE TO A CALLER, and nothing logs one
// either — only the error CODE, because a constraint message can quote a value.
import "server-only";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { GOOGLE_ENTITLEMENT_SOURCE } from "@/lib/payments/google/grantEntitlement";
import type { NotificationClaim } from "./notificationCore";

/** The rail every android notification row is recorded under. */
const PLATFORM = "android";
/**
 * Pub/Sub has one topic and no sandbox host, so every android row is
 * 'Production'; a license-tester purchase is identified per purchase (the
 * gp:test: ref), not per rail.
 */
const ENVIRONMENT = "Production";

// ---------------------------------------------------------------------------
// 1. The replay guard — claim before any work, settle after it.
// ---------------------------------------------------------------------------

export async function claimGoogleNotification(input: {
  notificationUuid: string;
  messageId: string;
  notificationType: string;
}): Promise<NotificationClaim> {
  if (!isServiceRoleConfigured) return "error";
  const admin = getAdminClient();

  // Insert-if-absent, never an upsert: a replay must not overwrite the
  // original row's received_at or its outcome.
  const { data, error } = await admin
    .from("iap_notifications")
    .upsert(
      {
        notification_uuid: input.notificationUuid,
        environment: ENVIRONMENT,
        platform: PLATFORM,
        provider_message_id: input.messageId,
        notification_type: input.notificationType.slice(0, 64),
        subtype: null,
      },
      { onConflict: "notification_uuid,environment", ignoreDuplicates: true },
    )
    .select("notification_uuid");
  if (error) {
    console.error(`[google] notification claim failed: ${error.code ?? "unknown"}`);
    return "error";
  }
  if (Array.isArray(data) && data.length > 0) return "claimed";

  const existing = await admin
    .from("iap_notifications")
    .select("processed_at")
    .eq("notification_uuid", input.notificationUuid)
    .eq("environment", ENVIRONMENT)
    .maybeSingle();
  if (existing.error) {
    console.error(`[google] notification claim re-read failed: ${existing.error.code ?? "unknown"}`);
    return "error";
  }
  if (!existing.data) return "unfinished";
  return (existing.data as { processed_at: string | null }).processed_at === null
    ? "unfinished"
    : "replay";
}

/** Best-effort: the work is already durable; a failure costs one re-query. */
export async function settleGoogleNotification(input: {
  notificationUuid: string;
  outcome: string;
  orderId: string | null;
  externalRef: string | null;
  productId: string | null;
}): Promise<void> {
  if (!isServiceRoleConfigured) return;
  const admin = getAdminClient();
  const bounded = (v: string | null, max: number) => (v !== null && v.length <= max ? v : null);
  const { error } = await admin
    .from("iap_notifications")
    .update({
      processed_at: new Date().toISOString(),
      outcome: input.outcome.slice(0, 40),
      transaction_id: bounded(input.orderId, 100),
      original_transaction_id: bounded(input.externalRef, 100),
      product_id: bounded(input.productId, 200),
    })
    .eq("notification_uuid", input.notificationUuid)
    .eq("environment", ENVIRONMENT);
  if (error) console.error(`[google] notification settle failed: ${error.code ?? "unknown"}`);
}

// ---------------------------------------------------------------------------
// 2. Revocation.
// ---------------------------------------------------------------------------

/**
 * Revoke every listed ref under source google_play. `entitlement_revoke` only
 * touches rows whose revoked_at is null, so a ref that was never granted, or was
 * already revoked, is a no-op.
 *
 * Returns how many live grants were taken away, or NULL when any call failed —
 * the caller then asks to be told again rather than recording a revocation it
 * cannot vouch for.
 */
export async function revokeGoogleRefs(refs: readonly string[], reason: string): Promise<number | null> {
  if (!isServiceRoleConfigured) return null;
  const admin = getAdminClient();
  let taken = 0;
  let failed = false;
  for (const ref of refs) {
    const { data, error } = await admin.rpc("entitlement_revoke", {
      p_source: GOOGLE_ENTITLEMENT_SOURCE,
      p_external_ref: ref,
      p_reason: reason.slice(0, 200),
    });
    if (error) {
      console.error(`[google] entitlement revoke failed: ${error.code ?? "unknown"}`);
      failed = true;
      continue;
    }
    if (data === true) taken += 1;
  }
  return failed ? null : taken;
}

// ---------------------------------------------------------------------------
// 3. Which refs are live — so the sweep revokes only what exists.
// ---------------------------------------------------------------------------

/** The subset of `refs` that is a LIVE google_play grant, or null on failure. */
export async function findLiveGoogleRefs(refs: readonly string[]): Promise<string[] | null> {
  if (!isServiceRoleConfigured) return null;
  if (refs.length === 0) return [];
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("entitlements")
    .select("external_ref")
    .eq("source", GOOGLE_ENTITLEMENT_SOURCE)
    .in("external_ref", [...refs])
    .is("revoked_at", null);
  if (error) {
    console.error(`[google] live-grant lookup failed: ${error.code ?? "unknown"}`);
    return null;
  }
  return ((data ?? []) as { external_ref: string }[]).map((r) => r.external_ref);
}
