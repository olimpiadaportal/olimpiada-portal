// Mobile BFF — parent registration (email/password → session TOKENS).
//
// Token-based twin of the web registerParent action: the SAME validation
// (lib/auth/parentValidation — one source of truth), the SAME rate-limit
// bucket ("register" keyed by email, so web + mobile share one budget), the
// same signUp → setup_parent RPC → phone-persist flow, and the same generic
// errors (i18n KEYS the mobile app translates; the only specific message is
// the owner-approved duplicate-email one). The React Native app has no cookie
// jar, so sign-up happens on a BARE token client and, when the Supabase
// project returns a session (email confirmation off), the tokens come back as
// JSON; otherwise the client is told to have the user verify their email.
//
// No CORS headers on purpose: native apps don't need them, and leaving them
// off keeps browsers out.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { validateParentRegistration } from "@/lib/auth/parentValidation";
import { rateLimitAllow } from "@/lib/rateLimit";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Registration payloads are small; anything bigger is not a real client.
const BODY_MAX_BYTES = 4096;

function json(body: Record<string, unknown>, status: number): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v : "";
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function POST(request: Request): Promise<Response> {
  try {
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
    const password = str(body, "password");

    // Same rules/keys/order as the web action (required → email → phone →
    // password); the validator normalizes (trim, email lowercase) — use ITS
    // values from here on.
    const check = validateParentRegistration({
      firstName: str(body, "first_name"),
      lastName: str(body, "last_name"),
      email: str(body, "email"),
      password,
      phone: str(body, "phone"),
    });
    if (!check.ok) return json({ error: check.errorKey, retryable: false }, 400);
    const { displayName, email, phone } = check;

    // SAME scope string as the web action → shared web+mobile budget.
    if (!rateLimitAllow("register", email, 5, 15 * 60_000)) {
      return json({ error: "parent.err.tooMany", retryable: true }, 429);
    }

    // Provisioning below needs the service role; refuse BEFORE creating an
    // auth user we could not finish setting up.
    if (!isServiceRoleConfigured) {
      return json({ error: "parent.err.createFailed", retryable: true }, 503);
    }

    // Bare token client — no cookies, no persistence; the session (if any)
    // lives only in this response.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: signUp, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl()}/auth/callback`,
        data: { account_type: "parent", display_name: displayName },
      },
    });
    if (error || !signUp?.user) {
      // Specific, actionable message when the email is already registered
      // (same detection as the web action: code "user_already_exists" on
      // newer Supabase, message match on older/localized).
      if (
        error &&
        ((error as { code?: string }).code === "user_already_exists" ||
          /already.*regist|already.*in use|exists/i.test(error.message))
      ) {
        return json({ error: "parent.err.emailExists", retryable: false }, 409);
      }
      return json({ error: "parent.err.createFailed", retryable: false }, 400);
    }

    // Provision the parent role/row now (service role; valid pre-confirmation).
    const admin = getAdminClient();
    const { data: parentProfileId } = await admin.rpc("setup_parent", {
      p_auth_user_id: signUp.user.id,
      p_display_name: displayName || null,
    });
    // registerParent has no shared "core" (unlike the other mobile BFF
    // routes) — this call is duplicated from the web action on purpose so
    // mobile registration is audited too.
    if (typeof parentProfileId === "string") {
      await writeAuditLog(parentProfileId, "parent.register");
    }

    // Persist the (already validated) phone on the profile. A failure here
    // must NOT fail registration — the auth user exists; the phone can be
    // backfilled. Log the error code only, never the phone value.
    const { error: phoneError } = await admin
      .from("profiles")
      .update({ phone })
      .eq("auth_user_id", signUp.user.id);
    if (phoneError) {
      console.error(
        "mobile register: failed to persist profile phone",
        phoneError.code ?? "unknown_error",
      );
    }

    // Confirmation disabled on the project → a session exists → tokens now.
    if (signUp.session) {
      const session = signUp.session;
      return json(
        {
          ok: true,
          data: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            expires_at: session.expires_at ?? null,
            token_type: session.token_type,
            user_id: signUp.user.id,
            role: "parent",
          },
        },
        200,
      );
    }
    // Otherwise the user must confirm their email, then log in.
    return json({ ok: true, data: { verify_email: true } }, 200);
  } catch {
    // Never leak internals (error.message) to any client.
    return json({ error: "parent.err.createFailed", retryable: true }, 500);
  }
}
