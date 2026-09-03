// THE APPLE WRITE PATH — the ONE place a verified Apple transaction becomes
// access on this platform. SERVER ONLY.
//
// WHY ONE FUNCTION AND NOT THREE. Three callers need this and they must not
// drift:
//   * POST /api/mobile/v1/iap/apple/redeem   — the fast path, run a second
//     after the store sheet closes, so a parent is not staring at a spinner
//     while Apple gets round to sending a notification;
//   * POST /api/mobile/v1/iap/apple/restore  — the path Apple REQUIRES to
//     exist (its absence is itself a rejection reason);
//   * the App Store Server Notification consumer under app/api/payments/apple/,
//     owned by another module, which imports `grantAppleEntitlement` from here.
// A rule enforced in three places is a rule that will be enforced in two.
//
// THE DOCTRINE, AND THIS IS WHERE IT PAYS. A signature proves a message is
// GENUINE; it does not make the message an AUTHORITY. The AzeriCard callback
// takes the same posture toward the bank (its header calls the callback a "go
// and check" ping and nothing more), and `toAppleGrant` enforces it in the type
// system by refusing any transaction whose `source` is not `requery`. So the
// only door into this module is a transaction that came back from a request WE
// opened, to a host WE named, about a transaction id WE asked after — which is
// what `requeryVerifiedTransaction` below is for. Both public functions restate
// the check rather than assuming a caller got it right.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO
//   * It never decides WHAT was sold from the payload. The payload's productId
//     is a LOOKUP KEY into our own catalogue (`iap_products`); the scope and the
//     interval come from OUR row, never from Apple.
//   * It never invents a child. `iap_purchase_intents.id` IS the
//     appAccountToken, and it is the only thing on earth that knows which child
//     a purchase was for — an Apple purchase attaches to an Apple ID, and one
//     parent buying maths for three children produces three otherwise
//     indistinguishable transactions.
//   * It DOES grant from Sandbox, and that is not a relaxation — it is the
//     reason the rail passes review at all. App Review signs a SANDBOX Apple ID
//     into the PRODUCTION build, so a reviewer's purchase arrives here marked
//     Sandbox; refusing it means they pay, receive nothing, and reject the app.
//     A sandbox grant is NAMESPACED with an "sbx:" prefix so its transaction id
//     can never collide with the production id that shares its digits, which is
//     the hazard that actually mattered. Set APPLE_IAP_SANDBOX_GRANTS=off to
//     disable it; the default is on, because default-off costs a rejection.
//   * It has no Android branch. `iap_products.platform` is the structural guard
//     — no google_play rows exist, so there is nothing to sell on Android — and
//     the lookup below pins `platform = 'ios'` rather than reading a platform
//     from anywhere. Do not add a fallback that would invent one.
import "server-only";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import type { PlanInterval } from "@/lib/pricingConfigurator";
import { getAppleIapConfig, sandboxGrantsEnabled } from "./config";
import { productionRail, sandboxRail } from "./rails";
import {
  requireProductionGrant,
  sandboxGrantAsProduction,
  toAppleGrant,
  type AppleGrant,
  type AppleGrantRejection,
} from "./transaction";
import type { VerifiedTransaction } from "./environment";

/** The store platform this rail sells on. A constant, never a parameter. */
const PLATFORM = "ios";

/** The entitlement source enum member for this rail (public.entitlement_source). */
const SOURCE = "apple_iap";

/**
 * Apple's `TransactionIdNotFoundError`. Returned by the PRODUCTION host for a
 * transaction that only exists in sandbox, and it is the documented signal to
 * ask the sandbox host the same question.
 */
const TRANSACTION_NOT_FOUND = 4040010;

/** entitlements.note is capped at 500 by the RPC; stay well inside it. */
const NOTE_MAX = 200;

/** What our catalogue says a store product sells. Mirrors public.entitlement_scope. */
export type IapScope = "subject" | "olympiad_package";

