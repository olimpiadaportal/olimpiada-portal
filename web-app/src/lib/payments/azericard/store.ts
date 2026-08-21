// The AzeriCard ledger: checkout sessions in, payment facts out — SERVER ONLY.
//
// Everything here runs on the service-role client, so EVERY caller must have
// authorised first. Nothing in this module authorises anything; it is the layer
// below that decision.
//
// IT GRANTS NOTHING, AND THAT IS STILL TRUE AFTER MIGRATION 125. A recorded
// payment is a fact about money; access is `entitlements`' job
// (docs/STORE_PAYMENTS_COMPLIANCE.md §4.1, migration 124), and the rail that
// produces an entitlement row is the SUBSCRIPTION, mirrored by a trigger.
//
// Since 125 a verified payment DOES cause a plan — or, since 127, an olympiad
// package — to be applied, but not here.
// This module records the money and advances the session to `paid`; the
// redemption is a separate, later, separately-recorded step
// (`checkout_redeem_plan`, reached through lib/payments/checkoutIntent). Keeping
// the two apart is what makes "money without delivery" and "delivery without
// money" both queryable after the fact instead of being one indivisible write
// that either happened or did not.
//
// EXISTING TABLES ONLY, by design:
//   * `checkout_sessions` — one row per initiated payment; `provider_session_id`
//     holds our minted ORDER.
//   * `payments`          — one row per order; UNIQUE(provider, provider_ref)
//     makes the write idempotent under gateway retries.
//   * `payment_events`    — UNIQUE(provider, event_id) is the idempotency log,
//     and is also how RRN / INT_REF are claimed exactly once (see below).
import "server-only";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/uuid";
import { isValidOrder, mintOrderCandidate } from "./format";
import { sanitizeCallbackForStorage, type CallbackShape } from "./callback";
import { paymentStatusFor, type PaymentOutcome } from "./codes";
import { settledOutcome, type StatusReconciliation } from "./statusResponse";

/** The `provider` string every row this integration writes carries. */
export const PROVIDER = "azericard";

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/** How many ORDER candidates we try before giving up. */
const ORDER_MINT_ATTEMPTS = 8;

export type CheckoutKind = "subscription" | "olympiad" | "protocol_test";

/**
 * The kind a PARENT plan payment carries — the one checkout that belongs to a
 * signed-in family rather than to the owner's sandbox. Declared here, beside the
 * union, so the callback and the checkout core cannot drift on the literal.
 */
export const PLAN_CHECKOUT_KIND: CheckoutKind = "subscription";

/**
 * The kind a PARENT olympiad-package payment carries (migration 127).
 *
 * It is its own value and not a second use of `subscription` for one reason
 * that matters more than tidiness: a settlement report has to be able to say
 * what was sold. Folding a lifetime package purchase into the subscription kind
 * would make every reconciliation answer "a subscription" to a question the
 * accountant asked about a package.
 */
export const OLYMPIAD_CHECKOUT_KIND: CheckoutKind = "olympiad";

export type CreateSessionInput = {
  ownerParentProfileId: string;
  kind: CheckoutKind;
  /** Major units. Always server-computed; a client-supplied amount is a bug. */
  amount: number;
  currency: string;
  childSubscriptionId?: string | null;
};

export type CreateSessionResult =
  | { ok: true; checkoutSessionId: string; order: string }
  | { ok: false; error: "not_configured" | "invalid_input" | "order_exhausted" | "db_error" };

/**
 * Create a checkout session and mint its ORDER.
 *
 * ORDER UNIQUENESS IS THE DATABASE'S JOB. The spec says the last six digits are
 * the system trace audit number and must be unique per terminal per day, and a
 * collision would cross-link two payments — so the ORDER is minted as
 * `YYYYMMDD` (UTC) + six CSPRNG digits and inserted against a UNIQUE index on
 * (provider, provider_session_id). A collision surfaces as SQLSTATE 23505 and
 * we mint again. Random-and-hope would be a 39% chance of at least one
 * collision at a thousand orders a day; this is a certainty instead.
 */
