// Mobile BFF — file one platform bug report (migration 116).
//
// Token twin of the web submitBugReport action: the SAME core
// (submitBugReportCore) runs on the BEARER client, so the flow is identical —
// the same caps, the same route/user-agent sanitising, the same throttle
// budget (lib/rateLimit.ts hangs its buckets off globalThis precisely so the
// action and this route SHARE one budget) and the same derive trigger.
//
// BOTH roles: a parent and a student may each hit a broken screen, so this
// uses resolveBearerUser rather than one of the role-specific resolvers.
//
// WHY MOBILE POSTS HERE INSTEAD OF CALLING THE RPC DIRECTLY — a deliberate
// divergence from question reports, which do go straight to PostgREST: a bug
// report needs the server-side notification mail and the request's own
// user-agent, neither of which exists on a direct PostgREST path. Keeping ONE
// write path is worth more than mirroring that precedent.
//
// Request: JSON {title, description, steps?, expected?, actual?, severity?,
//                route_path?, locale?, platform?, app_version?}
//       → {ok:true, data:{}}
import {
  createBearerClient,
  extractBearerToken,
  resolveBearerUser,
} from "@/lib/auth/mobileBearer";
import { submitBugReportCore } from "@/lib/support/bugReportCore";
import { locales, type Locale } from "@/i18n/config";
import {
  bodyStr,
  errorResponse,
  okResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// readJsonBody defaults to JSON_BODY_MAX_BYTES = 4096, which is far too small
// here: description alone may be 4000 chars, and steps another 2000. An
// oversized body still yields {} (and then fails validation) rather than a
// truncated report.
const BODY_MAX_BYTES = 12_000;

const MOBILE_PLATFORMS = ["android", "ios"] as const;

export async function POST(request: Request): Promise<Response> {
  try {
    // Authorize FIRST — before reading the body. Parent OR student.
    const user = await resolveBearerUser(request);
    if (!user) return unauthorizedResponse();

    const body = await readJsonBody(request, BODY_MAX_BYTES);

    // Client-declared diagnostics, whitelisted here. An unrecognised value
    // falls back rather than failing: a mislabelled admin row is a smaller
    // loss than a dropped report.
    const rawLocale = bodyStr(body, "locale");
    const locale: Locale = (locales as readonly string[]).includes(rawLocale)
      ? (rawLocale as Locale)
      : "az";
    const rawPlatform = bodyStr(body, "platform");
    const platform = (MOBILE_PLATFORMS as readonly string[]).includes(rawPlatform)
      ? (rawPlatform as "android" | "ios")
      : "android";
    // Shaped exactly like chk_bug_reports_app_version, so a tampered value is
    // dropped here instead of failing the insert.
    const rawVersion = bodyStr(body, "app_version").trim();
    const appVersion = /^[0-9A-Za-z._+-]{1,32}$/.test(rawVersion) ? rawVersion : null;

    // resolveBearerUser verified this token, so it is present here.
    const client = createBearerClient(extractBearerToken(request) ?? "");
    const res = await submitBugReportCore(
      client,
      {
        locale,
        platform,
        appVersion,
        userAgent: request.headers.get("user-agent"),
        // A bearer token means a resolved profile: never the anonymous path,
        // so the typed contact email is ignored and the trigger uses the
        // account's address.
        anonymous: false,
        throttleScope: "bugReport",
        throttleKey: user.profileId,
        throttleLimit: 5,
        throttleWindowMs: 3_600_000,
      },
      {
        title: bodyStr(body, "title"),
        description: bodyStr(body, "description"),
        steps: bodyStr(body, "steps"),
        expected: bodyStr(body, "expected"),
        actual: bodyStr(body, "actual"),
        severity: bodyStr(body, "severity"),
        routePath: bodyStr(body, "route_path"),
        contactEmail: "",
        website: "",
      },
    );
    if (!res.ok) return errorResponse(res.errorKey, 400);
    return okResponse({});
  } catch {
    // Never leak internals (error.message) to any client.
    return errorResponse("bug.err.generic", 500, true);
  }
}
