// Mobile BFF — add child (Stage M2).
//
// Token twin of the web addChild action: resolveBearerParent replaces the
// cookie getParent(), then the SAME audited core (childAccountService.
// createChild) runs — identical validation (validateChildInfo +
// validateChildPassword, mandatory district/school/grade UUIDs), the same
// atomic create_child_account RPC and the same saga cleanup. Batch H: the
// 8-digit login ID is DEFERRED — allocated on subscribe (or activate-free),
// which is why only the student_profile_id comes back here.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { createChild } from "@/lib/auth/childAccountService";
import type { ChildInfo } from "@/lib/auth/children";
import {
  bodyStr,
  errorResponse,
  okResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before reading the body.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    const body = await readJsonBody(request);
    const password = typeof body.password === "string" ? body.password : "";
    const info: ChildInfo = {
      firstName: bodyStr(body, "first_name").trim(),
      lastName: bodyStr(body, "last_name").trim(),
      city: bodyStr(body, "city").trim() || null,
      schoolName: bodyStr(body, "school_name").trim() || null,
      classGrade: bodyStr(body, "class_grade").trim() || null,
      gradeId: bodyStr(body, "grade_id").trim() || null,
      districtId: bodyStr(body, "district_id").trim() || null,
      schoolId: bodyStr(body, "school_id").trim() || null,
    };

    const result = await createChild({
      parentProfileId: parent.profileId,
      password,
      info,
    });
    if (!result.ok) {
      // All validation keys at once (the wizard shows them per-field); `error`
      // stays the envelope's single-key field.
      return errorResponse(
        result.errors[0] ?? "auth.child.err.createFailed",
        400,
        false,
        { errors: result.errors },
      );
    }
    return okResponse({ student_profile_id: result.studentProfileId });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("auth.child.err.createFailed", 500, true);
  }
}
