"use server";

// "Report a bug" (migration 116) — the WEB write path, serving all three
// surfaces: the public /contact page, the parent /help/contact page and the
// child /child/help/contact page. One action, because they all render the same
// shared <ContactInfo> component.
//
// WHY THERE IS NO requireParent()/requireChild() HERE: those helpers redirect()
// when the role does not match, and the public contact page must work SIGNED
// OUT. The session is resolved instead — parent, then child, then anonymous —
// and the resolution decides which supabase client the core receives. That
// resolution IS the authorization decision, and it is made before anything the
// client sent is read.
//
// The two clients, and why the split is safe:
//   signed in  → the USER-SESSION client. RLS (bugreports_insert) and
//                trg_bug_report_derive are the gate; current_profile_id()
//                resolves to the reporter, so the row is stamped with THEM
//                whatever the payload claims.
//   signed out → the SERVICE-ROLE client, reached only AFTER the honeypot and
//                the per-IP throttle have passed. current_profile_id() is NULL
//                under the service role, so the trigger writes
//                reporter_role='anonymous' by itself — the anonymous row is a
//                natural consequence of the caller, not a flag we pass.
//
// Anonymous submission is deliberate: "I cannot register" and "the login page
// is blank" are reports only a signed-out visitor can file, and requiring an
// account filters exactly that class out by construction.
import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { getParent, getChildResolution } from "@/lib/auth/session";
import { getLocale } from "@/i18n/server";
import { rateLimitAllow } from "@/lib/rateLimit";
import { submitBugReportCore, type BugReportResult } from "@/lib/support/bugReportCore";
import type { BugReportInput } from "@/lib/support/bugReport";

const HOUR_MS = 3_600_000;
// Per signed-in reporter. The DB trigger's 5/hour + 20/day is the authority.
const SIGNED_IN_LIMIT = 5;
// Per anonymous IP. Deliberately tighter: an anonymous row carries no account
// to hold responsible, and the DB's global 20/hour cap is the real backstop.
const ANON_LIMIT = 3;

// The IP is used ONLY as a throttle key and is NEVER stored: it is hashed with
// a server-only salt and lives exclusively in the in-memory bucket map. A
// random per-process fallback keeps the throttle working when the salt is
// unset (it resets on restart, which is strictly better than a stable
// unsalted hash of a visitor's address).
const IP_SALT = process.env.BUG_REPORT_IP_SALT || randomUUID();

/** First hop of x-forwarded-for — the client as the edge saw it. */
function clientIpKey(forwarded: string | null, realIp: string | null): string {
  const first = (forwarded ?? "").split(",")[0]?.trim() || (realIp ?? "").trim();
  if (first === "") return "unknown";
  return createHash("sha256").update(`${first}${IP_SALT}`).digest("hex").slice(0, 32);
}

export async function submitBugReport(
  input: Partial<BugReportInput>,
): Promise<BugReportResult> {
  // Resolve WHO is calling first — before any client value is read or used.
  const parent = await getParent();
  const child = parent ? null : await getChildResolution();
  const profileId = parent?.profileId ?? (child?.kind === "yes" ? child.profileId : null);

  // A child resolution of "unknown" means the lookup FAILED, not that nobody is
  // signed in — getParent() collapses the same case to null. Treating that as
  // anonymous silently downgrades a real user three ways at once: the row is
  // stored unattributed, a client-typed address becomes the reporter email, and
  // the per-profile throttle is swapped for the shared global anonymous bucket.
  // Fail CLOSED and ask them to retry: a transient failure costs one retry,
  // whereas guessing "anonymous" corrupts the record permanently.
  if (child?.kind === "unknown") {
    return { ok: false, errorKey: "bug.err.retry" };
  }

  const anonymous = profileId === null;

  // The honeypot: a field no human ever sees, so anything in it is a bot. The
  // response is a FAKE SUCCESS — telling a bot it failed just teaches it which
  // field to leave alone next time, and no row is written either way.
  if (typeof input?.website === "string" && input.website.trim() !== "") {
    return { ok: true };
  }

  const hdrs = await headers();
  const userAgent = hdrs.get("user-agent");

  let client;
  let throttleScope: string;
  let throttleKey: string;
  let throttleLimit: number;

  if (anonymous) {
    // No service role configured = no anonymous path at all. Failing here is
    // correct: the alternative would be an unauthenticated insert attempt that
    // RLS rejects with a confusing generic error.
    if (!isServiceRoleConfigured) return { ok: false, errorKey: "bug.err.generic" };
    client = getAdminClient();
    throttleScope = "bugReportAnon";
    throttleKey = clientIpKey(hdrs.get("x-forwarded-for"), hdrs.get("x-real-ip"));
    throttleLimit = ANON_LIMIT;
  } else {
    client = await createClient();
    throttleScope = "bugReport";
    throttleKey = profileId;
    throttleLimit = SIGNED_IN_LIMIT;
  }

  const locale = await getLocale();

  return submitBugReportCore(
    client,
    {
      // getLocale() reads the cookie the app already validated against the
      // admin's enabled-locales setting — never a value from the payload.
      locale,
      platform: "web",
      // WHICH BUILD this came from. A server-only Vercel env var, so it cannot
      // be spoofed and cannot leak anything the deployment does not already
      // publish; unset in local dev, which is fine — it is a diagnostic.
      appVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      // From the REQUEST HEADER, never a form field.
      userAgent,
      anonymous,
      throttleScope,
      throttleKey,
      throttleLimit,
      throttleWindowMs: HOUR_MS,
    },
    input,
  );
}
