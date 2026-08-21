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
//
// PURCHASE-SILENT (migration 126). This route may start a plan that costs
// NOTHING — a trial, or a basket whose subjects are all free — and nothing else.
// It calls the core with `paidChanges: "refuse"`, which reaches
// `create_child_plan_if_free`: that RPC applies the plan and then rolls the
// whole statement back if its own answer priced it above zero, so no re-quote
// race can slip a paid plan past a check that ran a moment earlier. Purchasing
// happens on the WEB only (docs/STORE_PAYMENTS_COMPLIANCE.md §4) and the apps
// reflect entitlement; before this the route reached the paid apply directly, so
// a parent bearer token bought a full plan for free the moment the payment mode
// became `real`. The refusal answers `gate.notInApp`, which states a fact about
// where subscriptions are managed and names no price, no destination and no URL
// (§5 copy rules) — and no AZN amount is in this response either.
//
// Migration 109 — DUAL BODY, same contract as the sibling /quote route:
// `items: [{subject_id, interval}]` starts a PER-SUBJECT plan; without it the
// legacy `interval` + `subject_ids` pair is expanded server-side into a uniform
// basket, so already-shipped binaries keep working. Every legacy response field
// is preserved; `items` / `groups` are additive.
import { bearerFreeAccessChecker, createBearerClient, extractBearerToken, resolveBearerParent } from "@/lib/auth/mobileBearer";
import { subscribeChildCore } from "@/lib/auth/subscriptionCore";
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
    // resolveBearerParent verified this token, so it is present and valid here.
    const token = extractBearerToken(request) ?? "";
    const items = bodyPlanItems(body);
    const res = await subscribeChildCore({
      parentProfileId: parent.profileId,
      studentId,
      interval: bodyStr(body, "interval"),
      subjectIds: bodyStrArray(body, "subject_ids"),
      items: items.length > 0 ? items : undefined,
      isFreeAccessActive: bearerFreeAccessChecker(createBearerClient(token)),
      // See the header. Not a flag someone could flip: it selects a DIFFERENT,
      // narrower RPC, and the enforcement lives inside that RPC's transaction.
      paidChanges: "refuse",
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
      items: res.result.items,
      groups: res.result.groups,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("sub.err.failed", 500, true);
  }
}
