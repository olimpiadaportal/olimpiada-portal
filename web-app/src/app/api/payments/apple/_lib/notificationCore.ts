// WHAT AN APP STORE SERVER NOTIFICATION V2 ACTUALLY DOES TO THIS PLATFORM.
//
// ONE CORE, TWO ROUTES. The production endpoint and the sandbox endpoint differ
// in exactly one thing — which verifier and which API host they are bound to —
// because Apple's `SignedDataVerifier` takes the environment in its constructor.
// Everything else is this file, so the two rails cannot drift into behaving
// differently, which is the bug that would be discovered during App Review.
//
// FULLY INJECTED, AND THAT IS THE POINT. Every verifier call, every Apple API
// call and every database write arrives in `deps`. The consequence worth having
// is not testability for its own sake: it is that this file — the one that
// decides whether money becomes access — imports no secret, no network client
// and no database handle, so the whole decision can be exercised without a key,
// a certificate authority or a purchase.
//
// ------------------------------------------------------------------ DOCTRINE
// NEVER BELIEVE THE CLIENT, AND NEVER BELIEVE A NOTIFICATION BODY.
//
// A valid signature proves a message is GENUINELY APPLE'S. It does not make the
// message an AUTHORITY on what we should do. This is the posture
// `azericard/callback.ts` already takes toward the bank: the BACKREF post is a
// "go and check" ping, and only our own question gets an answer we believe. So
// the sequence below is always: verify -> RE-QUERY Apple by transaction id ->
// act on the re-queried answer. `toAppleGrant` enforces the last step in the
// type system by refusing any transaction whose `source` is not `"requery"`.
//
// THERE IS EXACTLY ONE DEPARTURE, AND IT IS IN THE FAIL-SAFE DIRECTION. When a
// REFUND or REVOKE arrives and the re-query cannot be completed, this file
// revokes anyway, using the transaction id from the (signature-verified)
// notification body. The reasoning is stated in full at that branch; in short,
// the doctrine exists to stop us GRANTING on weak evidence, and revoking is the
// opposite direction — the worst case of over-revoking is a support ticket,
// while the worst case of under-revoking is giving away the product after
// returning the money. That trade is deliberate. It is not a precedent for the
// grant path.
//
// ------------------------------------------------------------- STATUS CODES
// ALWAYS 200 FOR A MESSAGE WE CONSUMED OR DELIBERATELY IGNORED. Apple retries
// on any non-2xx, and asking to be re-sent a message we have already handled —
// or one we will refuse identically five more times — is pure noise on an
// endpoint that runs forever.
//
// NON-2xx ONLY WHEN A RETRY COULD GENUINELY HELP: a verification that may have
// failed for a transient reason, a re-query that did not complete, a write we do
// not know the outcome of. Those deliberately leave the notification UNSETTLED,
// so Apple's next delivery re-processes it and, if Apple gives up first, the row
// shows up in `idx_iap_notifications_unsettled` as an alarm instead of vanishing.
import { isUuid } from "@/lib/uuid";
import {
  isRevoked,
  type AppleEnvironment,
  type TransactionSource,
  type VerifiedTransaction,
} from "@/lib/payments/apple";
import type { AppleWriteResult } from "@/lib/payments/apple/grantEntitlement";
import { classifyNotification, isAutoRenewableOnly } from "./classify";
import { appleExternalRef } from "./externalRef";
import type { NotificationClaim } from "./store";

/**
 * Write refusals a RETRY could plausibly fix.
 *
 * `not_configured` is an operator fixing an environment variable;
 * `grant_failed` is a transport or RPC fault. Everything else the writer can say
 * — an unknown product, an unknown intent, a deleted child, a payload that
 * disagrees with our catalogue — is deterministic, and asking Apple to redeliver
 * a message we will refuse identically five more times is noise on an endpoint
 * that runs forever.
 */
const RETRYABLE_WRITE_REFUSALS: ReadonlySet<string> = new Set(["not_configured", "grant_failed"]);

/**
 * The parts of Apple's `ResponseBodyV2DecodedPayload` this rail reads, typed
 * structurally and defensively.
 *
 * Everything is `unknown` because everything in Apple's own type is optional and
 * because this module must not import the App Store library — `verifier.ts` is
 * the ONE place that dependency lives. Reading defensively also means a future
 * change in Apple's payload shape arrives as an ignored message rather than a
 * TypeError inside a public endpoint.
 */
export type DecodedNotification = {
  readonly notificationType?: unknown;
  readonly subtype?: unknown;
  readonly notificationUUID?: unknown;
  readonly data?: { readonly signedTransactionInfo?: unknown } | null;
};

