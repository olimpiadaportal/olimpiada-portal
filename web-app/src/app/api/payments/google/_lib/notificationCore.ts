// WHAT A GOOGLE PLAY REAL-TIME DEVELOPER NOTIFICATION DOES TO THIS PLATFORM.
// The twin of ../../apple/_lib/notificationCore.ts.
//
// HOW IT ARRIVES. Google Play publishes a `DeveloperNotification` to a Cloud
// Pub/Sub topic we own; a PUSH subscription POSTs it here as
//   { "message": { "data": base64(json), "messageId": "...", ... },
//     "subscription": "projects/.../subscriptions/..." }
// with a Google-signed OIDC token in Authorization. The SHELL
// (notificationRoute.ts) authenticates that token before this file runs.
//
// FULLY INJECTED: every Google call and every database write arrives in
// `deps`, so the decision is exercised in full without a key or a purchase.
//
// THE DOCTRINE. Authentication proves the message came through OUR Pub/Sub
// subscription; it does not make its contents an authority. A PURCHASED message
// is a "go and check" ping: the token and product it names are re-queried with
// purchases.products.get, and only Google's answer reaches the shared writer
// (`toGoogleGrant` refuses anything not tagged `requery`).
//
// THE ONE DEPARTURE IS FAIL-SAFE, exactly the Apple one: a VOIDED purchase (a
// refund, a chargeback) revokes on the authenticated message itself — the worst
// case of over-revoking is a support ticket; the worst case of under-revoking is
// giving the product away after the money went back.
//
// STATUS CODES. Pub/Sub treats 102/200/201/202/204 as an ACK and redelivers
// anything else with backoff for up to seven days. So: 200 for a message we
// consumed or deliberately ignored; non-2xx ONLY when a retry could genuinely
// help (we could not reach our own log, Google, or the database). Those leave
// the notification row UNSETTLED, which is the alarm idx_iap_notifications_unsettled
// exists to surface.
import { createHash } from "node:crypto";
import type {
  GoogleRequeryResult,
  GoogleWriteResult,
} from "@/lib/payments/google/grantEntitlement";
import {
  PLAY_PRODUCT_ID_RE,
  PURCHASE_TOKEN_RE,
  candidateRefsForVoided,
  type VerifiedPlayPurchase,
} from "@/lib/payments/google/purchase";

/** Pub/Sub's message ids are decimal strings today; bounded and charset-checked. */
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

/** oneTimeProductNotification.notificationType */
export const ONE_TIME_PRODUCT = { PURCHASED: 1, CANCELED: 2 } as const;

/** A Pub/Sub push body is small; anything far larger is not one. */
export const RTDN_MAX_BODY_BYTES = 64 * 1024;

/** Write refusals a retry could plausibly fix — our own faults only. */
const RETRYABLE_WRITE_REFUSALS: ReadonlySet<string> = new Set(["not_configured", "grant_failed"]);

export type NotificationClaim = "claimed" | "unfinished" | "replay" | "error";

export type GoogleNotificationDeps = {
  /** OUR package name. A message about any other app is not ours. */
  readonly packageName: string;
  readonly claim: (input: {
    notificationUuid: string;
    messageId: string;
    notificationType: string;
  }) => Promise<NotificationClaim>;
  readonly settle: (input: {
    notificationUuid: string;
    outcome: string;
    orderId: string | null;
    externalRef: string | null;
    productId: string | null;
  }) => Promise<void>;
  /** THE "go and check" call — purchases.products.get. */
  readonly requery: (productId: string, purchaseToken: string) => Promise<GoogleRequeryResult>;
  /** THE SHARED WRITE PATH — the same grantGoogleEntitlement redeem calls. */
  readonly write: (purchase: VerifiedPlayPurchase) => Promise<GoogleWriteResult>;
  /** Revoke every listed ref; resolves to how many live grants were taken away. */
  readonly revoke: (refs: readonly string[], reason: string) => Promise<number | null>;
};

export type NotificationResult = {
  /** What the route answers Pub/Sub. */
  readonly status: number;
  /** Short enum-like code. Recorded and logged; never returned in a body. */
  readonly outcome: string;
};

const OK = 200;
const RETRY = 500;
const REFUSED = 400;

