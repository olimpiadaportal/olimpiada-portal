// Mobile BFF — REDEEM A COMPLETED APPLE PURCHASE. Parent bearer only.
//
// THE FAST PATH, AND ONLY THE FAST PATH. Apple will eventually deliver an App
// Store Server Notification for this purchase, and the consumer of those
// notifications (app/api/payments/apple/…) writes the same grant through the
// same function this route calls. That path is the DURABLE one; this route
// exists so a parent sees access within a second of the sheet closing instead of
// waiting on a webhook that may take minutes and can be retried for a day. If
// this endpoint were deleted tomorrow, nothing would be lost except the wait.
//
// SO IT IS SAFE FOR THE TWO TO RACE. Both go through `grantAppleEntitlement`,
// whose write is idempotent in the DATABASE — `entitlement_grant` upserts on
// (source, external_ref) and the external_ref is Apple's originalTransactionId.
// Whichever arrives second moves nothing and mints no second row.
//
// WHAT THIS ROUTE REFUSES TO BELIEVE: the posted transaction id. It is a client
// string and it is treated as one — a QUESTION to ask Apple, never evidence that
// anything was bought. `requeryVerifiedTransaction` opens our own connection to
// Apple's host, asks about that id, and verifies the signed answer; only that
// answer can become access, because `toAppleGrant` refuses any transaction whose
// source is not `requery`. This is the posture the AzeriCard callback already
// takes toward the bank, transplanted.
//
// AND IT REFUSES TO BELIEVE THE PAIRING. A genuine transaction still has to be
// the one this intent opened: the transaction's own appAccountToken must equal
// the intent id the app named, and the intent must belong to the calling parent.
// Without both, one real purchase could be aimed at any intent the caller owns.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import {
  grantAppleEntitlement,
  requeryVerifiedTransaction,
} from "@/lib/payments/apple/grantEntitlement";
import { rateLimitAllow } from "@/lib/rateLimit";
import { isUuid } from "@/lib/uuid";
import {
  bodyStr,
  errorResponse,
  okResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/mobile/http";
import { TRANSACTION_ID_RE, errorKeyForRefusal, errorKeyForRequery } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Each call costs an outbound request to Apple, so the budget is tighter than a
 * pure database endpoint's — but generous enough that a flaky network on a
 * parent's phone can retry a real purchase many times over. A refusal here never
 * loses a purchase: the notification consumer still grants it.
 */
const RATE_SCOPE = "iapredeem";
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
    const transactionId = bodyStr(body, "transaction_id").trim();
    if (!isUuid(intentId)) return errorResponse("iap.err.notFound", 400);
    if (!TRANSACTION_ID_RE.test(transactionId)) return errorResponse("iap.err.notVerified", 400);

    // GO AND ASK APPLE. Production host first, then sandbox for an id production
    // denies knowing — App Review buys in sandbox against this same deployment.
    const requeried = await requeryVerifiedTransaction(transactionId);
    if (!requeried.ok) {
      console.error("[apple] redeem could not confirm a payment:", requeried.reason);
      const retryable = requeried.reason === "unavailable" || requeried.reason === "not_configured";
      return errorResponse(errorKeyForRequery(requeried.reason), retryable ? 503 : 400, retryable);
    }

    // The shared write path does the rest: catalogue lookup, grant rules, the
    // one crossing from sandbox to production, the transaction claim, the
    // entitlement, the consumption stamp and the audit row.
    const result = await grantAppleEntitlement({
      transaction: requeried.transaction,
      // The app named this intent; the transaction must name the same one.
      expectedIntentId: intentId,
      // ...and the intent must be this parent's.
      requireParentProfileId: parent.profileId,
      actorProfileId: parent.profileId,
      via: "redeem",
    });

    if (!result.ok) {
      // The write path says whether the answer would change on a second ask;
      // only our own faults would. A verification or attribution refusal is a
      // settled answer and must not invite a retry loop.
      return errorResponse(
        errorKeyForRefusal(result.reason),
        result.retryable ? 503 : 400,
        result.retryable,
      );
    }

    if (!result.granted) {
      // A SANDBOX purchase: verified, genuine, and structurally unable to create
      // real access (see `requireProductionGrant`). Answered as a success rather
      // than an error because nothing went wrong — the app shows the neutral
      // "recorded" message and no access appears.
      return okResponse({
        granted: false,
        message: "iap.msg.recorded",
        student_profile_id: result.studentProfileId,
        product_id: result.productId,
      });
    }

    return okResponse({
      granted: true,
      // True when this exact transaction had already been settled before this
      // call — a second tap, or the notification arriving first. The app can
      // treat it exactly like a fresh grant; it is reported so support can tell
      // a duplicate from a first delivery.
      already: result.alreadyGranted,
      student_profile_id: result.studentProfileId,
      product_id: result.productId,
      scope: result.scope,
      ends_at: result.endsAt,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("iap.err.generic", 500, true);
  }
}
