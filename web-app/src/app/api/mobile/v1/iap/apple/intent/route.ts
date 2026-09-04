// Mobile BFF — OPEN AN APPLE PURCHASE INTENT. Parent bearer only.
//
// WHAT THE RETURNED ID IS. `iap_purchase_intents.id` IS the appAccountToken the
// app hands to StoreKit, and Apple echoes it back inside the signed transaction.
// It is THE ONLY THING THAT KNOWS WHICH CHILD A PURCHASE WAS FOR: an Apple
// purchase attaches to an APPLE ID, this platform sells per CHILD, and a parent
// buying maths for three children from one Apple ID produces three otherwise
// indistinguishable transactions. That is also why the products are NON-RENEWING
// — one Apple ID cannot hold three concurrent auto-renewable subscriptions from
// one group.
//
// THE ORDER OF THE CHECKS BELOW IS THE POINT, and it is the order the task and
// the project's security rules both require:
//   1. RESOLVE THE PARENT — before the body is read at all. An unauthenticated
//      request must not be able to make this endpoint parse anything.
//   2. Rate limit, per profile, so opening intents cannot be used to hammer the
//      database or mint rows one per keypress.
//   3. Re-verify that this parent owns this child. RLS would also stop it; we
//      never trust a client-supplied id regardless.
//   4. The payment kill switch, asked of the database, so this rail closes with
//      the web checkout rather than selling through an outage.
//   5. The product must be OURS, iOS, and ACTIVE. An unknown or retired product
//      is a refusal, never a default — Decision (4) of migration 164 says a
//      subject with no live iOS product must be neither purchasable nor
//      accessible on iOS.
//   6. THE DOUBLE-BILLING GUARD. A child who already holds a live entitlement
//      for this target, from ANY source, is not sold it again. This is the only
//      moment it can be prevented: once StoreKit has taken the money, refunding
//      it belongs to Apple.
// Only then is a row written.
//
// NO PRICE IS READ, RETURNED OR STORED HERE. Apple owns the price (tiers, per
// storefront, changed in App Store Connect), the web-only sibling discount is
// never reflected on this rail, and nothing on this surface may tell an iOS user
// the web is cheaper — that is the anti-steering rule the app was rejected under
// on 2026-08-31.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { ownsChildCore } from "@/lib/auth/subscriptionCore";
import { hasLiveEntitlement, findIosProduct } from "@/lib/payments/apple/grantEntitlement";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { rateLimitAllow } from "@/lib/rateLimit";
import { isUuid } from "@/lib/uuid";
import {
  bodyStr,
  errorResponse,
  okResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/mobile/http";
import {
  PRODUCT_ID_MAX,
  packageUnsellableKey,
  paymentsClosedKey,
  subjectUnsellableKey,
} from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ten taps on Buy in fifteen minutes is already an app misbehaving. The budget
 * is per PARENT PROFILE rather than per IP so a shared school connection is not
 * one bucket, and it is its own scope so it cannot be spent by the login limiter
 * or spend the login limiter's allowance.
 */
const RATE_SCOPE = "iapintent";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request): Promise<Response> {
  try {
    // 1. Authorize FIRST — before the body is read.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    // 2. Throttle before any work, still before the body.
    if (!rateLimitAllow(RATE_SCOPE, parent.profileId, RATE_LIMIT, RATE_WINDOW_MS)) {
      return errorResponse("parent.err.tooMany", 429);
    }

    if (!isServiceRoleConfigured) return errorResponse("iap.err.generic", 500, true);

    const body = await readJsonBody(request);
    const studentProfileId = bodyStr(body, "student_profile_id").trim();
    const productId = bodyStr(body, "product_id").trim();
    if (!isUuid(studentProfileId)) return errorResponse("iap.err.generic", 400);
    if (productId === "" || productId.length > PRODUCT_ID_MAX) {
      return errorResponse("iap.err.unavailable", 400);
    }

    // 3. This parent's child, re-verified server-side.
    if (!(await ownsChildCore(parent.profileId, studentProfileId))) {
      return errorResponse("sub.err.notYourChild", 403);
    }

    // 4. The same gate every other paid mutation runs first.
    const closed = await paymentsClosedKey();
    if (closed) return errorResponse(closed, closed === "gate.paymentsOff" ? 409 : 500, true);

    // 5. A product we actually sell, on iOS, and live. `active` is required
    //    HERE and deliberately not required on the grant path: selling
    //    something the store cannot deliver is a rejection, while refusing to
    //    honour a purchase Apple already charged for is theft.
    const product = await findIosProduct(productId);
    if (!product || !product.active) {
      console.error("[apple] refused an intent for an unsellable product:", productId);
      return errorResponse("iap.err.unavailable", 400);
    }

    // A package sale has two further conditions — the sale window and the
    // child's grade — because a package bought outside either delivers nothing.
    if (product.scope === "olympiad_package" && product.packageId) {
      const unsellable = await packageUnsellableKey(product.packageId, studentProfileId);
      if (unsellable) return errorResponse(unsellable, 409);
    }

    // 5b. AND A SUBJECT SALE HAS THE SAME GRADE CONDITION, for the same reason.
    //     A subject the child's grade does not study delivers nothing: the grant
    //     is written and every child screen then filters it out against
    //     `subjects_taught_to_grade` (migration 155). This branch had no
    //     equivalent of the package check above, so the one scope a parent
    //     actually buys most was the one the server would sell blind.
    if (product.scope === "subject" && product.subjectId) {
      const unsellable = await subjectUnsellableKey(product.subjectId, studentProfileId);
      if (unsellable) return errorResponse(unsellable, 409);
    }

    // 6. THE DOUBLE-BILLING GUARD. A distinct key, so the app can say plainly
    //    that this child already has it rather than showing a failure.
    const live = await hasLiveEntitlement({
      studentProfileId,
      scope: product.scope,
      subjectId: product.subjectId,
      packageId: product.packageId,
    });
    // null = the question could not be answered. Refuse: a failed sale is
    // recoverable, a second charge for something the family already owns is not.
    if (live === null) return errorResponse("iap.err.generic", 500, true);
    if (live) return errorResponse("iap.err.alreadyActive", 409);

    // THE ROW. Written before the store sheet opens, by service_role — the only
    // writer `iap_purchase_intents` has (it carries no insert policy for anyone,
    // not even an admin, because a hand-written intent is a claim about which
    // child a real payment was for).
    //
    // No audit row: migration 164 deliberately left this table untriggered. The
    // row IS its own record — one per tap, append-then-stamp, never edited by a
    // person — and copying the busiest table in the rail into audit_logs buys no
    // reconstruction. The GRANT is what gets audited, in grantEntitlement.ts.
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("iap_purchase_intents")
      .insert({
        owner_parent_profile_id: parent.profileId,
        student_profile_id: studentProfileId,
        platform: "ios",
        product_id: productId,
      })
      .select("id, expires_at")
      .single();
    if (error || !data) {
      // Never return raw Postgres text; the code alone goes to the log.
      console.error("[apple] could not open a purchase request:", error?.code ?? "unknown");
      return errorResponse("iap.err.generic", 500, true);
    }

    const row = data as { id: string; expires_at: string };
    return okResponse({
      // This is the appAccountToken. The app passes it to StoreKit unchanged.
      intent_id: row.id,
      product_id: productId,
      student_profile_id: studentProfileId,
      // A STALENESS MARKER, NOT A DEADLINE. Migration 164 is explicit: a
      // transaction Apple actually reports is granted even after this passes —
      // interrupted purchases, Ask-to-Buy approvals and offline-queued
      // transactions arrive hours or days late, and refusing one would take the
      // money and deliver nothing. It is here so the app can prune its own
      // pending list, never so it can refuse a purchase.
      expires_at: row.expires_at,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("iap.err.generic", 500, true);
  }
}
