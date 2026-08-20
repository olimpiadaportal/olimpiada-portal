// The AzeriCard ledger: checkout sessions in, payment facts out — SERVER ONLY.
//
// Everything here runs on the service-role client, so EVERY caller must have
// authorised first. Nothing in this module authorises anything; it is the layer
// below that decision.
//
// IT GRANTS NOTHING. A recorded payment is a fact about money, not a fact about
// access. docs/STORE_PAYMENTS_COMPLIANCE.md §4.1 requires a provider-agnostic
// `entitlements` table to be the single source of truth for access, with ABB as
// one PRODUCER of entitlement rows — and that table does not exist yet. Wiring
// money straight to access before it exists is precisely the trap that document
// names, and it is the difference between "add IAP" being a two-week job and
// being a rewrite. So: record, and stop.
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
};

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
    .select("id, owner_parent_profile_id, kind, amount, currency, status, provider_session_id")
    .eq("provider", PROVIDER)
    .eq("provider_session_id", order)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    ownerParentProfileId: row.owner_parent_profile_id as string,
    kind: row.kind as string,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    currency: (row.currency as string) ?? "AZN",
    status: (row.status as string) ?? "pending",
    order: row.provider_session_id as string,
  };
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
  shape: CallbackShape;
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
  const { error: eventError } = await admin.from("payment_events").insert({
    provider: PROVIDER,
    event_id: `cb:${order}`,
    payload_json: {
      order,
      callback: sanitizeCallbackForStorage({
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
      granted: false, // see the module header: this layer grants nothing.
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
