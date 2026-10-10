// Mobile BFF — REDEEM A COMPLETED GOOGLE PLAY PURCHASE. Parent bearer only.
//
// The twin of ../../apple/redeem/route.ts. THE FAST PATH: the real-time
// developer notification consumer (app/api/payments/google/notifications)
// writes the same grant through the same function, durably; this route exists
// so a parent sees access a second after the Play sheet closes. Both are
// idempotent on (google_play, external_ref), so they may race.
//
// WHAT IT REFUSES TO BELIEVE: the posted purchase token and product id. They are
// a QUESTION for Google (purchases.products.get, over our own authenticated
// connection), never evidence. `order_id`, if the app sends it, is not read for
// any decision — Google's own answer carries the orderId this rail keys on.
//
// AND THE PAIRING: Google's record must name THIS intent in
// obfuscatedExternalAccountId, the intent must be this parent's child's, and the
// product must be the one the intent was opened for.
//
// THE SERVER CONSUMES. After the grant the writer consumes the purchase on
// Google (which also acknowledges it). `consumed` in the answer says whether
// that happened, so the app knows it need not consume client-side.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import {
  grantGoogleEntitlement,
  requeryPlayPurchase,
} from "@/lib/payments/google/grantEntitlement";
import { PLAY_PRODUCT_ID_RE, PURCHASE_TOKEN_RE } from "@/lib/payments/google/purchase";
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
  googleErrorKeyForRefusal,
  googleErrorKeyForRequery,
  googleMessageForUngranted,
} from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_SCOPE = "gpredeem";
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before the body is read.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    if (!rateLimitAllow(RATE_SCOPE, parent.profileId, RATE_LIMIT, RATE_WINDOW_MS)) {
      return errorResponse("parent.err.tooMany", 429);
    }

    const body = await readJsonBody(request);
    const intentId = bodyStr(body, "intent_id").trim();
    const productId = bodyStr(body, "product_id").trim();
    const purchaseToken = bodyStr(body, "purchase_token").trim();
    if (!isUuid(intentId)) return errorResponse("iap.err.notFound", 400);
    if (!PLAY_PRODUCT_ID_RE.test(productId)) return errorResponse("iap.err.unavailable", 400);
    if (!PURCHASE_TOKEN_RE.test(purchaseToken)) return errorResponse("iap.err.notVerifiedPlay", 400);

    // GO AND ASK GOOGLE.
    const requeried = await requeryPlayPurchase(productId, purchaseToken);
    if (!requeried.ok) {
      console.error("[google] redeem could not confirm a payment:", requeried.reason);
      const retryable = requeried.reason === "unavailable" || requeried.reason === "not_configured";
      return errorResponse(googleErrorKeyForRequery(requeried.reason), retryable ? 503 : 400, retryable);
    }

    const result = await grantGoogleEntitlement({
      purchase: requeried.purchase,
      expectedIntentId: intentId,
      requireParentProfileId: parent.profileId,
      actorProfileId: parent.profileId,
      via: "redeem",
    });

    if (!result.ok) {
      return errorResponse(
        googleErrorKeyForRefusal(result.reason),
        result.retryable ? 503 : 400,
        result.retryable,
      );
    }

    if (!result.granted) {
      // PENDING (a delayed payment method) or a test purchase with test grants
      // off. Nothing went wrong, so it is a success that granted nothing; the
      // app shows the neutral message. A pending purchase is granted by the
      // notification consumer when Google reports it complete.
      return okResponse({
        granted: false,
        pending: result.reason === "pending",
        message: googleMessageForUngranted(result.reason),
        student_profile_id: result.studentProfileId,
        product_id: result.productId,
      });
    }

    return okResponse({
      granted: true,
      already: result.alreadyGranted,
      student_profile_id: result.studentProfileId,
      product_id: result.productId,
      scope: result.scope,
      ends_at: result.endsAt,
      consumed: result.consumed,
    });
  } catch {
    return errorResponse("iap.err.generic", 500, true);
  }
}