export async function createCheckoutSession(
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  if (!isServiceRoleConfigured) return { ok: false, error: "not_configured" };
  if (!isUuid(input.ownerParentProfileId)) return { ok: false, error: "invalid_input" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "invalid_input" };
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) return { ok: false, error: "invalid_input" };
  if (input.childSubscriptionId != null && !isUuid(input.childSubscriptionId)) {
    return { ok: false, error: "invalid_input" };
  }

  const admin = getAdminClient();
  for (let attempt = 0; attempt < ORDER_MINT_ATTEMPTS; attempt++) {
    const order = mintOrderCandidate();
    const { data, error } = await admin
      .from("checkout_sessions")
      .insert({
        owner_parent_profile_id: input.ownerParentProfileId,
        kind: input.kind,
        child_subscription_id: input.childSubscriptionId ?? null,
        amount: input.amount,
        currency: input.currency,
        status: "pending",
        provider: PROVIDER,
        provider_session_id: order,
      })
      .select("id")
      .maybeSingle();

    if (!error && data?.id) {
      return { ok: true, checkoutSessionId: data.id as string, order };
    }
    if (error?.code === UNIQUE_VIOLATION) continue; // collision — mint again
    if (error) {
      // Never surface a Postgres message to a caller; log it here and return a
      // generic code.
      console.error("[azericard] checkout session insert failed", error.code ?? "unknown");
      return { ok: false, error: "db_error" };
    }
  }
  return { ok: false, error: "order_exhausted" };
}

export type CheckoutSessionRow = {
  id: string;
  ownerParentProfileId: string;
  kind: string;
  amount: number | null;
  currency: string;
  status: string;
  order: string;
  /**
   * The plan this checkout was opened for, when there is one. Carried so a
   * retry can be minted against the same plan without a second lookup, and so
   * an unpaid checkout can be found again from the plan side. Null for the
   * owner's protocol test, which belongs to no plan, and for a `plan_start`
   * intent, whose subscription does not exist until the payment is redeemed.
   */
  childSubscriptionId: string | null;
  // ---- The INTENT (migration 125) ------------------------------------------
  // What this payment is FOR. NULL on the owner's protocol test and on every
  // row written before 125; non-NULL means a verified payment may be redeemed
  // into a plan, exactly once. Read here so the checkout layer can re-price and
  // re-authorise without a second query, and so nothing has to infer intent
  // from an amount.
  /** 'plan_start' | 'plan_change', as recorded when the session was opened. */
  intentKind: string | null;
  /** The child. NULL only after that child was deleted (the FK sets it null). */
  studentProfileId: string | null;
  /** The FROZEN basket, exactly as `plan_items_normalize` left it. */
  intentItems: unknown;
  /** Beyond this the intent is not redeemable — see checkout_redeem_plan. */
  expiresAt: string | null;
  /** Set once, for BOTH terminal outcomes. Non-null = already decided. */
  redeemedAt: string | null;
  /** 'applied' | 'needs_review' once decided. */
  redemptionStatus: string | null;
};

/** The row shape both readers below select. One list, so they cannot drift. */
// ONE string literal, deliberately not a concatenation: supabase-js infers the
// row shape from the literal type of this argument, and `"a" + "b"` widens it to
// `string`, which silently turns every read below into an untyped one. It is
// therefore left long on purpose; there is no formatter in this project to
// disable, and naming one that is not installed fails `next build` outright
// ("Definition for rule 'prettier/prettier' was not found").
const SESSION_COLUMNS = "id, owner_parent_profile_id, kind, child_subscription_id, amount, currency, status, provider_session_id, intent_kind, student_profile_id, intent_items, expires_at, redeemed_at, redemption_status";

