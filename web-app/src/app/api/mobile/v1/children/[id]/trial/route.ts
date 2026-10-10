// Mobile BFF — start a child's one-time 24-hour FREE TRIAL (2026-10-10).
//
// Token twin of the web activateFreeTrialAction: the SAME core
// (freeTrialCore.activateFreeTrialCore → activate_free_trial). Every rule lives
// in that RPC — creator-only, once per child, at most two subjects, the
// per-email cap that survives account deletion (migration 183) — so this route
// is authorization, a throttle and a translation of the result.
//
// NOT A PURCHASE, ON EITHER PLATFORM. Nothing is priced, nothing is charged, no
// card or store account is involved, and the response carries no amount and no
// URL. The grant is a server-side 'trial' entitlement window the database
// expires by the clock, so this route is safe in the purchase-silent Android
// binary and needs no StoreKit product on iOS.
//
// Body: { subject_ids: string[], locale?: "az" | "en" | "ru" }.
// Success: { ends_at, server_now }.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { activateFreeTrialCore } from "@/lib/auth/freeTrialCore";
import { rateLimitAllow } from "@/lib/rateLimit";
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

    // Same throttle and bucket as the web action: one lifetime grant per child
    // is not worth hammering, and the shape of a refusal must not become a way
    // to probe which children exist.
    if (!rateLimitAllow("trialactivate", parent.profileId, 10, 10 * 60_000)) {
      return errorResponse("trial.err.tooMany", 429, true);
    }

    const { id: studentId } = await ctx.params;
    if (!isUuid(studentId)) return errorResponse("sub.err.notYourChild", 403);

    const body = await readJsonBody(request);
    const subjectIds = bodyStrArray(body, "subject_ids", 10);
    const rawLocale = bodyStr(body, "locale");
    const locale = rawLocale === "en" || rawLocale === "ru" ? rawLocale : "az";

    const res = await activateFreeTrialCore({
      parentProfileId: parent.profileId,
      studentId,
      subjectIds,
      locale,
    });
    if (!res.ok) {
      return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    }
    return okResponse({ ends_at: res.endsAt, server_now: new Date().toISOString() });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("trial.err.generic", 500, true);
  }
}
