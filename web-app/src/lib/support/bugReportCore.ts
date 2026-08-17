import "server-only";

// "Report a bug" (migration 116) — THE implementation, shared by every caller.
//
// This is the repo's established ...Core pattern (updateChildOwnNameCore is
// shared by the web action and the mobile BFF route): the supabase client is a
// PARAMETER, so the web server action, the mobile BFF and the anonymous path
// all run identical logic and differ only in which client they hand in:
//
//   authenticated web/mobile → the USER-SESSION / BEARER client. RLS
//     (bugreports_insert) and trg_bug_report_derive are the real gate, and
//     current_profile_id() resolves to the reporter.
//   anonymous public form    → the SERVICE-ROLE client. current_profile_id()
//     is NULL, so the trigger writes reporter_role='anonymous' by itself. The
//     service role is only reached AFTER the caller has made its authorization
//     decision ("public form, honeypot clean, IP under the throttle").
//
// Order is fixed and load-bearing: throttle → validate → RPC → map → notify.
//
// The app-tier throttle here is a CHEAP FIRST LINE ONLY. Its buckets are per
// server instance (see lib/rateLimit.ts), so on Vercel the effective limit is
// (limit × instances). The AUTHORITY is trg_bug_report_derive — 5/hour + 20/day
// per reporter, 20/hour globally for anonymous rows — which every write path
// must pass, including any future one that does not come through this file.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { rateLimitAllow } from "@/lib/rateLimit";
import { isSafeRelativeUrl } from "@/lib/notifications/types";
import { normalizeBugReport, type BugReportInput } from "@/lib/support/bugReport";
import { notifyBugReport } from "@/lib/mail/bugReportMail";

const PG_CHECK_VIOLATION = "23514";
const PG_UNIQUE_VIOLATION = "23505";

const USER_AGENT_MAX = 300;
const ROUTE_MAX = 500;

export type BugReportResult = { ok: true } | { ok: false; errorKey: string };

export type BugReportContext = {
  /** Server-resolved on web (getLocale cookie); self-declared on mobile. */
  locale: Locale;
  /** Hardcoded 'web' by the action; enum-constrained on mobile. */
  platform: "web" | "android" | "ios";
  /** Which BUILD this came from. Server env on web, expo config on mobile. */
  appVersion: string | null;
  /** Read from the request HEADER, never from a form field. */
  userAgent: string | null;
  /** true ⇒ the service-role client, and the typed email may be kept. */
  anonymous: boolean;
  throttleScope: string;
  /** Profile id, or a SALTED HASH of the IP. Never a raw IP (see the action). */
  throttleKey: string;
  throttleLimit: number;
  throttleWindowMs: number;
};

/**
 * Sanitise the client-declared route.
 *
 * The client is specified to send `window.location.pathname`, but a client is
 * never taken at its word. Anything that is not a safe root-relative path is
 * DROPPED rather than rejected: the context is worth less than the report.
 *
 * The query string and the fragment are cut here AND again in the database
 * trigger, because that is where credentials live — /auth/callback?code=… and
 * #access_token=… would otherwise turn a bug report into a credential leak.
 * Reusing isSafeRelativeUrl() rather than writing a fourth URL validator keeps
 * this rule identical to the one notification deep links already enforce.
 */
