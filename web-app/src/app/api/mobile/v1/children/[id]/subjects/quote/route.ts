// Mobile BFF — mid-cycle plan-change preview.
//
// Token twin of the web quoteSubjectChange server action: the SAME core
// (subscriptionCore.quoteSubjectChangeCore) — Bearer auth first, ownership
// re-verified, then the read-only quote_plan_change RPC (the single source of
// the math; apply_plan_change on the sibling /subjects route charges exactly
// what this previews). No payment-mode gate here — quoting is informational,
// exactly like the initial-subscribe quote; the gate applies at apply time.
//
// Response `data` mirrors the RPC's own jsonb field names (snake_case) so the
// mobile client's catalog matches the documented contract exactly:
//   subscription_id, status, interval, currency, discount_percent,
//   current_recurring_total, new_recurring_total, due_now, effective_from,
//   removals_effective_at, items, groups, renewals, removals_effective,
//   reinstatements, plan_changes, mixed.
//
// PRORATION IS RETIRED (owner, 2026-08-17) and migration 118 dropped the RPCs
// that implemented it. The six proration fields this route used to echo
// (prorated, proration_waived, added_base, remaining_ratio, days_remaining,
// period_days) are GONE from the response — every one of them described a
// shared child cycle that no longer exists, and no mobile screen read them.
// `due_now` is now each ADDED subject's FULL first period at the sibling rate,
// starting today; `renewals` carries the per-cycle renewal dates and amounts.
//
// `items: [{subject_id, interval}]` is the DESIRED FULL set and is preferred
// when present; `add`/`remove` remain for already-shipped binaries — the SERVER
// composes the equivalent basket from the live plan, so both shapes reach the
// same non-prorating RPC.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { quoteSubjectChangeCore } from "@/lib/auth/subscriptionCore";
import { isUuid } from "@/lib/uuid";
import {
  bodyPlanItems,
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
    const res = await quoteSubjectChangeCore({
      parentProfileId: parent.profileId,
      studentId,
      add: bodyStrArray(body, "add"),
      remove: bodyStrArray(body, "remove"),
      items: items.length > 0 ? items : undefined,
    });
    if (!res.ok) {
      return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    }
    const q = res.quote;
    return okResponse({
      subscription_id: q.subscriptionId,
      status: q.status,
      interval: q.interval,
      currency: q.currency,
      discount_percent: q.discountPercent,
      current_recurring_total: q.currentRecurringTotal,
      new_recurring_total: q.newRecurringTotal,
      // The adds' FULL first periods at the sibling rate — never a part-period
      // top-up, and never client-computed.
      due_now: q.dueNow,
      effective_from: q.effectiveFrom,
      removals_effective_at: q.removalsEffectiveAt,
      items: q.items ?? [],
      groups: q.groups ?? {},
      renewals: q.renewals ?? [],
      // Per-subject removal dates. removals_effective_at above is one scalar
      // and cannot describe a plan whose subjects run to different dates.
      removals_effective: q.removals ?? [],
      // Migration 120 — the UN-CANCELS in this basket. A subject whose
      // scheduled removal is withdrawn before its coverage lapses keeps its
      // cycle, its price and its period and costs ZERO, so it is deliberately
      // not part of due_now. Additive field: older binaries ignore it.
      reinstatements: q.reinstatements ?? [],
      plan_changes: q.planChanges ?? [],
      mixed: q.mixed === true,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("sub.err.failed", 500, true);
  }
}
