// The address a just-completed registration is waiting to confirm.
//
// WHY A COOKIE AND NOT A QUERY PARAMETER
// --------------------------------------
// /verify-email has to resend the confirmation mail, which means it needs the
// address. Putting it in the URL would write a real person's email into browser
// history, the server access log, and the `Referer` header of every asset that
// page loads — the precise leak the content-free `sent=1` flag was introduced to
// avoid. A cookie carries it invisibly, and `httpOnly` keeps page scripts out
// too, so an XSS on an unrelated public page cannot harvest it.
//
// WHY IT EXPIRES
// --------------
// This is a convenience hint with a short useful life. Thirty minutes covers
// "I registered, the mail did not arrive, let me resend"; anything longer just
// leaves an address sitting in a shared browser. When it is gone, /verify-email
// falls back to asking for the address, so nothing breaks — the user is simply
// back to the flow that existed before.
import "server-only";
import { cookies } from "next/headers";
import { EMAIL_MAX } from "@/lib/auth/parentValidation";

const COOKIE = "olympiq_pending_verify_email";
const MAX_AGE_SECONDS = 30 * 60;

/** Store the address a registration is awaiting confirmation for. */
export async function setPendingVerifyEmail(email: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, email.slice(0, EMAIL_MAX), {
    httpOnly: true,
    sameSite: "lax",
    // Set only over TLS in production; a plain-HTTP localhost dev server would
    // silently drop a `secure` cookie and the whole flow would look broken.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Read it back. Returns null when absent or implausible.
 *
 * The value is treated as UNTRUSTED even though we wrote it: a cookie is client
 * storage and the user can edit it. It is only ever used to prefill a resend,
 * and the resend endpoint re-validates the address and applies its own rate
 * limits, so the worst a tampered value achieves is a resend to an address the
 * tamperer already controls the browser of.
 */
export async function getPendingVerifyEmail(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const email = raw.trim().slice(0, EMAIL_MAX);
  // Shape check only — proving it exists is the resend endpoint's job, and
  // deliberately not something this page reveals.
  if (!email.includes("@") || email.length < 3) return null;
  return email;
}

/** Drop it — after a successful resend there is nothing left to prefill. */
export async function clearPendingVerifyEmail(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
