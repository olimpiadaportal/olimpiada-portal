// THE HTTP SHELL OF THE GOOGLE PLAY RTDN ENDPOINT — SERVER ONLY.
//
// PUBLIC BY NECESSITY, but NOT unauthenticated — the one way this endpoint
// differs from Apple's. Apple signs each notification body, so Apple's endpoint
// verifies the body. Google Play hands its notification to Cloud Pub/Sub, and a
// Pub/Sub PUSH subscription authenticates the delivery with a Google-signed
// OIDC token in `Authorization: Bearer`. This shell verifies that token —
// RS256 against Google's published keys, issuer accounts.google.com, the
// audience WE configured, the service-account email WE configured — BEFORE the
// body is read.
//
// FAILS CLOSED. GOOGLE_PLAY_RTDN_AUDIENCE or GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT
// unset means every POST is refused (503, so Pub/Sub keeps the message and
// redelivers once an operator fixes it) — never "accept any token".
//
// WHAT LEAVES THIS FILE: a status code and `{"ok":true|false}`. Never an
// outcome, never a reason, never an order id. Pub/Sub ignores the body; anyone
// else learns nothing.
import "server-only";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getRtdnAuthConfig, type RtdnAuthConfig } from "@/lib/payments/google/config";
import { resolveGoogleOidcKey } from "@/lib/payments/google/jwks";
import { verifyGoogleOidcToken, type OidcVerifyResult } from "@/lib/payments/google/jwt";
import { rateLimitAllow } from "@/lib/rateLimit";
import {
  RTDN_MAX_BODY_BYTES,
  handleGoogleNotification,
  type GoogleNotificationDeps,
  type NotificationResult,
} from "./notificationCore";
import { buildGoogleNotificationDeps } from "./wire";

/** Per-IP budget, set high for the reason the Apple shell gives. */
const RATE_LIMIT = 600;
const RATE_WINDOW_MS = 15 * 60_000;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function answer(status: number): Response {
  return NextResponse.json({ ok: status >= 200 && status < 300 }, { status, headers: NO_STORE });
}

/** The seams, so the shell's fail-closed behaviour is testable without Google. */
export type GoogleNotificationShellDeps = {
  readonly authConfig: () => RtdnAuthConfig | null;
  readonly verifyToken: (token: string, auth: RtdnAuthConfig) => Promise<OidcVerifyResult>;
  readonly buildDeps: () => GoogleNotificationDeps | null;
  readonly handle: (raw: string, deps: GoogleNotificationDeps) => Promise<NotificationResult>;
};

const DEFAULT_SHELL: GoogleNotificationShellDeps = {
  authConfig: getRtdnAuthConfig,
  verifyToken: (token, auth) =>
    verifyGoogleOidcToken(
      token,
      { audience: auth.audience, email: auth.serviceAccountEmail },
      resolveGoogleOidcKey,
    ),
  buildDeps: buildGoogleNotificationDeps,
  handle: handleGoogleNotification,
};

export async function serveGoogleNotification(
  request: Request,
  shell: GoogleNotificationShellDeps = DEFAULT_SHELL,
): Promise<Response> {
  // ---- 0. Bound the work before doing any of it --------------------------
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "local";
  const ipHash = createHash("sha256").update(ip).digest("hex");
  if (!rateLimitAllow("gpnotif", ipHash, RATE_LIMIT, RATE_WINDOW_MS)) return answer(429);

  // ---- 1. CLOSED unless configured ---------------------------------------
  const auth = shell.authConfig();
  if (!auth) return answer(503);

  // ---- 2. AUTHENTICATE THE PUSH, before the body is read -----------------
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return answer(401);
  const verified = await shell.verifyToken(match[1]!, auth);
  if (!verified.ok) {
    // The reason is a short internal code — never the token, never a claim.
    console.warn(`[google] RTDN push refused: ${verified.reason}`);
    return answer(401);
  }

  // ---- 3. The body --------------------------------------------------------
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return answer(400);
  }
  if (Buffer.byteLength(raw, "utf8") > RTDN_MAX_BODY_BYTES) return answer(413);

  // ---- 4. The Play API must be usable to act on it ------------------------
  const deps = shell.buildDeps();
  if (!deps) {
    // Our outage, and the message is real: 503 so Pub/Sub redelivers.
    console.error("[google] RTDN received while the Play API is not configured");
    return answer(503);
  }

  const result = await shell.handle(raw, deps);
  return answer(result.status);
}

/** A GET here is a person or a crawler, never Pub/Sub. */
export function refuseGoogleNotificationGet(): Response {
  return NextResponse.json(
    { ok: false },
    { status: 405, headers: { ...NO_STORE, Allow: "POST", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