/** The re-query, reduced to what this file needs of it. */
export type TransactionInfoResult =
  | { readonly ok: true; readonly signedTransactionInfo: string }
  | { readonly ok: false };

export type NotificationDeps<E extends AppleEnvironment> = {
  /** The rail this route is bound to. Never read from the payload. */
  readonly environment: E;

  /**
   * WHETHER THIS ROUTE MAY WRITE ACCESS AT ALL — the SECOND lock, never the
   * first.
   *
   * The first lock is the type system: the shared writer takes an
   * `AppleGrant<"Production">` and the only crossing is `requireProductionGrant`,
   * so a sandbox transaction cannot produce production access no matter what
   * this flag says. This exists so that the sandbox deployment ALSO stops before
   * the writer, on an operator-visible switch, and so that turning grants on in
   * an internal build is a deliberate act.
   *
   * If you ever find yourself adding a cast to make this flag meaningful on the
   * sandbox rail, stop: you are removing the first lock to make the second one
   * useful.
   */
  readonly allowGrants: boolean;

  /** `railForSignedData` — routes an untrusted blob, decides nothing else. */
  readonly claimedRail: (signed: string) => AppleEnvironment | null;
  readonly verifyNotification: (signed: string) => Promise<DecodedNotification | null>;
  readonly verifyTransaction: (
    signed: string,
    source: TransactionSource,
  ) => Promise<VerifiedTransaction<E> | null>;
  /** THE "go and check" call. */
  readonly getTransactionInfo: (transactionId: string) => Promise<TransactionInfoResult>;

  readonly claim: (input: {
    notificationUuid: string;
    environment: E;
    notificationType: string;
    subtype: string | null;
  }) => Promise<NotificationClaim>;
  readonly settle: (input: {
    notificationUuid: string;
    environment: E;
    outcome: string;
    transactionId: string | null;
    originalTransactionId: string | null;
    productId: string | null;
  }) => Promise<void>;
  readonly revoke: (externalRef: string, reason: string) => Promise<boolean>;

  /**
   * THE SHARED WRITE PATH — `lib/payments/apple/grantEntitlement.ts`, the same
   * function the redeem and restore routes call.
   *
   * It takes the RE-QUERIED TRANSACTION, not a grant object, and that is the
   * right boundary rather than an accident: deciding what a product sells,
   * computing the expiry, finding the child behind the appAccountToken and
   * crossing `requireProductionGrant` are all one decision, and a rule enforced
   * in two places is a rule that will be enforced in one. This module therefore
   * does no catalogue lookup and calls neither `toAppleGrant` nor
   * `requireProductionGrant` — it establishes WHICH transaction, and the writer
   * decides what that transaction is worth.
   */
  readonly write: (transaction: VerifiedTransaction<E>) => Promise<AppleWriteResult>;
};

export type NotificationResult = {
  /** What the route answers Apple. */
  readonly status: number;
  /** A short, enum-like code. Recorded and logged; never returned in a body. */
  readonly outcome: string;
};

/** Apple's own bound on a body we are willing to read at all. */
export const NOTIFICATION_MAX_BODY_BYTES = 256 * 1024;

const OK = 200;
/** "We could not process this; please send it again." */
const RETRY = 500;
/** "This message is not one we can verify, and a retry will not change that." */
const REFUSED = 400;

