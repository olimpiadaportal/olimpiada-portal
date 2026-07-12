// Mobile BFF — cancel a child's subscription (Stage M2).
//
// Token twin of the web cancelChildSubscription action: the SAME core
// (subscriptionCore.cancelChildSubscriptionCore) — ownership first, then the
// subscription is re-verified to belong to THIS child and be cancelable
// (trialing/active/past_due) so a forged id can't cancel another family's
// plan. Access is KEPT until the current period end (already-expired periods
// downgrade immediately); the parent gets the same idempotent notification.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { cancelChildSubscriptionCore } from "@/lib/auth/subscriptionCore";
import { isUuid } from "@/lib/uuid";
import {
  bodyStr,
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

    const { id: subscriptionId } = await ctx.params;
    if (!isUuid(subscriptionId)) return errorResponse("sub.err.invalid", 400);

    const body = await readJsonBody(request);
    const studentId = bodyStr(body, "student_id").trim();
    if (!isUuid(studentId)) return errorResponse("sub.err.invalid", 400);
    // Same cap as the web form; captured for demo UX only (not persisted).
    const reason = bodyStr(body, "reason").slice(0, 60);

    const res = await cancelChildSubscriptionCore({
      parentProfileId: parent.profileId,
      studentId,
      subscriptionId,
      reason,
    });
    if (!res.ok) {
      return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    }
    return okResponse({ canceled: true });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("cancel.err", 500, true);
  }
}