function safeRoute(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") return null;
  const path = value.split(/[?#]/, 1)[0] ?? "";
  if (!isSafeRelativeUrl(path)) return null;
  return path.slice(0, ROUTE_MAX);
}

/**
 * Flatten control bytes to spaces, then cap.
 *
 * A user-agent header is attacker-supplied: it can carry NUL, CR/LF or DEL,
 * which would corrupt a log line and an ops email alike. Screened by CHAR CODE
 * rather than a regex escape, the same way isSafeRelativeUrl() screens the same
 * byte range in lib/notifications/types.ts.
 */
function safeUserAgent(raw: string | null): string | null {
  if (typeof raw !== "string") return null;
  let out = "";
  for (let i = 0; i < raw.length && out.length < USER_AGENT_MAX; i++) {
    const c = raw.charCodeAt(i);
    out += c < 0x20 || c === 0x7f ? " " : raw[i];
  }
  const cleaned = out.trim();
  return cleaned === "" ? null : cleaned;
}

export async function submitBugReportCore(
  client: SupabaseClient,
  ctx: BugReportContext,
  input: Partial<BugReportInput>,
): Promise<BugReportResult> {
  // 1) Throttle before any work. The key is a profile id or a salted IP hash —
  //    low-cardinality and non-sensitive, as lib/rateLimit.ts requires.
  if (
    !rateLimitAllow(ctx.throttleScope, ctx.throttleKey, ctx.throttleLimit, ctx.throttleWindowMs)
  ) {
    return { ok: false, errorKey: "bug.err.tooMany" };
  }

  // 2) Validate. maxLength on an input is UX; this is the gate.
  const norm = normalizeBugReport(input);
  if (!norm.ok) {
    if (norm.reason === "titleEmpty" || norm.reason === "descriptionEmpty") {
      return { ok: false, errorKey: "bug.emptyErr" };
    }
    return { ok: false, errorKey: "bug.err.tooLong" };
  }
  const v = norm.value;

  // A signed-in reporter's address is taken from their ACCOUNT by the database
  // trigger, and anything typed into the form is discarded there. Sending it
  // only on the anonymous path keeps that explicit on this side too — and it
  // is why the child dialog never needs to ask a child for an email at all.
  const contactEmail = ctx.anonymous ? v.contactEmail : null;
  const routePath = safeRoute(input?.routePath);
  const userAgent = safeUserAgent(ctx.userAgent);

  // 3) Write through the RPC. Every value below is either server-derived or
  //    validated above; the trigger re-derives the ones that matter anyway.
  const { data, error } = await client.rpc("submit_bug_report", {
    p_title: v.title,
    p_description: v.description,
    p_steps: v.steps,
    p_expected: v.expected,
    p_actual: v.actual,
    p_severity: v.severity,
    p_route_path: routePath,
    p_user_agent: userAgent,
    p_locale: ctx.locale,
    p_platform: ctx.platform,
    p_app_version: ctx.appVersion,
    p_contact_email: contactEmail,
  });

  // 4) Map Postgres codes to i18n KEYS. Raw error.message never reaches a client.
  if (error) {
    // The open-report unique index. Not an error state for the reporter: the
    // report they already filed is exactly the one they were about to file.
    if (error.code === PG_UNIQUE_VIOLATION) {
      return { ok: false, errorKey: "bug.err.duplicate" };
    }
    // 23514 from here means the DB throttle. The RPC's other check_violation
    // paths (bad title/description/locale/platform/severity) are unreachable —
    // this function supplies locale, platform and severity itself and has
    // already trimmed and capped every body field.
    if (error.code === PG_CHECK_VIOLATION) {
      return { ok: false, errorKey: "bug.err.tooMany" };
    }
    console.error("[bugreport] submit_bug_report failed", error.code);
    return { ok: false, errorKey: "bug.err.generic" };
  }

  // submit_bug_report returns { id, reporter_role, reporter_email,
  // reporter_email_verified, route_path, user_agent } — the values the BEFORE
  // INSERT trigger DERIVED, handed back by RETURNING. Reading them here instead
  // of re-selecting the row is what keeps a signed-in submission off the
  // service-role client entirely (SELECT on bug_reports is admin-only).
  const out = (data ?? {}) as Record<string, unknown>;
  const id = typeof out.id === "string" ? out.id : "";

  // 5) Notify — strictly AFTER the row is committed, and strictly best effort.
  //
  // AWAITED rather than fire-and-forget because Vercel does not guarantee that
  // work left running after a server action returns is ever completed; the
  // 10s AbortController inside the transport bounds what that costs. The
  // result NEVER depends on the outcome: losing a saved report to a
  // notification error is the one failure this feature must not have. The
  // whole block is wrapped because a THROW here would do exactly that.
  // Read the stored row back so the notification reports what an admin will
  // actually see — reporter_role and reporter_email are DERIVED by the trigger,
  // so the app tier does not otherwise know them, and guessing ("signed-in")
  // would put a value in an ops mail that no screen agrees with.
  //
  // SERVICE ROLE, not the caller's client: SELECT on bug_reports is admin-only,
  // so a signed-in reporter's own session reads nothing back and the mail would
  // quietly lose those fields on precisely the reports that have them. Five
  // non-sensitive columns of a row this request just created.
  //
  // Its OWN try: sharing one with the send meant a throw here skipped
  // notifyBugReport altogether — the opposite of "degrades the mail, never the
  // submission". A failed read now costs detail, not the whole notification.
  try {
    await notifyBugReport({
      id,
      title: v.title,
      description: v.description,
      steps: v.steps,
      expected: v.expected,
      actual: v.actual,
      severity: v.severity,
      routePath: (out.route_path as string | null) ?? routePath,
      userAgent: (out.user_agent as string | null) ?? userAgent,
      locale: ctx.locale,
      platform: ctx.platform,
      appVersion: ctx.appVersion,
      reporterEmail: (out.reporter_email as string | null) ?? contactEmail,
      reporterEmailVerified: (out.reporter_email_verified as boolean | null) ?? !ctx.anonymous,
      reporterRole: (out.reporter_role as string | null) ?? (ctx.anonymous ? "anonymous" : "—"),
    });
  } catch (err) {
    // A short machine reason only — never the provider payload, never the body.
    console.error("[bugreport] notification failed", (err as Error)?.name ?? "error");
  }

  return { ok: true };
}