export type IapProductRow = {
  readonly id: string;
  readonly scope: IapScope;
  readonly subjectId: string | null;
  readonly packageId: string | null;
  readonly gradeId: string | null;
  readonly interval: PlanInterval | null;
  readonly active: boolean;
};

/**
 * Why a write was refused. INTERNAL CODES — safe to log server-side, never to
 * be returned to a client. The routes map them onto trilingual keys.
 */
export type AppleWriteRefusal =
  | AppleGrantRejection
  | "not_configured"
  | "unknown_product"
  | "unknown_intent"
  | "intent_not_yours"
  | "intent_mismatch"
  | "child_missing"
  | "transaction_claimed"
  | "grant_failed";

export type AppleWriteResult =
  | {
      readonly ok: true;
      /** True only for a PRODUCTION grant that reached `entitlements`. */
      readonly granted: true;
      /** Where the transaction was verified. A Sandbox grant is real access,
       *  namespaced with an "sbx:" transaction id — see the header. Reporting it
       *  honestly is what lets a log, a route and a support query tell an App
       *  Review purchase apart from a paying customer's. */
      readonly environment: "Production" | "Sandbox";
      readonly entitlementId: string;
      /** The intent was already consumed by THIS transaction before this call. */
      readonly alreadyGranted: boolean;
      readonly intentId: string;
      readonly studentProfileId: string;
      readonly scope: IapScope;
      readonly productId: string;
      readonly originalTransactionId: string;
      /** ISO, or null for a lifetime (package) grant. */
      readonly endsAt: string | null;
    }
  | {
      readonly ok: true;
      readonly granted: false;
      readonly environment: "Sandbox";
      readonly intentId: string;
      readonly studentProfileId: string;
      readonly productId: string;
      readonly originalTransactionId: string;
    }
  | {
      readonly ok: false;
      readonly reason: AppleWriteRefusal;
      /**
       * IS THIS WORTH ASKING AGAIN, or is it a decision?
       *
       * The notification consumer needs exactly this and cannot infer it: Apple
       * re-delivers a server notification for up to three days whenever the
       * endpoint answers non-2xx, so answering "retry" to a DECISION (a refunded
       * transaction, a product we do not sell) buys three days of pointless
       * redelivery, while answering "accepted" to a transient fault (our
       * database was down) throws the notification away forever. Only OUR OWN
       * faults are transient; every verification and attribution refusal is a
       * settled answer that a retry would reach identically.
       */
      readonly retryable: boolean;
    };

export type AppleRequeryResult =
  | { readonly ok: true; readonly transaction: VerifiedTransaction }
  | {
      readonly ok: false;
      /**
       * `unavailable` is the only RETRYABLE one — Apple was unreachable or
       * answered with something we could not parse. `not_found` means both
       * hosts denied knowing the id, which for a client-supplied id is the
       * normal answer to a made-up one.
       */
      readonly reason: "not_configured" | "not_found" | "unavailable" | "unverified";
    };

/**
 * Only OUR OWN faults are worth a retry. Everything else — an unverifiable
 * payload, an unknown product, an intent that is not the caller's — reaches the
 * same answer however many times it is asked.
 */
function refuse(reason: AppleWriteRefusal): AppleWriteResult {
  return {
    ok: false,
    reason,
    retryable: reason === "not_configured" || reason === "grant_failed",
  };
}

/**
 * GO AND ASK APPLE. The only way to obtain a grantable transaction.
 *
 * PRODUCTION FIRST, THEN SANDBOX, and the order is not a preference — it is the
 * only order that is safe. Asking sandbox first would let a sandbox Apple ID
 * answer for a transaction id that also exists in production. Asking production
 * first means a real purchase is always resolved on the rail that can grant, and
 * sandbox is consulted only for ids production denies knowing.
 *
 * THE SANDBOX CALL IS NOT OPTIONAL EITHER. App Review testers purchase in
 * sandbox against this same production deployment, because the shipped binary
 * knows no other server. A deployment that could not verify sandbox data would
 * fail review while looking, from here, entirely correct.
 */
