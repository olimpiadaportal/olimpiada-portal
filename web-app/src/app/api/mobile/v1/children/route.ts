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
      // Round 21: the intra-city rayon — REQUIRED by the DB when the chosen
      // city has active rayons (mobile sends it from the M3.1 wizard update).
      cityDistrictId: bodyStr(body, "city_district_id").trim() || null,
      schoolId: bodyStr(body, "school_id").trim() || null,
      // The gender, passed through UNVALIDATED on purpose: `validateChildInfo`
      // runs lib/studentGender's whitelist inside createChild, so the enum is
      // enforced in exactly ONE place for the web action and this route alike.
      // A forged value still comes back as addchild.err.genderInvalid rather
      // than reaching the column.
      //
      // REQUIRED SINCE 2026-09-16 (owner) — BUT NOT ON THIS ROUTE, and that is
      // deliberate. `genderOptional` is set on the createChild call below
      // because the caller is a binary already installed on a parent's phone.
      // The control that asks the question reaches them as an over-the-air
      // update which applies on the NEXT launch, and 1.15.x installs never
      // receive it at all. Enforcing here would not make those parents answer;
      // it would make Add-Child fail with a refusal their app cannot satisfy.
      // The web forms, served fresh every load, get the strict rule.
      //
      // ABSENT THEREFORE STILL MEANS ABSENT. `bodyStr` answers "" for a missing
      // field (and for a non-string one, which is a client bug landing on the
      // safe side), and "" || null is the null the column holds as "nobody has
      // been asked yet".
      gender: bodyStr(body, "gender").trim() || null,
    };

    const result = await createChild({
      parentProfileId: parent.profileId,
      password,
      info,
      // See the gender note above: an installed bundle cannot be made to ask.
      genderOptional: true,
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
    // The ID exists from creation (migration 146), so the app can show it
    // straight away instead of promising it for later. Null only if an older
    // database is behind this deployment -- the screen handles that.
    return okResponse({
      student_profile_id: result.studentProfileId,
      child_unique_id: result.childUniqueId ?? null,
      // A SUCCESS THAT SAVED LESS THAN IT WAS GIVEN says so here. i18n keys,
      // like `error` — the app localizes them. The web wizard and this route
      // share the core, so they shared the silent gender loss too; forwarding
      // the array is what stops the app from re-inventing it.
      warnings: result.warnings,
    });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("auth.child.err.createFailed", 500, true);
  }
}
