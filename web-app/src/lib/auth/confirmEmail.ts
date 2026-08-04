// ONE resolver for every link Supabase mails us: signup confirmation, password
// recovery, email change, magic link.
//
// WHY THIS EXISTS — the bug it fixes
// ----------------------------------
// The templates used to link to `{{ .ConfirmationURL }}`, which expands to
//
//     {SUPABASE_URL}/auth/v1/verify?token=<hash>&type=signup&redirect_to=<ours>
//
// GoTrue verifies the token there and then redirects to `redirect_to` — but
// WHAT it appends depends on the flow the SIGN-UP used, and the two apps sign
// up differently:
//
//   * web-app registers through @supabase/ssr, which is PKCE. GoTrue appends
//     `?code=…`, and exchanging it needs the `code_verifier` cookie written at
//     sign-up time. Same browser: works. A phone, a second browser, or cleared
//     cookies: fails.
//
//   * the mobile BFF registers through a bare @supabase/supabase-js client with
//     `persistSession: false`, so NO verifier exists anywhere. GoTrue appends
//     `#access_token=…` instead — a URL FRAGMENT, which is never sent to the
//     server. A route handler cannot read it under any circumstance, so the
//     mobile confirmation link could not work: it always landed on the failure
//     branch. This is not a tuning problem; it is unfixable server-side.
//
// The fix is to stop routing through `/auth/v1/verify` at all. The templates now
// link HERE with `{{ .TokenHash }}`, and we verify the OTP ourselves.
// `verifyOtp({ token_hash, type })` is flow-agnostic — it works identically for
// a PKCE web sign-up and an implicit mobile one, so one code path serves both.
//
// `code` is still accepted so links already sitting in inboxes keep working.
import { createClient } from "@/lib/supabase/server";
import { isSafeRelativeUrl } from "@/lib/notifications/types";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Only ever forward to a same-origin RELATIVE path. Anything else (absolute
 * URLs, protocol-relative "//evil.com", backslash tricks, or the userinfo trick
 * where "@evil.com" appended to the origin becomes credentials@host) falls back
 * to the dashboard. Prevents open redirects (R7 security fix).
 */
export function safeNext(raw: string | null, fallback = "/dashboard"): string {
  return isSafeRelativeUrl(raw) ? raw : fallback;
}

// Whitelist, not a cast. `type` arrives from a URL an attacker can edit, and it
// selects which OTP class we are willing to honour — never pass it through.
const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

// A token hash is a hex/base64url digest. Bounding it keeps a megabyte of junk
// out of the auth call and out of the logs.
const TOKEN_HASH_MAX = 512;

function otpType(raw: string | null): EmailOtpType | null {
  if (!raw) return null;
  return (OTP_TYPES as readonly string[]).includes(raw)
    ? (raw as EmailOtpType)
    : null;
}

export type ConfirmOutcome =
  | { ok: true; next: string }
  | { ok: false; reason: "expired" | "invalid" };

/**
 * Resolve a confirmation link into a session.
 *
 * Failure is deliberately coarse — "expired" vs "invalid" — because the caller
 * turns it into a message for a signed-out visitor, and a precise reason would
 * tell someone probing links which of their guesses was closer.
 */
export async function confirmEmailLink(
  url: URL,
  fallbackNext = "/dashboard",
): Promise<ConfirmOutcome> {
  const params = url.searchParams;
  const next = safeNext(params.get("next"), fallbackNext);

  const rawHash = params.get("token_hash");
  const type = otpType(params.get("type"));

  // Preferred path: our own templates.
  if (rawHash && type && rawHash.length <= TOKEN_HASH_MAX) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: rawHash,
    });
    if (!error) return { ok: true, next };
    return { ok: false, reason: isExpired(error.message) ? "expired" : "invalid" };
  }

  // Legacy path: `{{ .ConfirmationURL }}` links already in inboxes, PKCE only.
  const code = params.get("code");
  if (code && code.length <= TOKEN_HASH_MAX) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return { ok: true, next };
    return { ok: false, reason: isExpired(error.message) ? "expired" : "invalid" };
  }

  // No usable credential. The commonest cause is an implicit-flow link whose
  // token arrived in the `#fragment` the server cannot see — which is exactly
  // what this module exists to stop happening.
  return { ok: false, reason: "invalid" };
}

/**
 * Supabase does not expose a stable machine code for "this link aged out", so
 * the message is matched. A miss only costs the user a slightly less specific
 * sentence — both branches offer the same resend action.
 */
function isExpired(message: string): boolean {
  return /expired|invalid or has expired|token has expired/i.test(message);
}
