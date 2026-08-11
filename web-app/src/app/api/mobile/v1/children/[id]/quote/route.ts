// Mobile BFF — server-side subscription price quote (Stage M2).
//
// Token twin of the web quoteSubscription action: the SAME core
// (subscriptionCore.quoteSubscriptionCore) — identical validation (interval
// whitelist, UUID-shaped subject ids, cap 20), the same ownership check and
// the same authoritative quote RPC (sibling discount is NEVER computed
// client-side). Read-only: no payment-mode gate, no writes.
//
// Migration 109 — DUAL BODY. `items: [{subject_id, interval}]` quotes a
// PER-SUBJECT basket; when it is absent the legacy `interval` + `subject_ids`
// pair is used exactly as before, because runtimeVersion=appVersion means an
// OTA can never reach an already-shipped binary. The response keeps every
// legacy field and adds `items` / `groups` / `mixed`.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { quoteSubscriptionCore } from "@/lib/auth/subscriptionCore";
import { isUuid } from "@/lib/uuid";
import {
  bodyPlanItems,
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
    const items = bodyPlanItems(body);
    const res = await quoteSubscriptionCore({
      resolveParentProfileId: async () => parent.profileId,
      studentId,
      interval: bodyStr(body, "interval"),
      subjectIds: bodyStrArray(body, "subject_ids"),
      items: items.length > 0 ? items : undefined,
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
      items: res.items,
      groups: res.groups,
      mixed: res.mixed,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("sub.err.failed", 500, true);
  }
}
