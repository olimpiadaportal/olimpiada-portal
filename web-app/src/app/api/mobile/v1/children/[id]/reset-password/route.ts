// Mobile BFF — parent resets a child's password (Stage M2).
//
// Token twin of the web resetChildPasswordAction: both delegate to the SAME
// audited core (childAccountService.resetChildPassword) — ownership verified
// (creator OR active link), identical password rules (min length + the
// password ≠ 8-digit-ID rule), the auth admin update and the
// password_set_by/at bookkeeping. The new password is never logged anywhere.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { resetChildPassword } from "@/lib/auth/childAccountService";
import { isUuid } from "@/lib/uuid";
import {
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

    const { id: studentProfileId } = await ctx.params;
    if (!isUuid(studentProfileId)) {
      return errorResponse("auth.child.err.childNotFound", 400);
    }

    const body = await readJsonBody(request);
    const newPassword = typeof body.password === "string" ? body.password : "";

    const result = await resetChildPassword({
      parentProfileId: parent.profileId,
      studentProfileId,
      newPassword,
    });
    if (!result.ok) {
      const key = result.errors[0] ?? "auth.child.err.updateFailed";
      return errorResponse(key, statusForErrorKey(key));
    }
    return okResponse({ updated: true });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("auth.child.err.updateFailed", 500, true);
  }
}