function done(status: number, outcome: string): NotificationResult {
  return { status, outcome };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Consume one signed notification body.
 *
 * `rawBody` is the request text, already size-capped and rate-limited by the
 * route. Parsing happens here so that a malformed body is exercised by the
 * tests along with everything else.
 */
export async function handleAppleNotification<E extends AppleEnvironment>(
  rawBody: string,
  deps: NotificationDeps<E>,
): Promise<NotificationResult> {
  // ---- 1. Shape. Nothing expensive before the body is even a body. --------
  let signedPayload: string | null = null;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      signedPayload = asString((parsed as { signedPayload?: unknown }).signedPayload);
    }
  } catch {
    signedPayload = null;
  }
  if (!signedPayload) return done(REFUSED, "no_signed_payload");

  // ---- 2. Which rail does it CLAIM to be? --------------------------------
  //
  // The claim is untrusted and is used for routing and nothing else. Checking it
  // before verifying is not a security decision — it is a cost one: verifying a
  // sandbox blob on the production rail does a full certificate-chain walk plus
  // an online revocation check, and that is a lever a public endpoint should not
  // hand to an anonymous caller. Lying about it gains nothing: claiming
  // "Production" sends the blob to the production verifier, where the chain
  // check fails.
  if (deps.claimedRail(signedPayload) !== deps.environment) {
    return done(REFUSED, "wrong_rail");
  }

  // ---- 3. Signature. ------------------------------------------------------
  const notification = await deps.verifyNotification(signedPayload);
  if (!notification) {
    // No detail, ever. The library's VerificationException distinguishes a bad
    // chain from a wrong bundle id from a wrong environment, and telling a
    // caller which is an oracle. NOT settled, and answered non-2xx: a
    // certificate-chain check can fail for a transient reason (an OCSP outage on
    // the production rail), and Apple's retry is the free repair for that.
    console.warn(`[apple] ${deps.environment} notification failed verification`);
    return done(REFUSED, "unverified");
  }

  const notificationUuid = asString(notification.notificationUUID);
  const notificationType = asString(notification.notificationType);
  if (!notificationUuid || !isUuid(notificationUuid) || !notificationType) {
    // Genuinely Apple's signature over something we cannot key or route. There
    // is nothing a retry improves.
    console.warn(`[apple] ${deps.environment} notification lacks a usable uuid or type`);
    return done(REFUSED, "unusable_envelope");
  }
  const subtype = asString(notification.subtype);

  // ---- 4. The replay guard, claimed BEFORE any outbound work. -------------
  const claim = await deps.claim({
    notificationUuid,
    environment: deps.environment,
    notificationType,
    subtype,
  });
  if (claim === "replay") {
    // Already consumed. Say 200 and do nothing — this is the whole reason the
    // log exists.
    console.info(
      `[apple] ${deps.environment} notification replay type=${notificationType} ignored`,
    );
    return done(OK, "replay");
  }
  if (claim === "error") {
    // Without the guard we could re-query Apple once per retry. Ask to be sent
    // the message again instead.
    return done(RETRY, "claim_failed");
  }

  const settle = (
    outcome: string,
    ids: {
      transactionId?: string | null;
      originalTransactionId?: string | null;
      productId?: string | null;
    } = {},
  ): Promise<void> =>
    deps.settle({
      notificationUuid,
      environment: deps.environment,
      outcome,
      transactionId: ids.transactionId ?? null,
      originalTransactionId: ids.originalTransactionId ?? null,
      productId: ids.productId ?? null,
    });

  const action = classifyNotification(notificationType);

  // ---- 5. Messages that carry no work. ------------------------------------
  if (action === "test") {
    // Apple's reachability probe, requested from `requestTestNotification`. The
    // only correct response is to prove we consumed it.
    await settle("test");
    console.info(`[apple] ${deps.environment} TEST notification consumed`);
    return done(OK, "test");
  }
  if (action === "ignore") {
    // Auto-renewable-only types cannot occur for our NON-RENEWING products; an
    // unknown type is one Apple added after this code was written. Both are
    // recorded and dropped, because inventing a handler for either is how a
    // DID_RENEW branch ends up extending an entitlement that never renews.
    const outcome = isAutoRenewableOnly(notificationType)
      ? "ignored_auto_renewable"
      : "ignored_type";
    await settle(outcome);
    console.info(
      `[apple] ${deps.environment} notification type=${notificationType} ${outcome}`,
    );
    return done(OK, outcome);
  }

  // ---- 6. The transaction the message is about. ---------------------------
  const signedTransactionInfo = asString(notification.data?.signedTransactionInfo);
  if (!signedTransactionInfo) {
    await settle("no_transaction");
    console.warn(
      `[apple] ${deps.environment} notification type=${notificationType} carries no transaction`,
    );
    return done(OK, "no_transaction");
  }

  // Verified, and tagged `"notification"` — which `toAppleGrant` REFUSES. That
  // refusal is the doctrine in the type system: this blob is read to learn WHICH
  // transaction to ask Apple about, and for nothing else.
  const announced = await deps.verifyTransaction(signedTransactionInfo, "notification");
  if (!announced) {
    // Left UNSETTLED on purpose: the same transient causes as step 3 apply, and
    // Apple's retry re-processes an unstamped row.
    console.warn(`[apple] ${deps.environment} notification transaction failed verification`);
    return done(REFUSED, "txn_unverified");
  }
  const announcedTxnId = asString(announced.payload.transactionId);
  const announcedOriginalId = asString(announced.payload.originalTransactionId);
  if (!announcedTxnId) {
    await settle("no_transaction_id");
    return done(OK, "no_transaction_id");
  }

  // ---- 7. RE-QUERY. The only answer this platform acts on. ----------------
  const requeried = await requeryTransaction(announcedTxnId, deps);

  // ---- 8a. REFUND / REVOKE. The one that must never be missed. ------------
  if (action === "revoke") {
    return revokeFromNotification({
      deps,
      settle,
      notificationType,
      announcedTxnId,
      announcedOriginalId,
      requeried,
    });
  }

  // ---- 8b. A purchase-confirming message. ---------------------------------
  if (!requeried) {
    // We do not know what Apple thinks. NOT a licence to grant from the
    // notification body — that is exactly the belief this rail refuses. Leave it
    // unsettled and ask to be told again; the reconcile sweep is the second net
    // underneath.
    console.error(
      `[apple] ${deps.environment} re-query failed for type=${notificationType} txn=${announcedTxnId}`,
    );
    return done(RETRY, "requery_failed");
  }

  const payload = requeried.payload;
  const originalId = asString(payload.originalTransactionId) ?? announcedOriginalId;
  const productId = asString(payload.productId);

  // A refund we were never told about, noticed because we asked. This is what
  // makes CONSUMPTION_REQUEST worth treating as a grant-class message: it costs
  // one re-query and buys a second chance to catch exactly this.
  if (isRevoked(payload)) {
    if (!originalId) {
      await settle("revoked_no_ref", { transactionId: announcedTxnId, productId });
      return done(OK, "revoked_no_ref");
    }
    const ref = appleExternalRef(deps.environment, originalId);
    const taken = await deps.revoke(ref, `apple_${notificationType.toLowerCase()}`.slice(0, 200));
    await settle("revoked_on_requery", {
      transactionId: announcedTxnId,
      originalTransactionId: originalId,
      productId,
    });
    console.info(
      `[apple] ${deps.environment} re-query says revoked type=${notificationType} ` +
        `txn=${announcedTxnId} taken=${taken}`,
    );
    return done(OK, "revoked_on_requery");
  }

  // THE SECOND LOCK (see `allowGrants`). Checked before the writer is called at
  // all, so a deployment with grants off does no work it cannot use — and, more
  // importantly, cannot reach a code path that writes.
  if (!deps.allowGrants) {
    await settle("grants_disabled", {
      transactionId: announcedTxnId,
      originalTransactionId: originalId,
      productId,
    });
    console.info(
      `[apple] ${deps.environment} purchase recorded, grants disabled txn=${announcedTxnId}`,
    );
    return done(OK, "grants_disabled");
  }

  // ---- 9. THE SHARED WRITE PATH. ------------------------------------------
  //
  // Everything from here — what the product sells, the expiry, which child the
  // appAccountToken names, and the one crossing from "verified" to "may create
  // access" — belongs to `grantAppleEntitlement`, which the redeem and restore
  // routes call too. This module deliberately does none of it: a rule enforced
  // in two places is a rule that will be enforced in one.
  const written = await deps.write(requeried);

  if (!written.ok) {
    if (RETRYABLE_WRITE_REFUSALS.has(written.reason)) {
      // We do not know whether access exists. Left UNSETTLED; the write is
      // idempotent on (source, external_ref), so a redundant retry costs one
      // upsert that changes nothing.
      console.error(
        `[apple] grant write failed (retryable) reason=${written.reason} txn=${announcedTxnId}`,
      );
      return done(RETRY, "write_failed");
    }
    // Deterministic: an unknown product, an unknown intent, a deleted child, a
    // payload that disagrees with our catalogue. Recorded and answered 200 — and
    // the family's intent stays unconsumed, which is what the reconcile sweep
    // and support look at.
    const outcome = `refuse_${written.reason}`;
    await settle(outcome, {
      transactionId: announcedTxnId,
      originalTransactionId: originalId,
      productId,
    });
    console.error(
      `[apple] ${deps.environment} grant refused reason=${written.reason} txn=${announcedTxnId}`,
    );
    return done(OK, outcome);
  }

  if (!written.granted) {
    // The writer verified a SANDBOX purchase and wrote nothing. That is
    // `requireProductionGrant` returning null inside it — the one crossing, and
    // it is closed. Recorded, because a reviewer's purchase arriving and
    // verifying is the single most useful fact to hold when a rejection has to
    // be answered.
    await settle("sandbox_not_granted", {
      transactionId: announcedTxnId,
      originalTransactionId: originalId,
      productId,
    });
    console.info(`[apple] sandbox purchase recorded, never granted txn=${announcedTxnId}`);
    return done(OK, "sandbox_not_granted");
  }

  // `alreadyGranted` means the intent was settled on this exact transaction
  // before we got here — a genuine redelivery that overtook our own log, or the
  // redeem route having won the race. Distinguished only so a log can say which;
  // both are successes.
  const outcome = written.alreadyGranted ? "granted_already" : "granted";
  await settle(outcome, {
    transactionId: announcedTxnId,
    originalTransactionId: originalId,
    productId,
  });
  console.info(
    `[apple] ${outcome} type=${notificationType} txn=${announcedTxnId} product=${productId}`,
  );
  return done(OK, outcome);
}

