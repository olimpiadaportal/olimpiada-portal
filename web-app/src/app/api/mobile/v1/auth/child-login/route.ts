// Mobile BFF — child login (8-digit ID + parent-set password → session TOKENS).
//
// The React Native app has no cookie jar, so unlike the web childLoginAction
// (SSR client → httpOnly cookies) this endpoint signs in on a BARE token client
// and returns the Supabase session tokens as JSON. Everything else mirrors the
// audited web flow exactly: same validation (validateChildLogin), the same
// per-IP throttle shape on top of the same DB lockout (is_child_login_locked),
// the same attempt bookkeeping (record_child_login_attempt), and the same
// generic errors — responses carry i18n KEYS the mobile app translates, never
// raw text, and never reveal whether the ID exists vs the password was wrong.
//
// No CORS headers on purpose: native apps don't need them, and leaving them
// off keeps browsers out.
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { getAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { childSyntheticEmail, validateChildLogin } from "@/lib/auth/children";
import { rateLimitAllow } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Login payloads are tiny; anything bigger is not a real client.
const BODY_MAX_BYTES = 2048;

function json(body: Record<string, unknown>, status: number): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
    const childUniqueId =
      typeof body.child_id === "string" ? body.child_id.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    // Same per-IP throttle the web child login builds (first hop of
    // x-forwarded-for, x-real-ip fallback, "local" in dev); only a sha256
    // hash of the IP is ever kept or logged.
    const xff = request.headers.get("x-forwarded-for") ?? "";
    const ip =
      xff.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip")?.trim() ||
      "local";
    const ipHash = createHash("sha256").update(ip).digest("hex");
    if (!rateLimitAllow("mchildlogin", ipHash, 20, 15 * 60_000)) {
      return json({ error: "auth.child.err.locked", retryable: true }, 429);
    }

    const check = validateChildLogin(childUniqueId, password);
    if (!check.ok) {
      return json(
        { error: check.errors[0] ?? "auth.child.err.invalidCredentials", retryable: false },
        400,
      );
    }

    if (!isServiceRoleConfigured) {
      return json({ error: "auth.child.err.serverError", retryable: true }, 503);
    }
    const admin = getAdminClient();

    // Lockout gate (do not even attempt while locked).
    const { data: locked, error: lockErr } = await admin.rpc("is_child_login_locked", {
      p_child_unique_id: childUniqueId,
    });
    if (lockErr) {
      return json({ error: "auth.child.err.serverError", retryable: true }, 500);
    }
    if (locked === true) {
      return json({ error: "auth.child.err.locked", retryable: false }, 423);
    }

    // Bare token client — no cookies, no persistence; the session lives only
    // in this response.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: childSyntheticEmail(childUniqueId),
      password,
    });
    const success = !error && !!data?.session && !!data?.user;

    // Record the attempt (success clears the recent failure streak).
    await admin.rpc("record_child_login_attempt", {
      p_child_unique_id: childUniqueId,
      p_ip_hash: ipHash,
      p_success: success,
    });

    // Generic error — never reveal whether the ID exists vs the password was wrong.
    if (!success || !data.session || !data.user) {
      return json({ error: "auth.child.err.invalidCredentials", retryable: false }, 401);
    }
    const session = data.session;
    return json(
      {
        ok: true,
        data: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          expires_at: session.expires_at ?? null,
          token_type: session.token_type,
          user_id: data.user.id,
          role: "student",
        },
      },
      200,
    );
  } catch {
    // Never leak internals (error.message) to any client.
    return json({ error: "auth.child.err.serverError", retryable: true }, 500);
  }
}
