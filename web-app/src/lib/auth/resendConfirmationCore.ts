import "server-only";

// Shared throttle + failure-classification for the "resend confirmation email"
// surface. ONE source of truth for the web server action
// (lib/auth/parentService.resendConfirmationEmail) and the mobile BFF route
// (/api/mobile/v1/auth/resend) — the two used to duplicate this logic and had
// already drifted (different IP fallbacks, different bucket sizes), which is
// exactly how a limiter silently stops limiting.
//
// Nothing here is privileged: no session, no service-role client, no DB.
import { createHash } from "node:crypto";
import { rateLimitAllow } from "@/lib/rateLimit";

const WINDOW_15_MIN = 15 * 60_000;
const WINDOW_1_HOUR = 60 * 60_000;

// THREE buckets, all shared between web and mobile (lib/rateLimit.ts keeps its
// Map on globalThis, so the two build layers really do share one budget):
//
//   resend       per address  — stops one inbox being mail-bombed.
//   resendip     per source   — stops one host rotating addresses.
//   resendglobal one counter  — the only bucket whose worst case is bounded by
//                               the thing that actually costs money. Resend is
//                               an outbound-email trigger on a metered plan
//                               (Brevo free tier = 300 mails/day) SHARED with
//                               signup confirmation and password reset, so a
//                               per-IP cap alone does not bound spend: 10/15min
//                               per host is ~960 mails/day from ONE machine,
//                               3x the entire daily allowance. Exhausting it
//                               would take down confirmation AND reset mail for
//                               every user — a far worse outcome than one
//                               abuser hitting a global ceiling, which is why
//                               the global cap sits comfortably under the
//                               daily budget instead of above it.
const PER_ADDRESS_LIMIT = 3;
const PER_SOURCE_LIMIT = 5;
const GLOBAL_LIMIT = 40;

/** Anything with a header lookup: next/headers ReadonlyHeaders or a Request's. */
export type HeaderBag = { get(name: string): string | null };

/**
 * A stable, non-reversible key for the request source, or null when the source
 * cannot be identified at all.
 *
 * Returning null (rather than a "local" sentinel) matters: a sentinel would
 * collapse EVERY caller into one shared per-source bucket, so in any
 * environment without a forwarded-for header — local dev, or a self-hosted
 * proxy that sets neither header — the fifth resend by anyone would throttle
 * everyone. The global bucket still bounds spend in that case.
 *
 * The hash is a key, not a privacy control (the IPv4 space is trivially
 * searchable); it exists so no raw address is held in a long-lived map.
 */
export function resendSourceKey(headers: HeaderBag): string | null {
  const ip =
    (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    (headers.get("x-real-ip") ?? "").trim();
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Consume one resend attempt. `email` must already be normalized (trimmed +
 * lowercased) so both surfaces key the same bucket.
 *
 * Buckets are checked most-specific first so a single mail-bombed address is
 * rejected by its own bucket WITHOUT spending from the shared global budget.
 * Every rejection is reported identically — which bucket tripped is never
 * exposed, so this cannot become an oracle either.
 */
export function allowResendAttempt(email: string, headers: HeaderBag): boolean {
  if (!rateLimitAllow("resend", email, PER_ADDRESS_LIMIT, WINDOW_15_MIN)) return false;
  const source = resendSourceKey(headers);
  if (source && !rateLimitAllow("resendip", source, PER_SOURCE_LIMIT, WINDOW_1_HOUR)) {
    return false;
  }
  return rateLimitAllow("resendglobal", "all", GLOBAL_LIMIT, WINDOW_1_HOUR);
}

/**
 * Is this resend failure ADDRESS-INDEPENDENT (our mail rail is broken) rather
 * than address-dependent (unknown address / already confirmed / asked again
 * inside GoTrue's per-address interval)?
 *
 * The distinction is the whole anti-enumeration line. Address-dependent
 * outcomes MUST stay swallowed behind the neutral success answer. Infrastructure
 * outcomes happen identically for every address, so surfacing them leaks
 * nothing — and swallowing them is actively harmful: with SMTP down or the
 * daily quota exhausted, every user would see a green "we sent it again" for a
 * mail that was never going to arrive. That is the exact silent-failure class
 * this feature exists to remove.
 *
 * supabase-js RETURNS these as `{ error }` (it only throws non-AuthError
 * values), so a try/catch alone never sees them:
 *   • transport failure   → AuthRetryableFetchError, status 0
 *   • 5xx / gateway       → AuthRetryableFetchError, status 500…530
 *   • SMTP send rejected  → AuthApiError, code "error_sending_email"
 * A 429 (over_email_send_rate_limit) is deliberately NOT in this set.
 */
export function isMailInfrastructureFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; status?: unknown; code?: unknown };
  if (e.name === "AuthRetryableFetchError") return true;
  if (typeof e.status === "number" && (e.status === 0 || e.status >= 500)) return true;
  return e.code === "error_sending_email";
}
