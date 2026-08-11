// Mobile BFF — mid-cycle subject-change preview (Round 32).
//
// Token twin of the web quoteSubjectChange server action: the SAME core
// (subscriptionCore.quoteSubjectChangeCore) — Bearer auth first, ownership
// re-verified, then the read-only quote_subject_change RPC (the single source
// of the proration math; apply_subject_change on the sibling /subjects route
// charges exactly what this previews). No payment-mode gate here — quoting is
// informational, exactly like the initial-subscribe quote; the gate applies at
// apply time.
//
// Response `data` mirrors the RPC's own jsonb field names (snake_case) so the
// mobile client's catalog matches the documented contract exactly:
//   subscription_id, status, interval, currency, discount_percent,
//   current_recurring_total, new_recurring_total, due_now, prorated,
//   proration_waived, added_base, remaining_ratio, days_remaining,
//   period_days, effective_from, removals_effective_at,
// plus, since migration 109: items, groups, renewals, plan_changes, mixed.
//
// `items: [{subject_id, interval}]` is the DESIRED FULL set and is preferred
// when present; `add`/`remove` remain for already-shipped binaries. Proration
// is retired — `prorated` is always false and `due_now` is the adds' full first
// cycles at the sibling rate.
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
      due_now: q.dueNow,
      prorated: q.prorated,
      proration_waived: q.prorationWaived,
      added_base: q.addedBase,
      remaining_ratio: q.remainingRatio,
      days_remaining: q.daysRemaining,
      period_days: q.periodDays,
      effective_from: q.effectiveFrom,
      removals_effective_at: q.removalsEffectiveAt,
      items: q.items ?? [],
      groups: q.groups ?? {},
      renewals: q.renewals ?? [],
      // Per-subject removal dates. removals_effective_at above is one scalar
      // and cannot describe a plan whose subjects run to different dates.
      removals_effective: q.removals ?? [],
      plan_changes: q.planChanges ?? [],
      mixed: q.mixed === true,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("sub.err.failed", 500, true);
  }
}
