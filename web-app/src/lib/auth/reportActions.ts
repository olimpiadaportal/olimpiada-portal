"use server";

// "Report a problem" (migration 115) — the ONLY web write path into
// public.question_reports. Same shape as testActions:
//   1. requireChild() FIRST (guard before touching any client input);
//   2. a cheap app-tier throttle (explicitly NOT the authority — see below);
//   3. validate every client-supplied value (uuid shape, trimmed + capped body);
//   4. call the SECURITY DEFINER RPC through the USER-SESSION supabase client,
//      so RLS and the derive trigger are the real gate;
//   5. map failures to i18n KEYS. Raw Postgres text never reaches the client.
//
// WHAT THE CLIENT DOES NOT GET TO SAY: locale is resolved here from getLocale()
// (the cookie, already validated against the admin's enabled-locales setting),
// platform is hardcoded, and reporter/status/package/attempt context are all
// derived by trg_question_report_derive. profiles.preferred_locale was rejected
// as the locale source because nothing in web-app or mobile-app ever writes it.
import { createClient } from "@/lib/supabase/server";
import { requireChild } from "@/lib/auth/session";
import { getLocale } from "@/i18n/server";
import { isUuid } from "@/lib/uuid";
import { rateLimitAllow } from "@/lib/rateLimit";
import { normalizeReportMessage } from "@/lib/reportMessage";

const PG_CHECK_VIOLATION = "23514";
const PG_NO_DATA_FOUND = "P0002";
const PG_UNIQUE_VIOLATION = "23505";

export type ReportResult = { ok: true } | { ok: false; errorKey: string };

export async function reportQuestionProblem(input: {
  questionId: string;
  attemptId: string | null;
  message: string;
}): Promise<ReportResult> {
  const child = await requireChild(); // authorize FIRST

  // A cheap first line only. Its buckets are per server instance (see the
  // module header), so on Vercel the real limit is 5 x instances; the
  // authoritative 5/hour + 20/day throttle lives in the BEFORE INSERT trigger,
  // which the mobile app's direct PostgREST insert must also pass. The key is
  // the profile id: low-cardinality and non-sensitive, as that module requires.
  if (!rateLimitAllow("questionReport", child.profileId, 5, 60_000)) {
    return { ok: false, errorKey: "test.report.err.tooMany" };
  }

  const questionId = String(input?.questionId ?? "");
  if (!isUuid(questionId)) return { ok: false, errorKey: "test.report.err.generic" };

  // A malformed attempt id is DROPPED, not rejected — the same call the trigger
  // makes about an attempt that fails verification. The context is worth less
  // than the report, so losing it must never cost us the report.
  const rawAttempt = String(input?.attemptId ?? "");
  const attemptId = isUuid(rawAttempt) ? rawAttempt : null;

  const message = normalizeReportMessage(input?.message);
  if (!message.ok) {
    return {
      ok: false,
      errorKey:
        message.reason === "empty" ? "test.report.emptyErr" : "test.report.err.generic",
    };
  }

  const [locale, supabase] = await Promise.all([getLocale(), createClient()]);

  const { error } = await supabase.rpc("submit_question_report", {
    p_question_id: questionId,
    p_attempt_id: attemptId,
    p_message: message.value,
    p_locale: locale,
    p_platform: "web",
    p_app_version: null,
  });

  if (error) {
    // The open-report unique index. Not an error state for the child: the
    // report they already filed is exactly what they were about to file again.
    if (error.code === PG_UNIQUE_VIOLATION) {
      return { ok: false, errorKey: "test.report.err.duplicate" };
    }
    // 23514 from here means the throttle. The RPC's other check_violation
    // paths (empty/oversized message, bad locale, bad platform) are unreachable
    // on this route — the action supplies locale and platform itself and has
    // already trimmed and capped the body.
    if (error.code === PG_CHECK_VIOLATION) {
      return { ok: false, errorKey: "test.report.err.tooMany" };
    }
    if (error.code === PG_NO_DATA_FOUND) {
      return { ok: false, errorKey: "test.report.err.generic" };
    }
    console.error("[report] submit_question_report failed", error.code);
    return { ok: false, errorKey: "test.report.err.generic" };
  }

  return { ok: true };
}
