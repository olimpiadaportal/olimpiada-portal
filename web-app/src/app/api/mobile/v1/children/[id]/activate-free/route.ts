// Mobile BFF — activate a child during a FREE window (Stage M2).
//
// Token twin of the web activateChildGiveaway action: the SAME core
// (subscriptionCore.activateChildGiveawayCore) — ownership first, then the
// server re-verifies a free window is ACTUALLY running (global giveaway mode
// OR an active per-child free-access interval, probed through the same
// caller-scoped RPC via the bearer client), then activate_child_login_id
// allocates the 8-digit login ID with NO subscription row (access comes from
// the server-side override; nothing to unwind when the window ends). No body.
import { bearerFreeAccessChecker, createBearerClient, extractBearerToken, resolveBearerParent } from "@/lib/auth/mobileBearer";
import { activateChildGiveawayCore } from "@/lib/auth/subscriptionCore";
import { isUuid } from "@/lib/uuid";
import {
  errorResponse,
  okResponse,
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
    // Authorize FIRST.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    const { id: studentId } = await ctx.params;
    if (!isUuid(studentId)) return errorResponse("sub.err.invalid", 400);

    // resolveBearerParent verified this token, so it is present and valid here.
    const token = extractBearerToken(request) ?? "";
    const res = await activateChildGiveawayCore({
      parentProfileId: parent.profileId,
      studentId,
      isFreeAccessActive: bearerFreeAccessChecker(createBearerClient(token)),
    });
    if (!res.ok) {
      return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    }
    // null when a previous plan/activation already allocated the ID.
    return okResponse({ child_unique_id: res.childUniqueId });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("sub.err.failed", 500, true);
  }
}
