// Mobile BFF — resend the SIGNUP confirmation email.
//
// Token-less twin of the web resendConfirmationEmail action: the SAME email
// validation (EMAIL_MAX/EMAIL_RE), the SAME throttle and the SAME failure
// classification — both imported from lib/auth/resendConfirmationCore, so web
// and mobile share ONE budget (the limiter's Map lives on globalThis) and the
// two surfaces cannot drift apart. Same anon client, same deliberately NEUTRAL
// answer.
//
// The app must not call supabase.auth.resend itself: that would bypass the
// house limiter, and this endpoint is an outbound-email trigger with a real
// per-day cost. It authorizes NOTHING (pre-auth by design), never touches the
// service-role client, and grants no session or entitlement.
//
// ENUMERATION: every address-dependent outcome answers 200
// {ok:true,data:{sent:true}} — unknown address, already-confirmed address and a
// per-address GoTrue rejection are indistinguishable. The other statuses are
// address-INDEPENDENT and therefore safe: 400 (the caller's own malformed
// address), 429 (throttled) and 500 (our mail rail is down — see
// isMailInfrastructureFailure; hiding that would show "sent" for a mail that
// could not possibly arrive). Known residual: response LATENCY still differs
// between a real send and a short-circuit; not padded, see the note on the web
// action.
//
// No CORS headers on purpose: native apps don't need them, and leaving them
// off keeps browsers out.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { EMAIL_MAX, EMAIL_RE } from "@/lib/auth/parentValidation";
import {
  allowResendAttempt,
  isMailInfrastructureFailure,
} from "@/lib/auth/resendConfirmationCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The payload is one email address; anything bigger is not a real client.
const BODY_MAX_BYTES = 1024;

function json(body: Record<string, unknown>, status: number): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Drive-by guard. This endpoint spends money on every call, and any web
    // page can make a browser POST JSON at it cross-origin — the response is
    // opaque to the attacker, but the mail is still sent and every visitor
    // brings their OWN source IP, routing straight around the per-source
    // bucket. A custom header is a NON-simple request, so a cross-origin
    // browser must preflight; there is no OPTIONS handler, so the request is
    // never dispatched. A native client sends it trivially (lib/api.ts) and a
    // script can forge it — this stops mass drive-by, not a determined
    // attacker, which is what the global bucket is for.
    if (request.headers.get("x-olympiq-client") !== "mobile") {
      return json({ error: "mob.err.serverUnavailable", retryable: false }, 403);
    }

    // Defensive body read: cap size, never let JSON.parse throw out. An
    // oversized/unparseable body falls through as empty fields and is
    // rejected by the same validation path a real bad submission hits.
    let body: Record<string, unknown> = {};
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") <= BODY_MAX_BYTES) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        // fall through with empty body
      }
    }
    const email = (typeof body.email === "string" ? body.email : "")
      .trim()
      .toLowerCase();

    // A malformed address is the caller's own typo — rejecting it reveals
    // nothing about which accounts exist.
    if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
      return json({ error: "parent.err.email", retryable: false }, 400);
    }

    // Per-address + per-source + global buckets, shared with the web action.
    // Which one tripped is never exposed, so this cannot become an oracle.
    if (!allowResendAttempt(email, request.headers)) {
      return json({ error: "parent.err.tooMany", retryable: true }, 429);
    }

    // Bare anon client — no cookies, no persistence, no session produced.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    });
    if (error) {
      // Log the CODE only — never the address, never the message.
      console.error(
        "mobile resend: resend rejected",
        (error as { code?: string }).code ?? "unknown_error",
      );
      // Address-INDEPENDENT failures are reported honestly (see the header
      // note); everything address-dependent stays behind the neutral 200.
      if (isMailInfrastructureFailure(error)) {
        return json({ error: "verify.resendFailed", retryable: true }, 500);
      }
    }
    return json({ ok: true, data: { sent: true } }, 200);
  } catch {
    // Never leak internals (error.message) to any client.
    return json({ error: "verify.resendFailed", retryable: true }, 500);
  }
}
