// Mobile BFF — start a child subscription (Stage M2).
//
// Token twin of the web subscribeChild action: the SAME core
// (subscriptionCore.subscribeChildCore) — the payment-mode / per-child
// free-access gate runs FIRST (resolution order identical to the web; the
// free-access probe is the same caller-scoped `is_child_free_access_active`
// RPC, invoked through the BEARER client), then identical validation,
// ownership check, the create_child_subscription RPC (server-computed price /
// sibling discount / trial) and the deferred 8-digit login-ID allocation +
// synthetic-email application. The ID is revealed once, here.
import { bearerFreeAccessChecker, createBearerClient, extractBearerToken, resolveBearerParent } from "@/lib/auth/mobileBearer";
import { subscribeChildCore } from "@/lib/auth/subscriptionCore";
import { isUuid } from "@/lib/uuid";
import {
  bodyStr,
  bodyStrArray,
  errorResponse,
  okResponse,
  readJsonBody,
  statusForErrorKey,
  unauthorizedResponse,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    // Authorize FIRST — before reading params or the body.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    const { id: studentId } = await ctx.params;
    if (!isUuid(studentId)) return errorResponse("sub.err.invalid", 400);

    const body = await readJsonBody(request);
    // resolveBearerParent verified this token, so it is present and valid here.
    const token = extractBearerToken(request) ?? "";
    const res = await subscribeChildCore({
      parentProfileId: parent.profileId,
      studentId,
      interval: bodyStr(body, "interval"),
      subjectIds: bodyStrArray(body, "subject_ids"),
      isFreeAccessActive: bearerFreeAccessChecker(createBearerClient(token)),
    });
    if (!res.ok) {
      return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    }
    return okResponse({
      // null when a previous plan already allocated the ID.
      child_unique_id: res.result.childUniqueId,
      base: res.result.base,
      discount_percent: res.result.discount_percent,
      discount: res.result.discount,
      total: res.result.total,
      trial_days: res.result.trial_days,
      currency: res.result.currency,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("sub.err.failed", 500, true);
  }
}
