// Mobile BFF — batch subject update on a live subscription (Stage M2).
//
// Token twin of the web updateSubscriptionSubjectsAction: the SAME core
// (subscriptionCore.updateSubscriptionSubjectsCore) — the client posts the
// DESIRED full subject set; the server diffs it against the live subscription
// and applies the change through the re-pricing RPCs (amounts are never
// client-set, ≥1 subject must remain, same payment-mode / per-child
// free-access gate as any other billing change — via the bearer client).
// Server semantics are identical to the web on purpose: in REAL payment mode
// the mobile CLIENT enforces its read-only posture; the server never loosens.
// An optional `interval` field is accepted for forward compatibility and
// ignored — the batch editor only changes subjects, exactly like the web.
import { bearerFreeAccessChecker, createBearerClient, extractBearerToken, resolveBearerParent } from "@/lib/auth/mobileBearer";
import { updateSubscriptionSubjectsCore } from "@/lib/auth/subscriptionCore";
import { isUuid } from "@/lib/uuid";
import {
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
    const res = await updateSubscriptionSubjectsCore({
      parentProfileId: parent.profileId,
      studentId,
      subjectIds: bodyStrArray(body, "subject_ids"),
      isFreeAccessActive: bearerFreeAccessChecker(createBearerClient(token)),
    });
    if (!res.ok) {
      return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    }
    return okResponse({ added: res.added, removed: res.removed });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("sub.err.failed", 500, true);
  }
}