function toSessionRow(data: Record<string, unknown>): CheckoutSessionRow {
  return {
    id: data.id as string,
    ownerParentProfileId: data.owner_parent_profile_id as string,
    kind: data.kind as string,
    amount: data.amount === null || data.amount === undefined ? null : Number(data.amount),
    currency: (data.currency as string) ?? "AZN",
    status: (data.status as string) ?? "pending",
    order: data.provider_session_id as string,
    childSubscriptionId: (data.child_subscription_id as string | null) ?? null,
    intentKind: (data.intent_kind as string | null) ?? null,
    studentProfileId: (data.student_profile_id as string | null) ?? null,
    intentItems: data.intent_items ?? null,
    expiresAt: (data.expires_at as string | null) ?? null,
    redeemedAt: (data.redeemed_at as string | null) ?? null,
    redemptionStatus: (data.redemption_status as string | null) ?? null,
  };
}

/**
 * Look an ORDER up. Returns null for an unknown one — and an unknown ORDER is a
 * hard stop, never a reason to create a session on the fly: a callback naming an
 * order we never minted is either noise or an attack.
 */
export async function findSessionByOrder(order: string): Promise<CheckoutSessionRow | null> {
  if (!isServiceRoleConfigured) return null;
  if (!isValidOrder(order)) return null;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("checkout_sessions")
    .select(SESSION_COLUMNS)
    .eq("provider", PROVIDER)
    .eq("provider_session_id", order)
    .maybeSingle();
  if (error || !data) return null;
  return toSessionRow(data as Record<string, unknown>);
}

/**
 * The newest UNFINISHED checkout a parent still has open for a given CHILD.
 *
 * KEYED ON THE CHILD, NOT ON THE SUBSCRIPTION (migration 125). It used to key on
 * `child_subscription_id`, which was possible only because the plan had already
 * been applied before the charge — the very ordering that made the money
 * optional. A `plan_start` intent has no subscription until its payment is
 * redeemed, so keying on one would have made exactly the checkout that matters
 * most (a family's first) impossible to find again.
 *
 * `pending` (opened, never completed) and `failed` (the gateway told us, through
 * our own status query, that it did not go through) are the two states a parent
 * can still act on. `paid` is deliberately absent: a completed payment is not an
 * outstanding one, and returning it would put a "finish paying" prompt in front
 * of someone who already has.
 *
 * EXPIRED AND REDEEMED ROWS ARE EXCLUDED HERE, not filtered by the caller. An
 * expired intent is no longer redeemable, so offering to pay it would take money
 * for something that cannot be delivered.
 *
 * The parent id is part of the WHERE clause, not a post-filter — the caller has
 * already authorized, and this keeps a mistyped student id from ever returning
 * another family's row.
 *
 * SCOPED BY KIND (migration 127), and that parameter is REQUIRED. A family can
 * now have an unfinished subscription checkout AND an unfinished olympiad one at
 * the same time for the same child. Without the filter the subscribe page would
 * offer to "finish paying" a package, and the package modal would offer to
 * finish paying a plan — each showing the other's amount. A default would be the
 * same bug waiting for the next caller to inherit it.
 */
