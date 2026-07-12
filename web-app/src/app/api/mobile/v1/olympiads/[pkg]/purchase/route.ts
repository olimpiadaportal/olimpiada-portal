// Mobile BFF — parent buys an olympiad package for a child (Stage M2).
//
// Token twin of the web purchaseOlympiadForChild action: the SAME core
// (olympiadCore.purchaseOlympiadForChildCore) — server-side flag gates
// (olympiad_module + payment mode; only 'off' blocks — giveaways cover free
// SUBJECT access only, packages sell at full price), ownership re-verified,
// admin-defined price read server-side, the isolated MOCK payment seam, then
// the purchase_olympiad RPC. Lifetime access; purchases are never deleted.
//
// Idempotency: an optional `Idempotency-Key` header is ACCEPTED for client
// retry ergonomics, but the real guarantee is server-side — purchase_olympiad
// is idempotent per (child, package): a re-purchase (or a concurrent race on
// the unique constraint) returns `already:true` instead of double-charging.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { purchaseOlympiadForChildCore } from "@/lib/auth/olympiadCore";
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
  ctx: { params: Promise<{ pkg: string }> },
): Promise<Response> {
  try {
    // Authorize FIRST — before reading params or the body.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    const { pkg: packageId } = await ctx.params;
    if (!isUuid(packageId)) return errorResponse("poly.err.generic", 400);

    // Accepted (never logged); the DB-level per-(child,package) idempotency of
    // purchase_olympiad is what actually makes retries safe.
    void request.headers.get("idempotency-key");

    const body = await readJsonBody(request);
    const studentId = bodyStr(body, "student_profile_id").trim();
    if (!isUuid(studentId)) return errorResponse("poly.err.generic", 400);

    const res = await purchaseOlympiadForChildCore({
      parentProfileId: parent.profileId,
      studentId,
      packageId,
    });
    if (!res.ok) {
      return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    }
    return okResponse({ already: res.already === true });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("poly.err.generic", 500, true);
  }
}
