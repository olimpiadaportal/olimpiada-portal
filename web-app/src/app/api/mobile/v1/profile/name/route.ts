// Mobile BFF — student updates their OWN name (Stage M3).
//
// Token twin of the web childUpdateOwnName action: the SAME core
// (childProfileCore.updateChildOwnNameCore) runs on the BEARER client, so the
// flow is identical — trim + 80-char caps, both names required, the students
// self-row update (students_write RLS: profile_id = current_profile_id())
// plus the best-effort profiles.display_name sync; no service role anywhere
// in this flow. STUDENT bearers ONLY: a parent (or any other) token gets the
// same generic 401 every BFF endpoint uses — no role disambiguation.
//
// Request: JSON {"first_name":"...","last_name":"..."} → {ok:true, data:{}}.
import { createBearerClient, extractBearerToken, resolveBearerStudent } from "@/lib/auth/mobileBearer";
import { updateChildOwnNameCore } from "@/lib/auth/childProfileCore";
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
    // Authorize FIRST — before reading the body. Students only.
    const student = await resolveBearerStudent(request);
    if (!student) return unauthorizedResponse();

    const body = await readJsonBody(request);
    // resolveBearerStudent verified this token, so it is present here.
    const client = createBearerClient(extractBearerToken(request) ?? "");
    const res = await updateChildOwnNameCore(
      client,
      student.profileId,
      bodyStr(body, "first_name"),
      bodyStr(body, "last_name"),
    );
    if (!res.ok) return errorResponse(res.errorKey, 400);
    return okResponse({});
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("profile.err.updateFailed", 500, true);
  }
}