export async function requeryVerifiedTransaction(
  transactionId: string,
): Promise<AppleRequeryResult> {
  if (getAppleIapConfig() === null) return { ok: false, reason: "not_configured" };

  const production = productionRail();
  const first = await production.api.getTransactionInfo(transactionId);
  if (first.ok) {
    // `source: "requery"` is the ONLY place this string is legitimately passed.
    // It is what `toAppleGrant` checks first, and it is true here precisely
    // because the blob came back from the call two lines above.
    const verified = await production.verifier.verifyTransaction(
      first.data.signedTransactionInfo,
      "requery",
    );
    if (!verified) {
      console.error("[apple] production re-query did not verify");
      return { ok: false, reason: "unverified" };
    }
    return { ok: true, transaction: verified };
  }

  // Only a genuine "no such transaction here" sends us to the other host. A
  // network fault or a 500 is NOT that answer, and treating it as one would ask
  // sandbox to adjudicate a production purchase.
  const askSandbox =
    first.error === "http_error" &&
    (first.apiError === TRANSACTION_NOT_FOUND || first.status === 404);
  if (!askSandbox) {
    console.error("[apple] production re-query failed:", first.error, first.status ?? "");
    return { ok: false, reason: "unavailable" };
  }

  const sandbox = sandboxRail();
  const second = await sandbox.api.getTransactionInfo(transactionId);
  if (!second.ok) {
    if (
      second.error === "http_error" &&
      (second.apiError === TRANSACTION_NOT_FOUND || second.status === 404)
    ) {
      return { ok: false, reason: "not_found" };
    }
    console.error("[apple] sandbox re-query failed:", second.error, second.status ?? "");
    return { ok: false, reason: "unavailable" };
  }
  const verified = await sandbox.verifier.verifyTransaction(
    second.data.signedTransactionInfo,
    "requery",
  );
  if (!verified) {
    console.error("[apple] sandbox re-query did not verify");
    return { ok: false, reason: "unverified" };
  }
  return { ok: true, transaction: verified };
}

/** Narrow a database string onto our scope union without trusting it. */
function asScope(value: unknown): IapScope | null {
  return value === "subject" || value === "olympiad_package" ? value : null;
}

/** Narrow a database string onto PlanInterval without trusting it. */
function asInterval(value: unknown): PlanInterval | null {
  return value === "week" || value === "month" || value === "year" ? value : null;
}

/**
 * THE CATALOGUE LOOKUP: what does this store product id sell?
 *
 * `active` IS READ BUT NOT REQUIRED, and the asymmetry is the point:
 *   * SELLING (the intent route) demands `active` — a product with no live App
 *     Store Connect entry must not be offered.
 *   * GRANTING (here) must not. Apple has already taken the money by the time
 *     this runs. Refusing a real purchase because an admin retired the product
 *     between the tap and the redemption would take a family's money and hand
 *     back nothing, which is the one outcome worse than a stale catalogue row.
 * An UNKNOWN product is a different matter: we cannot know what to grant, so it
 * is refused loudly and needs a person.
 */
export async function findIosProduct(productId: string): Promise<IapProductRow | null> {
  if (!isServiceRoleConfigured) return null;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("iap_products")
    .select("id, scope, subject_id, package_id, grade_id, interval, active")
    .eq("platform", PLATFORM)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) {
    console.error("[apple] product lookup failed:", error.code ?? "unknown");
    return null;
  }
  if (!data) return null;
  const scope = asScope((data as { scope?: unknown }).scope);
  if (!scope) return null;
  const row = data as {
    id: string;
    subject_id: string | null;
    package_id: string | null;
    grade_id: string | null;
    interval: unknown;
    active: boolean | null;
  };
  return {
    id: row.id,
    scope,
    subjectId: row.subject_id,
    packageId: row.package_id,
    gradeId: row.grade_id,
    interval: asInterval(row.interval),
    active: row.active === true,
  };
}

