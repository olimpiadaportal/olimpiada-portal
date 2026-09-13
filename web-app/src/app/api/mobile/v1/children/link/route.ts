import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { getChildLinkState, mutateChildLink } from "@/lib/auth/childLinkCore";
import { bodyStr, errorResponse, okResponse, readJsonBody, unauthorizedResponse } from "@/lib/mobile/http";
import type { ChildLinkAction } from "@/lib/childLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();
    const body = await readJsonBody(request);
    const action = bodyStr(body, "action");
    if (action === "state") {
      return okResponse(await getChildLinkState(parent.profileId));
    }
    const result = await mutateChildLink(parent.profileId, {
      action: action as ChildLinkAction,
      studentId: bodyStr(body, "student_id") || undefined,
      invitationId: bodyStr(body, "invitation_id") || undefined,
      parentId: bodyStr(body, "parent_id") || undefined,
      childId: bodyStr(body, "child_id") || undefined,
      code: bodyStr(body, "code") || undefined,
    });
    if (!result.ok) {
      const status = result.errorKey.endsWith("forbidden") || result.errorKey.endsWith("creatorOnly") ? 403
        : result.errorKey.endsWith("rate") ? 429 : 400;
      return errorResponse(result.errorKey, status, result.errorKey.endsWith("generic"));
    }
    return okResponse(result);
  } catch {
    return errorResponse("link.err.generic", 500, true);
  }
}
