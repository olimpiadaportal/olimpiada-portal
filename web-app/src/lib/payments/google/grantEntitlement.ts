// THE GOOGLE PLAY WRITE PATH — the ONE place a verified Play purchase becomes
// access on this platform. SERVER ONLY. The twin of apple/grantEntitlement.ts.
//
// THREE CALLERS, ONE FUNCTION, for the reason the Apple writer gives:
//   * POST /api/mobile/v1/iap/google/redeem   — the fast path, a second after
//     the Play sheet closes;
//   * POST /api/mobile/v1/iap/google/restore  — a reinstall or a second device;
//   * the real-time developer notification consumer under
//     app/api/payments/google/ — the durable path.
// A rule enforced in three places is a rule that will be enforced in two.
//
// THE DOCTRINE. A purchase token is a QUESTION. `requeryPlayPurchase` asks
// Google about it over our own authenticated connection, and only that answer
// (tagged `source: "requery"`) can become access — `toGoogleGrant` refuses
// anything else, and `grantGoogleEntitlement` restates the check at its door.
//
// WHAT IT NEVER DOES
//   * Decide WHAT was sold from the payload. The product id is a LOOKUP KEY into
//     `iap_products` (platform = 'android'); scope, target and interval come from
//     OUR row.
//   * Invent a child. obfuscatedExternalAccountId names our intent, and the
//     intent names the child.
//   * Consume BEFORE granting. Consuming is Google's "this purchase is settled";
//     doing it before the entitlement exists would settle a purchase we then
//     failed to deliver, and remove Google's three-day auto-refund — the one
//     safety net a family has if our side breaks.
//   * Re-grant a REVOKED purchase. `entitlement_grant` un-revokes on conflict (a
//     renewal after a refund, on other rails). A refunded Play purchase can
//     still be looked up by its token, so a restore of it would otherwise hand
//     back access whose money already went back. Refused here, explicitly.
import "server-only";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import type { PlanInterval } from "@/lib/pricingConfigurator";
import type { IapScope } from "@/lib/payments/iap/liveEntitlement";
import { getGooglePlayConfig, testGrantsEnabled } from "./config";
import {
  acknowledgeProductPurchase,
  consumeProductPurchase,
  getProductPurchase,
} from "./client";
import {
  PLAY_PRODUCT_ID_RE,
  PURCHASE_TOKEN_RE,
  redactToken,
  toGoogleGrant,
  type GoogleGrantRejection,
  type VerifiedPlayPurchase,
} from "./purchase";

/** The store platform this rail sells on. A constant, never a parameter. */
const PLATFORM = "android";

/** The entitlement source enum member for this rail (public.entitlement_source). */
export const GOOGLE_ENTITLEMENT_SOURCE = "google_play";

const NOTE_MAX = 200;

export type AndroidProductRow = {
  readonly id: string;
  readonly scope: IapScope;
  readonly subjectId: string | null;
  readonly packageId: string | null;
  readonly gradeId: string | null;
  readonly interval: PlanInterval | null;
  readonly active: boolean;
};

/** Internal codes — logged server-side, mapped to trilingual keys by the routes. */
export type GoogleWriteRefusal =
  | GoogleGrantRejection
  | "not_configured"
  | "unknown_product"
  | "unknown_intent"
  | "intent_not_yours"
  | "intent_mismatch"
  | "product_mismatch"
  | "child_missing"
  | "transaction_claimed"
  | "revoked"
  | "grant_failed";

export type GoogleWriteResult =
  | {
      readonly ok: true;
      readonly granted: true;
      /** "Test" = a license-tester purchase, granted under a gp:test: ref. */
      readonly environment: "Production" | "Test";
      readonly entitlementId: string;
      readonly alreadyGranted: boolean;
      readonly intentId: string;
      readonly studentProfileId: string;
      readonly scope: IapScope;
      readonly productId: string;
      readonly externalRef: string;
      readonly endsAt: string | null;
      /** Google now shows the purchase consumed (by this call or before it). */
      readonly consumed: boolean;
    }
  | {
      readonly ok: true;
      readonly granted: false;
      /** pending = a delayed payment method; test_disabled = GOOGLE_PLAY_TEST_GRANTS=off. */
      readonly reason: "pending" | "test_disabled";
      readonly intentId: string;
      readonly studentProfileId: string;
      readonly productId: string;
    }
  | {
      readonly ok: false;
      readonly reason: GoogleWriteRefusal;
      /** Only OUR OWN faults are worth asking again — see the Apple writer. */
      readonly retryable: boolean;
    };

export type GoogleRequeryResult =
  | { readonly ok: true; readonly purchase: VerifiedPlayPurchase }
  | {
      readonly ok: false;
      /** `unavailable` and `not_configured` are retryable; `not_found` is an answer. */
      readonly reason: "not_configured" | "malformed" | "not_found" | "unavailable";
    };

