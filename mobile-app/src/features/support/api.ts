// Bug reports — the mobile write path (migration 116).
//
// DELIBERATELY NOT a direct PostgREST rpc("submit_bug_report"), which is how
// question reports go out from this app. A bug report needs two things that
// only exist on a server: the ops notification mail, and the request's own
// user-agent header. Posting to the BFF keeps ONE write path — the same
// submitBugReportCore, the same throttle budget, the same derive trigger — for
// web and mobile alike.
//
// The endpoint requires a bearer token, so this is only ever called from a
// signed-in session (the contact screen gates the trigger on that). There is no
// anonymous mobile path: the web form's anonymous protections (honeypot,
// per-IP throttle) live in the web server action, and an unauthenticated mobile
// endpoint would be new attack surface for a case the app does not have.
import Constants from "expo-constants";
import { Platform } from "react-native";
import { bffAuthedPost, type BffResult } from "@/lib/api";

export type BugReportFields = {
  title: string;
  description: string;
  steps: string;
  expected: string;
  actual: string;
  severity: string;
};

/**
 * File one bug report.
 *
 * `app_version` is the ONE version the product recognises — `expo.version` from
 * app.json, read through Constants (never a hardcoded string, per the mobile
 * versioning rule). It tells an administrator which build a report came from,
 * which is most of the triage on a device-specific bug.
 *
 * `route_path` is the expo-router pathname, which is already a root-relative
 * path. The server sanitises it again and the database strips any query string
 * before storing, so nothing here is trusted.
 */
export function submitBugReport(
  fields: BugReportFields,
  routePath: string,
  locale: string,
): Promise<BffResult<Record<string, never>>> {
  return bffAuthedPost<Record<string, never>>(
    "/api/mobile/v1/support/bug-report",
    {
      ...fields,
      route_path: routePath,
      // The locale the reporter was READING when it broke — an az-only wording
      // bug is invisible in a report filed as "en". The server whitelists it.
      locale,
      // Android/iOS, recorded per report. The server whitelists this against
      // public.report_platform and falls back rather than dropping the report.
      platform: Platform.OS === "ios" ? "ios" : "android",
      app_version: Constants.expoConfig?.version ?? "",
    },
    "bug.err.generic",
  );
}
