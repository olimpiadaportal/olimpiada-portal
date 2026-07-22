// Mobile BFF — parent adds or changes their OWN contact phone.
//
// Token twin of the web updateOwnPhone action: the SAME core
// (phoneCore.updateOwnPhoneCore) runs on the BEARER client, so the flow is
// identical — the registration E.164 rule, the hard-coded single-column
// self-row update (profiles_update RLS: id = current_profile_id()) and the
// audit entry; no service role writes the row. PARENT bearers ONLY: children
// have no profiles.phone, and any other token gets the same generic 401 every
// BFF endpoint uses — no role disambiguation.
//
// Request: JSON {"phone":"+994501234567"} → {ok:true, data:{phone}} (the
// normalized value, so the app can render exactly what was stored).
import { createBearerClient, extractBearerToken, resolveBearerParent } from "@/lib/auth/mobileBearer";
import { updateOwnPhoneCore } from "@/lib/auth/phoneCore";
import { rateLimitAllow } from "@/lib/rateLimit";
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

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before reading the body. Parents only.
    const parent = await resolveBearerParent(request);
    if (!parent) return unauthorizedResponse();

    // Same bucket the web action uses, so the 15-minute budget is per PROFILE
    // and not per surface.
    if (!rateLimitAllow("phoneupdate", parent.profileId, 5, 15 * 60_000)) {
      return errorResponse("parent.err.tooMany", 429);
    }

    const body = await readJsonBody(request);
    // resolveBearerParent verified this token, so it is present here.
    const client = createBearerClient(extractBearerToken(request) ?? "");
    const res = await updateOwnPhoneCore(
      client,
      parent.profileId,
      bodyStr(body, "phone"),
    );
    if (!res.ok) return errorResponse(res.errorKey, statusForErrorKey(res.errorKey));
    return okResponse({ phone: res.phone });
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("profile.err.updateFailed", 500, true);
  }
}
