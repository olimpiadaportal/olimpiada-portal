// Mobile BFF — server-side subscription price quote (Stage M2).
//
// Token twin of the web quoteSubscription action: the SAME core
// (subscriptionCore.quoteSubscriptionCore) — identical validation (interval
// whitelist, UUID-shaped subject ids, cap 20), the same ownership check and
// the same authoritative quote_child_subscription RPC (sibling discount is
// NEVER computed client-side). Read-only: no payment-mode gate, no writes.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { quoteSubscriptionCore } from "@/lib/auth/subscriptionCore";
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
    const res = await quoteSubscriptionCore({
      resolveParentProfileId: async () => parent.profileId,
      studentId,
      interval: bodyStr(body, "interval"),
      subjectIds: bodyStrArray(body, "subject_ids"),
    });
    if (!res.ok) {
      return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    }
    return okResponse({
      base: res.base,
      discount_percent: res.discount_percent,
      discount: res.discount,
      total: res.total,
      trial_days: res.trial_days,
      currency: res.currency,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("sub.err.failed", 500, true);
  }
}