function refuse(reason: GoogleWriteRefusal): GoogleWriteResult {
  return {
    ok: false,
    reason,
    retryable: reason === "not_configured" || reason === "grant_failed",
  };
}

/**
 * GO AND ASK GOOGLE. The only way to obtain a grantable purchase.
 *
 * One host, no fallback: unlike Apple there is no separate sandbox host — a
 * license-tester purchase is answered by the same API and marked by
 * `purchaseType = 0`, which the grant decision namespaces.
 */
export async function requeryPlayPurchase(
  productId: string,
  purchaseToken: string,
): Promise<GoogleRequeryResult> {
  if (!PLAY_PRODUCT_ID_RE.test(productId) || !PURCHASE_TOKEN_RE.test(purchaseToken)) {
    return { ok: false, reason: "malformed" };
  }
  if (!getGooglePlayConfig()) return { ok: false, reason: "not_configured" };

  const answer = await getProductPurchase(productId, purchaseToken);
  if (!answer.ok) {
    if (answer.error === "not_configured" || answer.error === "auth_failed") {
      return { ok: false, reason: "not_configured" };
    }
    if (answer.error === "malformed_request") return { ok: false, reason: "malformed" };
    // 400 (invalid token for this product), 404 and 410 are Google's "no such
    // purchase" — for a client-supplied token, the normal answer to a made-up
    // one. Everything else is Google or the network, and worth a retry.
    if (
      answer.error === "http_error" &&
      (answer.status === 400 || answer.status === 404 || answer.status === 410)
    ) {
      return { ok: false, reason: "not_found" };
    }
    console.error("[google] purchase re-query failed:", answer.error, answer.status ?? "");
    return { ok: false, reason: "unavailable" };
  }
  // `source: "requery"` is set HERE and nowhere else: this object came back
  // from the call two lines above.
  return {
    ok: true,
    purchase: { source: "requery", productId, purchaseToken, purchase: answer.data },
  };
}

function asScope(value: unknown): IapScope | null {
  return value === "subject" || value === "olympiad_package" ? value : null;
}

function asInterval(value: unknown): PlanInterval | null {
  return value === "week" || value === "month" || value === "year" ? value : null;
}

/**
 * THE CATALOGUE LOOKUP for Android. `active` is READ BUT NOT REQUIRED here, for
 * the reason apple/grantEntitlement.ts#findIosProduct gives: SELLING (the intent
 * route) demands an active row; GRANTING must not, because Google has already
 * taken the money and refusing a real purchase because an admin retired the
 * product a minute later takes it and hands back nothing.
 */
export async function findAndroidProduct(productId: string): Promise<AndroidProductRow | null> {
  if (!isServiceRoleConfigured) return null;
  if (!PLAY_PRODUCT_ID_RE.test(productId)) return null;
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("iap_products")
    .select("id, scope, subject_id, package_id, grade_id, interval, active")
    .eq("platform", PLATFORM)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) {
    console.error("[google] product lookup failed:", error.code ?? "unknown");
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
  owner_parent_profile_id: string | null;
  student_profile_id: string | null;
  platform: string;
  product_id: string;
  consumed_at: string | null;
  original_transaction_id: string | null;
};

/** Same authorization fact the Apple writer asks. Fails closed. */
async function parentHoldsActiveLink(
  admin: ReturnType<typeof getAdminClient>,
  parentProfileId: string,
  studentProfileId: string | null,
): Promise<boolean> {
  if (!studentProfileId) return false;
  const { data, error } = await admin
    .from("parent_student_links")
    .select("id")
    .eq("parent_profile_id", parentProfileId)
    .eq("student_profile_id", studentProfileId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    console.error("[google] link check failed:", error.code ?? "unknown");
    return false;
  }
  return Boolean(data);
}

/**
 * Settle the purchase on Google's side, AFTER the grant. Best-effort: the grant
 * is the record that matters, and a consume that fails now is retried by the
 * next redeem, restore or notification for the same token.
 *
 * When consume fails, ACKNOWLEDGE is tried, so a purchase we have already
 * delivered is not auto-refunded by Google after three days. (An acknowledged
 * but unconsumed product blocks re-buying the same product until a later call
 * consumes it — the lesser problem.)
 */
async function settleOnGoogle(purchase: VerifiedPlayPurchase, alreadyAcknowledged: boolean): Promise<boolean> {
  const consumed = await consumeProductPurchase(purchase.productId, purchase.purchaseToken);
  if (consumed.ok) return true;
  console.error(
    "[google] consume failed:",
    consumed.error,
    consumed.status ?? "",
    redactToken(purchase.purchaseToken),
  );
  if (!alreadyAcknowledged) {
    const acked = await acknowledgeProductPurchase(purchase.productId, purchase.purchaseToken);
    if (!acked.ok) console.error("[google] acknowledge failed:", acked.error, acked.status ?? "");
  }
  return false;
}

