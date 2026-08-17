import "server-only";

// The app's ONE transactional-mail transport (Brevo).
//
// Nothing else in web-app, admin-panel or supabase sends mail: the auth
// confirmation emails come from Supabase Auth via Brevo SMTP configured in the
// Supabase DASHBOARD, which is outside application code and cannot be called
// from a route handler. This module is the application-side path, and its only
// caller is lib/notifications/delivery.ts — the email channel of the in-app
// notification pipeline.
//
// NO NEW DEPENDENCY: Brevo's transactional API is plain HTTPS + an `api-key`
// header, so this is a `fetch` — exactly how the Expo push path in
// lib/notifications/delivery.ts was built, and for the same reason (keeping
// `npm audit` at zero and the bundle small). Do not add nodemailer for this.
//
// `import "server-only"` is load-bearing: BREVO_API_KEY is a secret, and the
// build must fail loudly if this file is ever pulled into a client bundle
// rather than quietly shipping the key to browsers.
import type { DeliveryResult } from "@/lib/notifications/delivery";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
// The same bound the push path uses — one number for "an outbound provider
// call may not hold a request open longer than this".
const FETCH_TIMEOUT_MS = 10_000;

const SUBJECT_MAX = 200;
const SENDER_NAME_MAX = 70;

const apiKey = process.env.BREVO_API_KEY ?? "";
const senderEmail = process.env.BREVO_SENDER_EMAIL ?? "";
const senderName = process.env.BREVO_SENDER_NAME ?? "OlympIQ";

/** Both are required: a Brevo send without a VERIFIED sender is rejected. */
export const isMailConfigured = apiKey.length > 0 && senderEmail.length > 0;

/**
 * Strip CR/LF and cap.
 *
 * This is a JSON API, not raw SMTP, so a newline cannot inject a header the
 * way it would in a hand-rolled message — but a JSON transport is not a reason
 * to hand unsanitised header-shaped values to a provider that will eventually
 * serialise them into one. Every value here originates in a form field.
 */
function headerSafe(value: string, max: number): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

/** Cheap shape check so an obviously broken recipient never costs a request. */
function isEmailish(value: string): boolean {
  return value.length > 0 && value.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/**
 * Send one plain-text transactional email.
 *
 * NEVER THROWS. Every failure — missing config, a network error, a timeout, a
 * provider rejection — comes back as `{ok:false, error}` with a SHORT machine
 * reason. Mail is best-effort by contract: the notification processor marks a
 * delivery row failed and retries it, and no caller may lose the thing it
 * already persisted because an outbound provider was down.
 *
 * TEXT ONLY, never `htmlContent`: every body this sends is assembled from
 * user-supplied free text, and plain text cannot execute in a mail client or
 * need an escaping pass to be safe.
 */
export async function sendTransactionalEmail(msg: {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<DeliveryResult> {
  if (!isMailConfigured) return { ok: false, error: "not_configured" };

  const to = (msg.to ?? []).map((t) => t.trim()).filter(isEmailish);
  if (to.length === 0) return { ok: false, error: "no_recipients" };

  const replyTo = (msg.replyTo ?? "").trim();
  const body: Record<string, unknown> = {
    sender: { email: senderEmail, name: headerSafe(senderName, SENDER_NAME_MAX) },
    to: to.map((email) => ({ email })),
    subject: headerSafe(msg.subject ?? "", SUBJECT_MAX),
    textContent: msg.text ?? "",
  };
  if (isEmailish(replyTo)) body.replyTo = { email: replyTo };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // The STATUS only. A provider error body can echo the message back —
      // including the report text — and this reason is written to logs.
      return { ok: false, error: `http_${res.status}` };
    }
    const json = (await res.json().catch(() => null)) as { messageId?: string } | null;
    return { ok: true, providerRef: json?.messageId };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error)?.name === "AbortError" ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timer);
  }
}