type IntentRow = {
  id: string;
  owner_parent_profile_id: string;
  student_profile_id: string | null;
  product_id: string;
  consumed_at: string | null;
  original_transaction_id: string | null;
};

/**
 * Turn a re-queried, verified Apple transaction into access — or say why not.
 *
 * Every outcome is a VALUE. Nothing here throws at a caller, because the two
 * callers that matter are an HTTP route a parent is waiting on and a webhook
 * Apple will retry, and both need to answer rather than crash.
 */
export async function grantAppleEntitlement(params: {
  /** MUST have come from `requeryVerifiedTransaction`. Re-checked below. */
  readonly transaction: VerifiedTransaction;
  /**
   * The intent the CLIENT named (redeem). When given, the transaction's own
   * appAccountToken must equal it — the client does not get to point a genuine
   * transaction at an intent of its choosing.
   */
  readonly expectedIntentId?: string;
  /**
   * Parent-facing calls pass their own profile id, so a bearer token can only
   * ever redeem intents its own account opened. The notification consumer omits
   * it: Apple is not a parent and has no profile.
   */
  readonly requireParentProfileId?: string;
  /** Audit actor. Null for a server-driven (notification) grant. */
  readonly actorProfileId?: string | null;
  /** Which caller this was, for the audit row. */
  readonly via: "redeem" | "restore" | "notification";
}): Promise<AppleWriteResult> {
  const { transaction, expectedIntentId, requireParentProfileId, via } = params;

  // THE DOCTRINE, RESTATED AT THE DOOR. `toAppleGrant` checks this too, and
  // that is not a reason to drop it here: the catalogue read below happens
  // BEFORE that call, and a notification body must not be able to cause even a
  // database read on the strength of its own contents.
  if (transaction.source !== "requery") {
    console.error("[apple] write path reached with a non-requeried transaction");
    return refuse("not_requeried");
  }
  if (!isServiceRoleConfigured) return refuse("not_configured");

  const config = getAppleIapConfig();
  if (!config) {
    console.error("[apple] write path reached with no configuration");
    return refuse("not_configured");
  }

  const payload = transaction.payload;
  const productId = typeof payload.productId === "string" ? payload.productId : "";
  if (productId === "") return refuse("product_id_malformed");

  // The payload's productId is used as a LOOKUP KEY and for nothing else. Its
  // signature and certificate chain are already verified, so it is genuinely
  // Apple's; what our row says about it is still the only thing we act on.
  const product = await findIosProduct(productId);
  if (!product) {
    // A real payment for something this catalogue cannot name. Loud on purpose:
    // it needs a person, and the family is owed access in the meantime.
    console.error("[apple] no catalogue row for a purchased product:", productId);
    return refuse("unknown_product");
  }

  const expectedKind = product.scope === "subject" ? "subscription" : "lifetime";
  const decided = toAppleGrant({
    transaction,
    expectedBundleId: config.bundleId,
    // Both come from OUR row. Reading either from the payload is how a
    // week-priced product grants a year.
    expectedKind,
    interval: product.scope === "subject" ? product.interval : null,
  });
  if (!decided.ok) {
    console.error("[apple] grant refused:", decided.reason, productId);
    return refuse(decided.reason);
  }
  const grant = decided.grant;

  // The client named an intent; the transaction names one too. They must agree.
  // Without this, a parent holding one genuine transaction could aim it at any
  // intent id they own — including one opened for a different child.
  if (expectedIntentId !== undefined && expectedIntentId.toLowerCase() !== grant.intentId) {
    console.error("[apple] the transaction does not belong to the named request");
    return refuse("intent_mismatch");
  }

  const admin = getAdminClient();
  const { data: intentData, error: intentError } = await admin
    .from("iap_purchase_intents")
    .select(
      "id, owner_parent_profile_id, student_profile_id, product_id, consumed_at, original_transaction_id",
    )
    .eq("id", grant.intentId)
    .maybeSingle();
  if (intentError) {
    console.error("[apple] intent lookup failed:", intentError.code ?? "unknown");
    return refuse("grant_failed");
  }
  if (!intentData) {
    console.error("[apple] a verified transaction names an unknown request");
    return refuse("unknown_intent");
  }
  const intent = intentData as IntentRow;

  if (intent.product_id !== productId) {
    // NOT A REFUSAL, and the asymmetry is deliberate. Apple is the authority on
    // WHAT was paid for; the intent is the authority on WHO it was for. When the
    // two disagree, granting what was actually bought to the child the request
    // named is the only outcome that neither keeps the money nor delivers the
    // wrong thing. It is logged because a disagreement means the app reused one
    // request for a second product, which is a client bug worth finding.
    console.error("[apple] the payment names a different product than the request:", productId);
  }

  if (
    requireParentProfileId !== undefined &&
    intent.owner_parent_profile_id !== requireParentProfileId
  ) {
    // Deliberately the same shape of refusal an unknown id gets; the caller
    // maps both onto one message so this cannot be used to probe for ids.
    console.error("[apple] a parent named a request that is not theirs");
    return refuse("intent_not_yours");
  }

  const studentProfileId = intent.student_profile_id;
  if (!studentProfileId) {
    // The child was deleted (the FK is ON DELETE SET NULL so the record of the
    // money survives). There is nobody to grant to; a person must refund or
    // re-point it.
    console.error("[apple] a paid request has no child left on it");
    return refuse("child_missing");
  }

  // Was this exact transaction already settled onto this intent? Recorded now,
  // before anything is written, so the answer describes the state we FOUND.
  const alreadyGranted =
    intent.consumed_at !== null &&
    intent.original_transaction_id === grant.originalTransactionId;

  // ---------------------------------------------------------------------------
  // THE ONE CROSSING FROM "VERIFIED" TO "MAY CREATE ACCESS".
  // ---------------------------------------------------------------------------
  const production = requireProductionGrant(grant);

  // APP REVIEW BUYS IN SANDBOX, AND THAT IS WHY THIS GRANTS.
  //
  // Apple's reviewer signs a SANDBOX Apple ID into the PRODUCTION build, so
  // every purchase they make arrives here marked Sandbox. This function used to
  // refuse those outright. The consequence was not theoretical: the reviewer
  // completes the payment sheet, receives no access, and rejects the app for a
  // purchase that does not work — which is the exact outcome this entire rail
  // was built to prevent, and a worse one than the abuse the refusal guarded.
  //
  // So a sandbox purchase DOES grant, under a NAMESPACED identity:
  //   * external_ref and original_transaction_id are prefixed "sbx:", so a
  //     sandbox id can never collide with a production id that happens to share
  //     its digits. That collision was the real hazard here —
  //     uq_iap_intent_original_txn is global and unique, so an unprefixed
  //     sandbox id could permanently block the real transaction.
  //   * the prefix is greppable, so every sandbox grant stays identifiable and
  //     revocable if the vector is ever abused.
  //
  // APPLE_IAP_SANDBOX_GRANTS=off turns it back off. The default is ON, and the
  // asymmetry is deliberate: default-off costs a rejected submission and days of
  // review turnaround, while default-on costs a narrow, marked, revocable vector
  // that requires developer tooling and a sandbox Apple ID configured on the
  // device. Default to the state in which review passes.
  if (!production && !sandboxGrantsEnabled()) {
    console.error("[apple] sandbox grants disabled; not granting:", productId);
    return {
      ok: true,
      granted: false,
      environment: "Sandbox",
      intentId: grant.intentId,
      studentProfileId,
      productId,
      originalTransactionId: grant.originalTransactionId,
    };
  }

  // The crossing itself lives in transaction.ts beside requireProductionGrant,
  // so the environment boundary stays a small set of named functions in one file
  // rather than a cast buried in the writer.
  const grantable: AppleGrant<"Production"> = production ?? sandboxGrantAsProduction(grant);

  // 1. CLAIM THE TRANSACTION, and only when the slot is empty.
  //
  // An id already recorded is NEVER overwritten: it is the only key that can
  // later revoke or refund that purchase, and losing it is worse than any
  // inconsistency an overwrite would tidy. When the slot is empty, the database
  // is what adjudicates the claim — `uq_iap_intent_original_txn` is a unique
  // partial index, so a second intent claiming the same transaction raises
  // 23505 rather than quietly granting one payment to two children.
  if (intent.original_transaction_id === null) {
    const { error: claimError } = await admin
      .from("iap_purchase_intents")
      .update({ original_transaction_id: grantable.originalTransactionId })
      .eq("id", intent.id)
      .is("original_transaction_id", null);
    if (claimError) {
      if (claimError.code === "23505") {
        console.error("[apple] that payment is already settled on another request");
        return refuse("transaction_claimed");
      }
      console.error("[apple] could not record the payment id:", claimError.code ?? "unknown");
      return refuse("grant_failed");
    }
  } else if (intent.original_transaction_id !== grantable.originalTransactionId) {
    // The same request was used for a second purchase. Grant the second one —
    // the money was taken — but keep the first id, and say so.
    console.error("[apple] a request carries a second payment; keeping the first id");
  }

  // 2. THE TARGET. A package grant carries a grade; the product may pin one,
  //    and otherwise it is the child's own, exactly as olympiad_purchases
  //    already records it.
  let gradeId: string | null = null;
  if (grantable.kind === "lifetime") {
    gradeId = product.gradeId;
    if (!gradeId) {
      const { data: student } = await admin
        .from("students")
        .select("grade_id")
        .eq("profile_id", studentProfileId)
        .maybeSingle();
      gradeId = (student as { grade_id?: string | null } | null)?.grade_id ?? null;
    }
  }

  // 3. THE GRANT. Idempotent in the database on (source, external_ref), so the
  //    same transaction redeemed twice moves nothing and mints no second row.
  const endsAt = grantable.endsAt === null ? null : grantable.endsAt.toISOString();
  const note = `apple ${PLATFORM} ${productId} req ${grant.intentId}`.slice(0, NOTE_MAX);
  const { data: granted, error: grantError } = await admin.rpc("entitlement_grant", {
    p_student: studentProfileId,
    p_scope: product.scope,
    p_source: SOURCE,
    // Apple's originalTransactionId IS the idempotency key — see the
    // entitlements.external_ref column comment, which names it.
    p_external_ref: grantable.originalTransactionId,
    p_subject_id: product.scope === "subject" ? product.subjectId : null,
    p_package_id: product.scope === "olympiad_package" ? product.packageId : null,
    p_grade_id: gradeId,
    // Apple exposes no stable account handle of its own; originalTransactionId
    // is already carried above and there is nothing honest to put here.
    p_provider_account_ref: null,
    p_starts_at: grantable.purchaseDate.toISOString(),
    p_ends_at: endsAt,
    p_granted_by: null,
    p_note: note,
  });
  if (grantError || typeof granted !== "string") {
    // The hint is an internal code (subject_required, mirrored_grant, …) and is
    // logged, never returned.
    console.error(
      "[apple] the entitlement write failed:",
      grantError?.hint || grantError?.code || "unknown",
    );
    return refuse("grant_failed");
  }

  // 4. CONSUME. Deliberately AFTER the grant and deliberately best-effort:
  //    ck_iap_intent_txn_required makes "consumed" imply a recorded payment id,
  //    never the reverse, and a failure to stamp it costs a support flag rather
  //    than access. Re-stamping is harmless, so a retry converges.
  if (intent.consumed_at === null) {
    const { error: consumeError } = await admin
      .from("iap_purchase_intents")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", intent.id)
      .is("consumed_at", null);
    if (consumeError) {
      console.error("[apple] could not mark the request settled:", consumeError.code ?? "unknown");
    }
  }

  // 5. AUDIT. `iap_purchase_intents` carries no audit trigger by design (the row
  //    IS its own record), so the entitlement write is logged here — small
  //    metadata only, no payload, no key.
  await writeAuditLog(params.actorProfileId ?? null, "iap.apple.entitlement_granted", {
    targetTable: "entitlements",
    targetId: granted,
    metadata: {
      via,
      product_id: productId,
      scope: product.scope,
      student_profile_id: studentProfileId,
      original_transaction_id: grantable.originalTransactionId,
      ends_at: endsAt,
      already: alreadyGranted,
    },
    severity: "info",
    success: true,
  });

  return {
    ok: true,
    granted: true,
    environment: grantable === production ? "Production" : "Sandbox",
    entitlementId: granted,
    alreadyGranted,
    intentId: grant.intentId,
    studentProfileId,
    scope: product.scope,
    productId,
    originalTransactionId: grantable.originalTransactionId,
    endsAt,
  };
}