/**
 * Ask Apple about a transaction and verify the answer as `"requery"`.
 *
 * Two steps and one name, because they must never be separated: an envelope
 * from `getTransactionInfo` that is not verified afterwards is just a string,
 * and a blob verified with any other `source` is refused by `toAppleGrant`.
 */
async function requeryTransaction<E extends AppleEnvironment>(
  transactionId: string,
  deps: NotificationDeps<E>,
): Promise<VerifiedTransaction<E> | null> {
  const envelope = await deps.getTransactionInfo(transactionId);
  if (!envelope.ok) return null;
  return deps.verifyTransaction(envelope.signedTransactionInfo, "requery");
}

/**
 * REFUND / REVOKE — and the one place a notification body is allowed to decide
 * something.
 *
 * THE ARGUMENT, in full, because it is a deliberate departure from the doctrine
 * at the top of this file:
 *
 *   * The doctrine exists to stop us GRANTING on evidence weaker than an answer
 *     to our own question. Its failure mode is giving away product.
 *   * Revoking is the opposite direction. Its failure mode is a family losing
 *     access they paid for — recoverable in a support ticket, and loud, because
 *     they will tell us.
 *   * The message is signature-verified: it is genuinely Apple's, and it is
 *     about a transaction on our bundle id. An attacker cannot mint one, and
 *     replaying a genuine REFUND revokes a purchase that was already refunded.
 *   * `entitlement_revoke` only touches rows whose `revoked_at` is null, so
 *     doing this twice is a no-op.
 *   * The alternative is to answer non-2xx and hope: Apple's retries run out,
 *     and a dropped REFUND means the money went back and the access stayed.
 *
 * So: prefer the re-query, and when it cannot be had, act on the verified body
 * and record which of the two happened. This is not a precedent for the grant
 * path, where every one of those five points reads the other way.
 */