export async function findOutstandingSession(
  ownerParentProfileId: string,
  studentProfileId: string,
  kind: CheckoutKind,
): Promise<CheckoutSessionRow | null> {
  if (!isServiceRoleConfigured) return null;
  if (!isUuid(ownerParentProfileId) || !isUuid(studentProfileId)) return null;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("checkout_sessions")
    .select(SESSION_COLUMNS)
    .eq("provider", PROVIDER)
    .eq("owner_parent_profile_id", ownerParentProfileId)
    .eq("student_profile_id", studentProfileId)
    .eq("kind", kind)
    .not("intent_kind", "is", null)
    .is("redeemed_at", null)
    .gt("expires_at", new Date().toISOString())
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toSessionRow(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Reference claims — "an RRN or an INT_REF is accepted at most once"
// ---------------------------------------------------------------------------

/**
 * `payment_events` has UNIQUE(provider, event_id), which is exactly the
 * primitive needed to claim a reference exactly once. Claiming `rrn:<RRN>` and
 * `intref:<INT_REF>` means a second callback carrying the same references can
 * never be processed as a second payment — and, because the claim row records
 * which ORDER took it, a REPLAY of a valid tuple against a DIFFERENT order is
 * detected rather than merely deduplicated.
 *
 * That distinction is the whole point. The gateway does not sign ORDER, so a
 * leaked callback tuple can legitimately be re-posted against any order id an
 * attacker likes; the signature still verifies. The claim turns "the signature
 * passes" into "…and no other order already owns these references".
 */
export type ClaimResult = "claimed" | "already_ours" | "taken_by_other_order" | "db_error";

async function claimReference(
  kind: "rrn" | "intref",
  reference: string,
  order: string,
): Promise<ClaimResult> {
  const admin = getAdminClient();
  const eventId = `${kind}:${reference}`;
  const { error } = await admin.from("payment_events").insert({
    provider: PROVIDER,
    event_id: eventId,
    payload_json: { order, kind },
    processed_at: new Date().toISOString(),
  });
  if (!error) return "claimed";
  if (error.code !== UNIQUE_VIOLATION) {
    console.error("[azericard] reference claim failed", error.code ?? "unknown");
    return "db_error";
  }
  const { data } = await admin
    .from("payment_events")
    .select("payload_json")
    .eq("provider", PROVIDER)
    .eq("event_id", eventId)
    .maybeSingle();
  const owner = (data as { payload_json?: { order?: unknown } } | null)?.payload_json?.order;
  return typeof owner === "string" && owner === order ? "already_ours" : "taken_by_other_order";
}

/**
 * A READ-ONLY look at whether either reference is already owned by a DIFFERENT
 * order. The callback route runs this BEFORE spending a status query, so a
 * replayed tuple is refused without an outbound network call — the claim insert
 * in `recordOutcome` is still what closes the race, this is only the cheap
 * early exit that keeps the endpoint from being an amplifier.
 *
 * Errs on the side of "no conflict" when the read fails: the authoritative
 * claim will catch it a moment later, and failing closed here would let one
 * flaky read block a genuine payment from being recorded.
 */
export async function hasReferenceConflict(
  order: string,
  rrn: string | null,
  intRef: string | null,
): Promise<boolean> {
  if (!isServiceRoleConfigured) return false;
  const ids: string[] = [];
  if (rrn) ids.push(`rrn:${rrn}`);
  if (intRef) ids.push(`intref:${intRef}`);
  if (ids.length === 0) return false;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("payment_events")
    .select("event_id, payload_json")
    .eq("provider", PROVIDER)
    .in("event_id", ids);
  if (error || !data) return false;
  return (data as { payload_json?: { order?: unknown } }[]).some((row) => {
    const owner = row.payload_json?.order;
    return typeof owner === "string" && owner !== order;
  });
}

// ---------------------------------------------------------------------------
// Recording the outcome
// ---------------------------------------------------------------------------

export type RecordOutcomeInput = {
  session: CheckoutSessionRow;
  /**
   * The callback that triggered this, when there was one.
   *
   * NULL for the RECONCILIATION SWEEP (migration 126), which exists precisely
   * because a callback never arrived. Nothing this function DECIDES has ever
   * come from here — the verdict is `reconciliation`, i.e. what the gateway
   * itself answered about our order — so its absence changes only what is
   * written into the audit copy, and the audit copy says which of the two it
   * was rather than leaving a reader to guess.
   */
  shape: CallbackShape | null;
  /** The reconciliation of the TRTYPE 90 answer — the ONLY thing we believe. */
  reconciliation: StatusReconciliation;
  /** Diagnostics for the ledger. No response body, no card data, ever. */
  statusMeta: { queried: boolean; error?: string; format?: string; unrecognisedCount?: number };
};

export type RecordOutcomeResult =
  | { ok: true; outcome: PaymentOutcome; replay: boolean }
  | { ok: false; error: "reference_reused" | "db_error" | "not_configured" };

/**
 * Write the payment fact idempotently.
 *
 * Order of operations is deliberate:
 *   1. claim RRN and INT_REF   — refuses a replay against another order;
 *   2. upsert `payments`       — UNIQUE(provider, provider_ref) makes a repeat
 *                                callback a no-op rather than a second row;
 *   3. advance `checkout_sessions.status` FORWARD ONLY;
 *   4. log the callback in `payment_events`, sanitised.
 *
 * A status is only ever moved OUT of `pending`. Nothing here can turn a
 * succeeded payment back into a pending or failed one — a refund or a reversal
 * is its own flow with its own evidence, not a late callback.
 */
export async function recordOutcome(
  input: RecordOutcomeInput,
): Promise<RecordOutcomeResult> {
  if (!isServiceRoleConfigured) return { ok: false, error: "not_configured" };
  const admin = getAdminClient();
  const { session, shape, reconciliation } = input;
  const order = session.order;

  // `payments.amount` is NOT NULL and a payment row with a made-up amount is
  // worse than no row. The callback route refuses earlier for the same reason;
  // this is the guard that keeps a future caller from getting it wrong.
  if (session.amount === null) {
    console.error("[azericard] refusing to record a payment for a session with no amount");
    return { ok: false, error: "db_error" };
  }

  let replay = false;
  // CLAIM FROM THE STATUS QUERY, NOT FROM THE CALLBACK.
  //
  // `shape` is the callback, and the callback's signature does not cover ORDER
  // — that is the whole reason this design re-queries. Claiming `shape.rrn`
  // against OUR order let an unauthenticated caller bind a real transaction's
  // references to an unrelated order of theirs: the claim is permanent, so the
  // genuine payment could then never be recorded ("reference_reused" forever).
  // `reconciliation` holds what the gateway itself answered for THIS order, so
  // it is the only source with the authority to bind a reference.
  //
  // A null here means the authoritative answer did not carry that reference, in
  // which case we claim nothing rather than falling back to the untrusted copy —
  // the fallback would reopen exactly the hole this closes.
  for (const [kind, reference] of [
    ["rrn", reconciliation.rrn],
    ["intref", reconciliation.intRef],
  ] as const) {
    if (!reference) continue;
    const claim = await claimReference(kind, reference, order);
    if (claim === "taken_by_other_order") {
      // Log the SHAPE of the problem, never the references themselves: they are
      // the thing being replayed and a log is a place they should not accumulate.
      console.warn(`[azericard] ${kind} already claimed by a different order`);
      return { ok: false, error: "reference_reused" };
    }
    if (claim === "db_error") return { ok: false, error: "db_error" };
    if (claim === "already_ours") replay = true;
  }

  // settledOutcome, not reconciliation.outcome: the gateway can answer ACTION=0
  // about a DIFFERENT order, and recording that as succeeded would attribute
  // someone else's money to this checkout. See its doc comment.
  const outcome = settledOutcome(reconciliation);
  const status = paymentStatusFor(outcome);

  // 2. payments — insert once, then only ever advance out of 'pending'.
  const { error: insertError } = await admin.from("payments").insert({
    profile_id: session.ownerParentProfileId,
    provider: PROVIDER,
    provider_ref: order,
    amount: session.amount,
    currency: session.currency,
    status,
    checkout_session_id: session.id,
  });
  if (insertError) {
    if (insertError.code !== UNIQUE_VIOLATION) {
      console.error("[azericard] payment insert failed", insertError.code ?? "unknown");
      return { ok: false, error: "db_error" };
    }
    replay = true;
    const { error: updateError } = await admin
      .from("payments")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("provider", PROVIDER)
      .eq("provider_ref", order)
      .eq("status", "pending");
    if (updateError) {
      console.error("[azericard] payment update failed", updateError.code ?? "unknown");
      return { ok: false, error: "db_error" };
    }
  }

  // 3. checkout session status — forward only.
  const sessionStatus =
    status === "succeeded" ? "paid" : status === "failed" ? "failed" : "pending";
  if (sessionStatus !== "pending") {
    await admin
      .from("checkout_sessions")
      .update({ status: sessionStatus })
      .eq("id", session.id)
      .eq("status", "pending");
  }

  // 4. the audit copy. Card fields are stripped by sanitizeCallbackForStorage
  // and were already dropped at parse time; the status RESPONSE BODY is never
  // stored at all (§8.2 says it carries the masked card number).
  //
  // TWO EVENT IDS, ONE PER ORIGIN. `cb:<order>` is a callback we received;
  // `recon:<order>` is an answer we went and asked for because no callback came
  // (migration 126). Sharing one id would make the sweep's first write look like
  // a replay of a callback that never happened, and a ledger that cannot tell
  // "they told us" from "we asked" is a ledger a dispute cannot be read from.
  // Either may follow the other: a late callback after a reconciliation writes
  // its own row, `payments` is already idempotent, and the session status only
  // ever moves forward.
  const { error: eventError } = await admin.from("payment_events").insert({
    provider: PROVIDER,
    event_id: shape ? `cb:${order}` : `recon:${order}`,
    payload_json: {
      order,
      source: shape ? "callback" : "reconciliation",
      callback: shape === null ? null : sanitizeCallbackForStorage({
        AMOUNT: shape.amount,
        CURRENCY: shape.currency ?? "",
        ORDER: shape.order,
        ACTION: shape.action ?? "",
        RC: shape.rc ?? "",
        APPROVAL: shape.approval ?? "",
        RRN: shape.rrn ?? "",
        INT_REF: shape.intRef ?? "",
        TERMINAL: shape.terminal,
        TRTYPE: shape.trtype ?? "",
        TIMESTAMP: shape.timestamp ?? "",
        // NONCE and P_SIGN complete the record. sanitizeCallbackForStorage
        // documents that it keeps P_SIGN precisely so a disputed callback stays
        // re-verifiable months later — which was untrue while the only caller
        // never passed it. Neither is a credential: P_SIGN is a signature over
        // data the gateway already sent us, and verifying it needs THEIR public
        // key, which is not secret. Without both, a stored callback cannot be
        // re-checked against that key, and a dispute has nothing to stand on.
        NONCE: shape.nonce ?? "",
        P_SIGN: shape.signatureHex,
      }),
      status_query: {
        ...input.statusMeta,
        outcome: reconciliation.outcome,
        approved: reconciliation.approved,
        mismatches: reconciliation.mismatches,
        action: reconciliation.action,
        rc: reconciliation.rc,
      },
      // This WRITER grants nothing (see the module header). Redemption is its
      // own step and leaves its own `redeem:<order>` event beside this one, so
      // the ledger says which of the two happened rather than implying it.
      granted: false,
    },
    processed_at: new Date().toISOString(),
  });
  if (eventError && eventError.code !== UNIQUE_VIOLATION) {
    console.error("[azericard] payment event insert failed", eventError.code ?? "unknown");
    return { ok: false, error: "db_error" };
  }
  if (eventError?.code === UNIQUE_VIOLATION) replay = true;

  return { ok: true, outcome, replay };
}

/**
 * Is this profile id a real parent? Used by the owner-only test route, which
 * takes the owning profile as input rather than from a session. Ownership is
 * re-verified server-side even though the caller already proved they hold the
 * test token — a token is authentication, not a licence to name any row.
 */
export async function isParentProfile(profileId: string): Promise<boolean> {
  if (!isServiceRoleConfigured || !isUuid(profileId)) return false;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("profile_roles")
    .select("profile_id, roles!inner(code)")
    .eq("profile_id", profileId)
    .eq("roles.code", "parent")
    .maybeSingle();
  return !error && !!data;
}