/**
 * DOES THIS CHILD ALREADY HOLD LIVE ACCESS TO THIS TARGET, FROM ANY SOURCE?
 *
 * This is the ONLY place double-billing can be pre-empted. A parent who already
 * paid on the web must not be charged again by Apple for the same subject, and
 * once StoreKit has taken the money there is nothing this server can do about
 * it — Apple's refund flow belongs to Apple. So the question is asked BEFORE the
 * intent row exists, and a `true` answer stops the sale.
 *
 * DELIBERATELY NOT CONSULTED: the giveaway window and per-child admin free
 * access. Neither is OWNERSHIP — both are temporary comps with an end date, and
 * a parent buying a year of maths during a fourteen-day giveaway is making a
 * perfectly rational purchase. Refusing that would be the platform deciding it
 * knows better. A LIVE ENTITLEMENT is different: it is a thing the family
 * already has.
 *
 * Liveness is COMPUTED, exactly as `has_subject_access` computes it — there is
 * no status column to read, on purpose (entitlements' own table comment says
 * why). The end-date arms differ by scope because the schema forces them to:
 * `ck_entitlement_bounded` makes a subject grant's `ends_at` NOT NULL, and
 * `ck_entitlement_lifetime` makes a package grant's `ends_at` ALWAYS NULL.
 *
 * Returns null when the question could not be answered. The caller must treat
 * that as a refusal: a failed sale is recoverable, a double charge is not.
 */
export async function hasLiveEntitlement(params: {
  readonly studentProfileId: string;
  readonly scope: IapScope;
  readonly subjectId: string | null;
  readonly packageId: string | null;
}): Promise<boolean | null> {
  if (!isServiceRoleConfigured) return null;
  const target = params.scope === "subject" ? params.subjectId : params.packageId;
  if (!target) return null;

  const admin = getAdminClient();
  const now = new Date().toISOString();
  let query = admin
    .from("entitlements")
    .select("id")
    .eq("student_profile_id", params.studentProfileId)
    .eq("scope", params.scope)
    .is("revoked_at", null)
    .lte("starts_at", now)
    .limit(1);
  query =
    params.scope === "subject"
      ? query.eq("subject_id", target).gt("ends_at", now)
      : query.eq("package_id", target).is("ends_at", null);

  const { data, error } = await query;
  if (error) {
    console.error("[apple] access lookup failed:", error.code ?? "unknown");
    return null;
  }
  return Array.isArray(data) && data.length > 0;
}