async function revokeFromNotification<E extends AppleEnvironment>(args: {
  deps: NotificationDeps<E>;
  settle: (
    outcome: string,
    ids?: {
      transactionId?: string | null;
      originalTransactionId?: string | null;
      productId?: string | null;
    },
  ) => Promise<void>;
  notificationType: string;
  announcedTxnId: string;
  announcedOriginalId: string | null;
  requeried: VerifiedTransaction<E> | null;
}): Promise<NotificationResult> {
  const { deps, settle, notificationType, announcedTxnId, announcedOriginalId, requeried } = args;

  const originalId = requeried
    ? asString(requeried.payload.originalTransactionId) ?? announcedOriginalId
    : announcedOriginalId;
  const productId = requeried ? asString(requeried.payload.productId) : null;

  if (!originalId) {
    // Nothing to key a revocation on. Settled rather than retried: the id is
    // absent from a verified payload, and a redelivery of the same payload is
    // absent in the same way.
    await settle("revoke_no_ref", { transactionId: announcedTxnId, productId });
    console.error(
      `[apple] ${deps.environment} ${notificationType} carries no original transaction id`,
    );
    return done(OK, "revoke_no_ref");
  }

  const ref = appleExternalRef(deps.environment, originalId);
  const taken = await deps.revoke(ref, `apple_${notificationType.toLowerCase()}`);

  // Three outcomes, distinguished so a log can be read six months later:
  //   revoked              — the re-query agreed the transaction is revoked.
  //   revoked_unconfirmed  — the re-query answered and did NOT show a
  //                          revocationDate. Apple's own eventual consistency
  //                          between a notification and the transaction endpoint
  //                          is the likely cause; we still take the access away,
  //                          because the message is genuine and revoking is the
  //                          fail-safe direction.
  //   revoked_unqueried    — the re-query could not be completed at all.
  const outcome = !requeried
    ? "revoked_unqueried"
    : isRevoked(requeried.payload)
      ? "revoked"
      : "revoked_unconfirmed";

  await settle(outcome, {
    transactionId: announcedTxnId,
    originalTransactionId: originalId,
    productId,
  });
  console.info(
    `[apple] ${deps.environment} ${notificationType} outcome=${outcome} ` +
      `txn=${announcedTxnId} taken=${taken}`,
  );
  return done(OK, outcome);
}
