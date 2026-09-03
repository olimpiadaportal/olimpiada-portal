// Mobile BFF — RESTORE PURCHASES. Parent bearer only.
//
// APPLE REQUIRES THIS TO EXIST. A missing or hidden restore path is itself a
// rejection reason: a family that reinstalls the app, or signs in on a second
// device, must be able to get back what they already paid for without paying
// again. It is not a convenience endpoint.
//
// WHAT THE APP SENDS. The transaction ids StoreKit knows about on THIS device
// (`Transaction.all` — for a NON-RENEWING subscription there is no
// `currentEntitlements` membership to read, because StoreKit does not know when
// our periods end; our server computes that). They are client strings and are
// treated as such: each one is a QUESTION for Apple, never a claim.
//
// SAFE TO CALL REPEATEDLY, BY CONSTRUCTION. Every id runs the identical write
// path a redeem runs, and that path is idempotent in the database
// (`entitlement_grant` upserts on (source, external_ref) = (apple_iap,
// originalTransactionId)). Restoring twenty times grants exactly what restoring
// once granted.
//
// A FOREIGN TRANSACTION IS NOT RESTORED. Every id must resolve, through its own
// appAccountToken, to an intent THIS parent opened. Without that a caller
// holding somebody else's transaction id could push a grant onto a stranger's
// child.
//
// PARTIAL SUCCESS IS A SUCCESS. One bad id in a list of eight must not lose the
// other seven, so the response reports a per-transaction outcome and the request
// as a whole answers 200. The outcomes are COARSE on purpose — "refused" and
// nothing more — because the internal codes name catalogue rows, constraints and
// verification rules, and those belong in the server log.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import {
  grantAppleEntitlement,
  requeryVerifiedTransaction,
} from "@/lib/payments/apple/grantEntitlement";
import { rateLimitAllow } from "@/lib/rateLimit";
import {
  bodyStrArray,
  errorResponse,
  okResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/mobile/http";
import { TRANSACTION_ID_RE } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The work one request may cause is BOUNDED, because each id costs up to two
 * outbound calls to Apple. A family's real history is a handful; twenty-five is
 * far past that and still finishes inside a request. Ids beyond the cap are
 * ignored rather than rejected — a long history must not make restore fail —
 * and the response says how many were looked at.
 */
const MAX_TRANSACTIONS = 25;

/** Apple calls are made a few at a time, so a long list does not run serially. */
const CONCURRENCY = 4;

const RATE_SCOPE = "iaprestore";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 15 * 60_000;

type RestoreOutcome = {
  transaction_id: string;
  /**
   * granted  — a live entitlement exists for it now (whether written by this
   *            call or already there);
   * pending  — genuine, verified, but not grantable on this rail (a sandbox
   *            purchase; see `requireProductionGrant`);
   * refused  — Apple did not confirm it, or it is not this parent's, or it was
   *            refunded. The reason is in the server log, never here.
   */
  status: "granted" | "pending" | "refused";
  student_profile_id?: string;
  product_id?: string;
  ends_at?: string | null;
};

async function restoreOne(
  transactionId: string,
  parentProfileId: string,
): Promise<RestoreOutcome> {
  const requeried = await requeryVerifiedTransaction(transactionId);
  if (!requeried.ok) {
    console.error("[apple] restore could not confirm a payment:", requeried.reason);
    return { transaction_id: transactionId, status: "refused" };
  }

  const result = await grantAppleEntitlement({
    transaction: requeried.transaction,
    // NO expectedIntentId: restore is exactly the case where the app has lost
    // track of which request opened which purchase. The transaction's own
    // appAccountToken names the intent, and the ownership check below is what
    // keeps that from being somebody else's.
    requireParentProfileId: parentProfileId,
    actorProfileId: parentProfileId,
    via: "restore",
  });
  if (!result.ok) {
    console.error("[apple] restore refused a payment:", result.reason);
    return { transaction_id: transactionId, status: "refused" };
  }
  if (!result.granted) {
    return {
      transaction_id: transactionId,
      status: "pending",
      student_profile_id: result.studentProfileId,
      product_id: result.productId,
    };
  }
  return {
    transaction_id: transactionId,
    status: "granted",
    student_profile_id: result.studentProfileId,
    product_id: result.productId,
    ends_at: result.endsAt,
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before the body is read.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    if (!rateLimitAllow(RATE_SCOPE, parent.profileId, RATE_LIMIT, RATE_WINDOW_MS)) {
      return errorResponse("parent.err.tooMany", 429);
    }

    // A LARGER BODY CAP THAN THE HOUSE DEFAULT, on purpose. A device that has
    // accumulated a long StoreKit history would blow the 4KB default, and
    // `readJsonBody` answers an oversized body with an EMPTY one — which would
    // read here as "nothing to restore" and silently strand a paying family.
    // The work is bounded by MAX_TRANSACTIONS below, not by the body size.
    const body = await readJsonBody(request, 16 * 1024);
    // Shape only here; every id is re-checked against the same bound the
    // database's own CHECK constraint uses.
    const raw = bodyStrArray(body, "transaction_ids", MAX_TRANSACTIONS);
    const ids = Array.from(
      new Set(raw.map((id) => id.trim()).filter((id) => TRANSACTION_ID_RE.test(id))),
    ).slice(0, MAX_TRANSACTIONS);

    // An empty list is not an error — a device with nothing to restore is the
    // ordinary case, and it must not look like a failure to the parent.
    if (ids.length === 0) {
      return okResponse({ checked: 0, granted: 0, results: [] as RestoreOutcome[] });
    }

    const results: RestoreOutcome[] = [];
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = ids.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(
        batch.map((id) => restoreOne(id, parent.profileId)),
      );
      results.push(...settled);
    }

    return okResponse({
      checked: results.length,
      granted: results.filter((r) => r.status === "granted").length,
      results,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("iap.err.generic", 500, true);
  }
}
