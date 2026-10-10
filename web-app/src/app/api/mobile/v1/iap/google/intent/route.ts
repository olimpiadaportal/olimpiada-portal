// Mobile BFF — OPEN A GOOGLE PLAY PURCHASE INTENT. Parent bearer only.
//
// The twin of ../../apple/intent/route.ts, check for check and in the same
// order — read that file's header for why the order is the point:
//   1. resolve the parent BEFORE the body is read;
//   2. rate limit per profile (its own scope, `gpintent`);
//   3. re-verify that this parent owns this child;
//   4. the payment kill switch, and a scheduled free-access interval;
//   5. the product must be OURS, ANDROID, and ACTIVE — plus the package sale
//      window / grade and the subject grade rule;
//   6. the double-billing guard: no second charge for something the child
//      already holds, from any source.
// Only then is a row written.
//
// WHAT THE RETURNED ID IS. `iap_purchase_intents.id` is what the app passes to
// Play Billing as `obfuscatedAccountIdAndroid`; Google stores it with the
// purchase and returns it as `obfuscatedExternalAccountId`. It is the only
// thing that knows which child the purchase was for.
//
// ONE ANDROID-ONLY CHECK: the Play API must be configured before anything is
// sold. A purchase this server cannot verify is a purchase Google refunds after
// three days and a family that saw nothing arrive, so an unconfigured
// deployment refuses to open the sheet at all.
//
// NO PRICE IS READ, RETURNED OR STORED HERE. Google shows its own localized
// price in the Play sheet.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { ownsChildCore } from "@/lib/auth/subscriptionCore";
import { hasLiveEntitlement } from "@/lib/payments/iap/liveEntitlement";
import { findAndroidProduct } from "@/lib/payments/google/grantEntitlement";
import { getGooglePlayConfig } from "@/lib/payments/google/config";
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
  freeAccessClosedKey,
  packageUnsellableKey,
  paymentsClosedKey,
  subjectUnsellableKey,
} from "../../_shared/gates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_SCOPE = "gpintent";
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
    // Never sell what we cannot verify (see the header). The missing variable
    // is named in the server log by config.ts, never here.
    if (!getGooglePlayConfig()) return errorResponse("iap.err.generic", 503, true);

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

    const freeAccessClosed = await freeAccessClosedKey(studentProfileId);
    if (freeAccessClosed) {
      return errorResponse(
        freeAccessClosed,
        freeAccessClosed === "gate.freeAccess" ? 409 : 500,
        freeAccessClosed !== "gate.freeAccess",
      );
    }

    // 5. A product we actually sell, on Android, and live.
    const product = await findAndroidProduct(productId);
    if (!product || !product.active) {
      console.error("[google] refused an intent for an unsellable product:", productId);
      return errorResponse("iap.err.unavailable", 400);
    }

    if (product.scope === "olympiad_package" && product.packageId) {
      const unsellable = await packageUnsellableKey(product.packageId, studentProfileId);
      if (unsellable) return errorResponse(unsellable, 409);
    }
    if (product.scope === "subject" && product.subjectId) {
      const unsellable = await subjectUnsellableKey(product.subjectId, studentProfileId);
      if (unsellable) return errorResponse(unsellable, 409);
    }

    // 6. THE DOUBLE-BILLING GUARD.
    const live = await hasLiveEntitlement({
      studentProfileId,
      scope: product.scope,
      subjectId: product.subjectId,
      packageId: product.packageId,
    });
    if (live === null) return errorResponse("iap.err.generic", 500, true);
    if (live) return errorResponse("iap.err.alreadyActive", 409);

    // THE ROW, by service_role — the only writer iap_purchase_intents has.
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("iap_purchase_intents")
      .insert({
        owner_parent_profile_id: parent.profileId,
        student_profile_id: studentProfileId,
        platform: "android",
        product_id: productId,
      })
      .select("id, expires_at")
      .single();
    if (error || !data) {
      console.error("[google] could not open a purchase request:", error?.code ?? "unknown");
      return errorResponse("iap.err.generic", 500, true);
    }

    const row = data as { id: string; expires_at: string };
    return okResponse({
      // The app passes this to Play Billing as obfuscatedAccountIdAndroid.
      intent_id: row.id,
      product_id: productId,
      student_profile_id: studentProfileId,
      // A STALENESS MARKER, NOT A DEADLINE — see the Apple route. A pending
      // purchase can complete days later and is still granted.
      expires_at: row.expires_at,
    });
  } catch {
    return errorResponse("iap.err.generic", 500, true);
  }
}
