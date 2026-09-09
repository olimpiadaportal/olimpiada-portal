// Mobile BFF — edit a child's profile info (Stage M2).
//
// Token twin of the web updateChildProfile action: the SAME core
// (parentCore.updateChildProfileCore) — ownership re-verified server-side,
// identical field normalization/caps and the same validateChildInfo rules
// (mandatory district/school/grade UUIDs). Internal identifiers
// (child_unique_id, profile/DB ids) are NEVER editable here.
import { resolveBearerParent } from "@/lib/auth/mobileBearer";
import { updateChildProfileCore } from "@/lib/auth/parentCore";
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
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    // Authorize FIRST — before reading params or the body.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    const { id: studentProfileId } = await ctx.params;
    if (!isUuid(studentProfileId)) return errorResponse("childedit.err.generic", 400);

    const body = await readJsonBody(request);
    const res = await updateChildProfileCore({
      parentProfileId: parent.profileId,
      studentProfileId,
      firstName: bodyStr(body, "first_name"),
      lastName: bodyStr(body, "last_name"),
      districtId: bodyStr(body, "district_id"),
      // Round 21: rayon — required by the server when the city has active rayons.
      cityDistrictId: bodyStr(body, "city_district_id"),
      schoolId: bodyStr(body, "school_id"),
      gradeId: bodyStr(body, "grade_id"),
      schoolName: bodyStr(body, "school_name"),
      classGrade: bodyStr(body, "class_grade"),
      city: bodyStr(body, "city"),
      // Migration 169 — the OPTIONAL gender. Passed through UNVALIDATED here
      // on purpose: the core runs lib/studentGender's whitelist, so the enum
      // is enforced in ONE place for the web action and this route alike, and
      // a forged value comes back as addchild.err.genderInvalid instead of
      // reaching the column.
      //
      // ABSENT MUST STAY ABSENT — this is the request where it matters. A
      // parent editing a school name sends no `gender` key, `bodyStr` answers
      // "", and the core reads that as "leave the column alone". If this ever
      // became `?? null` on a written field, every unrelated save would erase
      // an answer given earlier, and "declined to say" would silently become
      // "never asked".
      gender: bodyStr(body, "gender"),
    });
    if (!res.ok) {
      if ("validationErrors" in res) {
        // All validation keys at once (the form shows them per-field).
        return errorResponse(
          res.validationErrors[0] ?? "childedit.err.generic",
          400,
          false,
          { errors: res.validationErrors },
        );
      }
      return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    }
    return okResponse({ updated: true });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("childedit.err.generic", 500, true);
  }
}