/**
 * Turn a re-queried Play purchase into access — or say why not. Every outcome
 * is a VALUE; nothing throws at a caller.
 */
export async function grantGoogleEntitlement(params: {
  /** MUST have come from `requeryPlayPurchase`. Re-checked below. */
  readonly purchase: VerifiedPlayPurchase;
  /** The intent the CLIENT named (redeem). Must equal obfuscatedExternalAccountId. */
  readonly expectedIntentId?: string;
  /** Parent-facing calls pass their own profile id; the notification omits it. */
  readonly requireParentProfileId?: string;
  readonly actorProfileId?: string | null;
  readonly via: "redeem" | "restore" | "notification";
}): Promise<GoogleWriteResult> {
  const { purchase, expectedIntentId, requireParentProfileId, via } = params;

  // THE DOCTRINE, AT THE DOOR — before even a catalogue read.
  if (purchase.source !== "requery") {
    console.error("[google] write path reached with a non-requeried purchase");
    return refuse("not_requeried");
  }
  if (!isServiceRoleConfigured) return refuse("not_configured");
  if (!getGooglePlayConfig()) return refuse("not_configured");

  const productId = purchase.productId;
  if (!PLAY_PRODUCT_ID_RE.test(productId)) return refuse("product_id_malformed");

  const product = await findAndroidProduct(productId);
  if (!product) {
    console.error("[google] no catalogue row for a purchased product:", productId);
    return refuse("unknown_product");
  }

  const decided = toGoogleGrant({
    purchase,
    expectedKind: product.scope === "subject" ? "subscription" : "lifetime",
    interval: product.scope === "subject" ? product.interval : null,
  });
  if (!decided.ok) {
    console.error("[google] grant refused:", decided.reason, productId);
    return refuse(decided.reason);
  }
  const intentId = decided.state === "pending" ? decided.intentId : decided.grant.intentId;

  // The client named an intent; Google's record names one too. They must agree,
  // or one genuine purchase could be aimed at any intent the caller owns.
  if (expectedIntentId !== undefined && expectedIntentId.toLowerCase() !== intentId) {
    console.error("[google] the purchase does not belong to the named request");
    return refuse("intent_mismatch");
  }

  const admin = getAdminClient();
  const { data: intentData, error: intentError } = await admin
    .from("iap_purchase_intents")
    .select(
      "id, owner_parent_profile_id, student_profile_id, platform, product_id, consumed_at, original_transaction_id",
    )
    .eq("id", intentId)
    .maybeSingle();
  if (intentError) {
    console.error("[google] intent lookup failed:", intentError.code ?? "unknown");
    return refuse("grant_failed");
  }
  if (!intentData) {
    console.error("[google] a verified purchase names an unknown request");
    return refuse("unknown_intent");
  }
  const intent = intentData as IntentRow;

  // An iOS intent id reused on Android is not this rail's request.
  if (intent.platform !== PLATFORM) {
    console.error("[google] a purchase names a request opened on another platform");
    return refuse("intent_mismatch");
  }

  // WHO MAY REDEEM — the child's adults, exactly the Apple rule (owner, or an
  // active link to the intent's child). Checked BEFORE the product comparison
  // and before `child_missing`, so a stranger learns nothing about the intent.
  if (
    requireParentProfileId !== undefined &&
    intent.owner_parent_profile_id !== requireParentProfileId
  ) {
    const linked = await parentHoldsActiveLink(admin, requireParentProfileId, intent.student_profile_id);
    if (!linked) {
      console.error("[google] a parent named a request that is not theirs");
      return refuse("intent_not_yours");
    }
  }

  // THE PRODUCT MUST BE THE ONE THE REQUEST WAS OPENED FOR. A DELIBERATE
  // DEPARTURE from the Apple writer, which grants what was paid for when the
  // two disagree, and it is safe here for a reason Apple does not offer: a Play
  // purchase that is never acknowledged or consumed is REFUNDED BY GOOGLE
  // automatically after three days. Refusing therefore never keeps a family's
  // money — and it stops one intent being reused to buy a different product
  // for a child the parent never chose it for.
  if (intent.product_id !== productId) {
    console.error("[google] the payment names a different product than the request:", productId);
    return refuse("product_mismatch");
  }

  const studentProfileId = intent.student_profile_id;
  if (!studentProfileId) {
    console.error("[google] a paid request has no child left on it");
    return refuse("child_missing");
  }

  // PENDING: a delayed payment method. Recorded, never granted; Google sends a
  // notification when it completes, and the notification consumer grants then.
  if (decided.state === "pending") {
    return { ok: true, granted: false, reason: "pending", intentId, studentProfileId, productId };
  }
  const grant = decided.grant;

  if (grant.test && !testGrantsEnabled()) {
    console.error("[google] test grants disabled; not granting:", productId);
    return { ok: true, granted: false, reason: "test_disabled", intentId, studentProfileId, productId };
  }

  // A REVOKED PURCHASE STAYS REVOKED (see the header).
  const { data: revokedRows, error: revokedError } = await admin
    .from("entitlements")
    .select("id")
    .eq("source", GOOGLE_ENTITLEMENT_SOURCE)
    .eq("external_ref", grant.externalRef)
    .not("revoked_at", "is", null)
    .limit(1);
  if (revokedError) {
    console.error("[google] revocation check failed:", revokedError.code ?? "unknown");
    return refuse("grant_failed");
  }
  if (Array.isArray(revokedRows) && revokedRows.length > 0) {
    console.error("[google] refusing to re-grant a revoked purchase:", grant.externalRef);
    return refuse("revoked");
  }

  const alreadyGranted =
    intent.consumed_at !== null && intent.original_transaction_id === grant.externalRef;

  // 1. CLAIM THE PURCHASE onto the intent, only when the slot is empty. The
  //    database adjudicates: uq_iap_intent_original_txn raises 23505 if another
  //    intent already holds this ref, so one payment can never reach two
  //    children.
  if (intent.original_transaction_id === null) {
    const { error: claimError } = await admin
      .from("iap_purchase_intents")
      .update({ original_transaction_id: grant.externalRef })
      .eq("id", intent.id)
      .is("original_transaction_id", null);
    if (claimError) {
      if (claimError.code === "23505") {
        console.error("[google] that payment is already settled on another request");
        return refuse("transaction_claimed");
      }
      console.error("[google] could not record the payment id:", claimError.code ?? "unknown");
      return refuse("grant_failed");
    }
  } else if (intent.original_transaction_id !== grant.externalRef) {
    // The same request carried a second payment. Grant it — the money was
    // taken — but keep the first id, exactly as the Apple writer does.
    console.error("[google] a request carries a second payment; keeping the first id");
  }

  // 2. THE TARGET GRADE, for a package.
  let gradeId: string | null = null;
  if (product.scope === "olympiad_package") {
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

  // 3. THE GRANT — idempotent in the database on (source, external_ref).
  const endsAt = grant.endsAt === null ? null : grant.endsAt.toISOString();
  const note = `google ${PLATFORM} ${productId} req ${intentId}`.slice(0, NOTE_MAX);
  const { data: granted, error: grantError } = await admin.rpc("entitlement_grant", {
    p_student: studentProfileId,
    p_scope: product.scope,
    p_source: GOOGLE_ENTITLEMENT_SOURCE,
    p_external_ref: grant.externalRef,
    p_subject_id: product.scope === "subject" ? product.subjectId : null,
    p_package_id: product.scope === "olympiad_package" ? product.packageId : null,
    p_grade_id: gradeId,
    p_provider_account_ref: null,
    p_starts_at: grant.purchaseDate.toISOString(),
    p_ends_at: endsAt,
    p_granted_by: null,
    p_note: note,
  });
  if (grantError || typeof granted !== "string") {
    console.error(
      "[google] the entitlement write failed:",
      grantError?.hint || grantError?.code || "unknown",
    );
    return refuse("grant_failed");
  }

  // 4. CONSUME ON GOOGLE — strictly after the grant (see the header).
  const consumed = grant.consumed ? true : await settleOnGoogle(purchase, grant.acknowledged);

  // 5. STAMP THE INTENT settled. Best-effort; a retry converges.
  if (intent.consumed_at === null) {
    const { error: consumeError } = await admin
      .from("iap_purchase_intents")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", intent.id)
      .is("consumed_at", null);
    if (consumeError) {
      console.error("[google] could not mark the request settled:", consumeError.code ?? "unknown");
    }
  }

  // 6. AUDIT — small metadata only: never the purchase token.
  await writeAuditLog(params.actorProfileId ?? null, "iap.google.entitlement_granted", {
    targetTable: "entitlements",
    targetId: granted,
    metadata: {
      via,
      product_id: productId,
      scope: product.scope,
      student_profile_id: studentProfileId,
      external_ref: grant.externalRef,
      ends_at: endsAt,
      already: alreadyGranted,
      test: grant.test,
      consumed,
    },
    severity: "info",
    success: true,
  });

  return {
    ok: true,
    granted: true,
    environment: grant.test ? "Test" : "Production",
    entitlementId: granted,
    alreadyGranted,
    intentId,
    studentProfileId,
    scope: product.scope,
    productId,
    externalRef: grant.externalRef,
    endsAt,
    consumed,
  };
}