function done(status: number, outcome: string): NotificationResult {
  return { status, outcome };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function int(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{1,6}$/.test(value)) return Number(value);
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A deterministic uuid for a Pub/Sub message id, so an android notification
 * fits iap_notifications' (notification_uuid, environment) primary key and a
 * redelivery maps onto the SAME row. sha256 of a namespaced id, shaped as an
 * RFC 9562 version-8 (custom) uuid. The real id is kept beside it, in
 * provider_message_id, under its own unique index.
 */
export function notificationUuidForMessage(messageId: string): string {
  const bytes = createHash("sha256").update(`google-play-rtdn:${messageId}`, "utf8").digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** A readable type label for the log row. Free text, ≤ 64 chars. */
function typeLabel(n: Record<string, unknown>): string {
  if (record(n.testNotification)) return "TEST";
  const oneTime = record(n.oneTimeProductNotification);
  if (oneTime) {
    const t = int(oneTime.notificationType);
    if (t === ONE_TIME_PRODUCT.PURCHASED) return "ONE_TIME_PRODUCT_PURCHASED";
    if (t === ONE_TIME_PRODUCT.CANCELED) return "ONE_TIME_PRODUCT_CANCELED";
    return "ONE_TIME_PRODUCT_OTHER";
  }
  if (record(n.voidedPurchaseNotification)) return "VOIDED_PURCHASE";
  if (record(n.subscriptionNotification)) return "SUBSCRIPTION";
  return "UNKNOWN";
}

/**
 * Consume one authenticated Pub/Sub push body.
 *
 * `rawBody` is the request text, already authenticated, size-capped and
 * rate-limited by the shell.
 */
export async function handleGoogleNotification(
  rawBody: string,
  deps: GoogleNotificationDeps,
): Promise<NotificationResult> {
  // ---- 1. The envelope. -----------------------------------------------------
  let envelope: Record<string, unknown> | null = null;
  try {
    envelope = record(JSON.parse(rawBody));
  } catch {
    envelope = null;
  }
  const message = envelope ? record(envelope.message) : null;
  const messageId = message ? str(message.messageId) ?? str(message.message_id) : null;
  if (!message || !messageId || !MESSAGE_ID_RE.test(messageId)) {
    // Nothing to key a log row on. Authenticated, so it IS Pub/Sub — but a
    // redelivery of the same body is unusable in the same way.
    console.warn("[google] notification without a usable message id");
    return done(REFUSED, "unusable_envelope");
  }

  // ---- 2. The DeveloperNotification inside it. ------------------------------
  let notification: Record<string, unknown> | null = null;
  const data = str(message.data);
  if (data && data.length <= RTDN_MAX_BODY_BYTES) {
    try {
      notification = record(JSON.parse(Buffer.from(data, "base64").toString("utf8")));
    } catch {
      notification = null;
    }
  }
  const notificationType = notification ? typeLabel(notification) : "UNDECODABLE";
  const notificationUuid = notificationUuidForMessage(messageId);

  // ---- 3. The replay guard, claimed BEFORE any outbound work. ---------------
  const claim = await deps.claim({ notificationUuid, messageId, notificationType });
  if (claim === "replay") return done(OK, "replay");
  if (claim === "error") return done(RETRY, "claim_failed");

  const settle = (
    outcome: string,
    ids: { orderId?: string | null; externalRef?: string | null; productId?: string | null } = {},
  ): Promise<void> =>
    deps.settle({
      notificationUuid,
      outcome,
      orderId: ids.orderId ?? null,
      externalRef: ids.externalRef ?? null,
      productId: ids.productId ?? null,
    });

  if (!notification) {
    await settle("undecodable");
    console.warn("[google] notification data could not be decoded");
    return done(OK, "undecodable");
  }

  // ---- 4. Someone else's app is not our sale. -------------------------------
  if (notification.packageName !== deps.packageName) {
    await settle("wrong_package");
    console.warn("[google] notification for another package ignored");
    return done(OK, "wrong_package");
  }

  // ---- 5. Messages that carry no work. --------------------------------------
  if (notificationType === "TEST") {
    // Play Console's "Send test notification". Proving we consumed it is the
    // whole of the response.
    await settle("test");
    console.info("[google] TEST notification consumed");
    return done(OK, "test");
  }
  if (notificationType === "SUBSCRIPTION") {
    // This platform sells no Play subscriptions (per-child consumables only).
    await settle("ignored_subscription");
    return done(OK, "ignored_subscription");
  }

  // ---- 6. A refund or chargeback — the one that must never be missed. -------
  const voided = record(notification.voidedPurchaseNotification);
  if (voided) {
    const orderId = str(voided.orderId);
    const token = str(voided.purchaseToken);
    const refs = candidateRefsForVoided({ orderId, purchaseToken: token });
    if (refs.length === 0) {
      await settle("revoke_no_ref", { orderId: orderId && orderId.length <= 100 ? orderId : null });
      console.error("[google] voided notification carries no usable order id or token");
      return done(OK, "revoke_no_ref");
    }
    const taken = await deps.revoke(refs, "google_voided_purchase");
    if (taken === null) {
      // We do not know whether access was withdrawn. Ask to be told again;
      // revocation is idempotent.
      return done(RETRY, "revoke_failed");
    }
    const outcome = taken > 0 ? "revoked" : "revoke_nothing";
    await settle(outcome, { orderId: orderId && orderId.length <= 100 ? orderId : null, externalRef: refs[0] ?? null });
    console.info(`[google] voided purchase outcome=${outcome} taken=${taken}`);
    return done(OK, outcome);
  }

  // ---- 7. A one-time product purchase. --------------------------------------
  const oneTime = record(notification.oneTimeProductNotification);
  if (!oneTime) {
    await settle("ignored_type");
    return done(OK, "ignored_type");
  }
  const kind = int(oneTime.notificationType);
  if (kind === ONE_TIME_PRODUCT.CANCELED) {
    // A PENDING purchase the user abandoned. Nothing was granted for a pending
    // purchase, so there is nothing to take away.
    await settle("ignored_canceled");
    return done(OK, "ignored_canceled");
  }
  if (kind !== ONE_TIME_PRODUCT.PURCHASED) {
    await settle("ignored_type");
    return done(OK, "ignored_type");
  }

  const productId = str(oneTime.sku);
  const token = str(oneTime.purchaseToken);
  if (!productId || !PLAY_PRODUCT_ID_RE.test(productId) || !token || !PURCHASE_TOKEN_RE.test(token)) {
    await settle("unusable_purchase", {
      productId: productId && productId.length <= 200 ? productId : null,
    });
    console.warn("[google] PURCHASED notification with an unusable product or token");
    return done(OK, "unusable_purchase");
  }

  // ---- 8. RE-QUERY. The only answer this platform acts on. ------------------
  const requeried = await deps.requery(productId, token);
  if (!requeried.ok) {
    if (requeried.reason === "not_found" || requeried.reason === "malformed") {
      await settle("requery_not_found", { productId });
      console.error("[google] Google does not know the purchase a notification named");
      return done(OK, "requery_not_found");
    }
    // Ours or Google's, and worth a retry. Never a licence to grant from the
    // notification body. Left unsettled.
    console.error(`[google] re-query failed for a PURCHASED notification: ${requeried.reason}`);
    return done(RETRY, "requery_failed");
  }

  // ---- 9. THE SHARED WRITE PATH. --------------------------------------------
  const written = await deps.write(requeried.purchase);
  if (!written.ok) {
    if (RETRYABLE_WRITE_REFUSALS.has(written.reason)) {
      console.error(`[google] grant write failed (retryable) reason=${written.reason}`);
      return done(RETRY, "write_failed");
    }
    // Deterministic. The purchase stays UNCONSUMED, so if nobody fixes it Google
    // refunds the family automatically after three days.
    const outcome = `refuse_${written.reason}`.slice(0, 40);
    await settle(outcome, { productId });
    console.error(`[google] grant refused reason=${written.reason} product=${productId}`);
    return done(OK, outcome);
  }
  if (!written.granted) {
    const outcome = written.reason === "pending" ? "pending" : "test_not_granted";
    await settle(outcome, { productId });
    console.info(`[google] purchase recorded, not granted: ${outcome}`);
    return done(OK, outcome);
  }

  const outcome = written.alreadyGranted ? "granted_already" : "granted";
  await settle(outcome, { externalRef: written.externalRef, productId });
  console.info(`[google] ${outcome} product=${productId} consumed=${written.consumed}`);
  return done(OK, outcome);
}
