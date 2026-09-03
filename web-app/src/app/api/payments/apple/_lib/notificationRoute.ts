// THE HTTP SHELL SHARED BY BOTH NOTIFICATION ENDPOINTS — SERVER ONLY.
//
// Both endpoints are PUBLIC BY NECESSITY: Apple calls them and carries no
// credential of ours. There is nothing to authenticate, so the safety comes from
// the signature check inside the core and from this shell being cheap and
// bounded before it gets there — the same shape `azericard/callback.ts` uses for
// the bank's BACKREF post, and for the same reason.
//
// WHAT LEAVES THIS FILE. A status code and `{"ok":true}` or `{"ok":false}`.
// Never an outcome, never a reason, never a transaction id, never a Postgres
// message. Apple ignores the body entirely; anyone else POSTing here gets no
// information about whether their guess was interesting.
import "server-only";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAppleIapConfig } from "@/lib/payments/apple/config";
import type { AppleRail } from "@/lib/payments/apple/rails";
import type { AppleEnvironment } from "@/lib/payments/apple";
import { rateLimitAllow } from "@/lib/rateLimit";
import { handleAppleNotification, NOTIFICATION_MAX_BODY_BYTES } from "./notificationCore";
import { buildNotificationDeps } from "./wire";

/**
 * Per-IP budget.
 *
 * Set HIGH on purpose. A throttle on this endpoint is protection against an
 * anonymous flood, but it is also, at the wrong setting, a way to drop a real
 * REFUND — and Apple's retries are finite. Our real volume is a handful of
 * messages a day, so 600 per quarter-hour is orders of magnitude above anything
 * legitimate while still bounding an attacker to a rate the verifier can absorb.
 * The cheap rejections (bad JSON, wrong rail) happen before any crypto anyway.
 */
const RATE_LIMIT = 600;
const RATE_WINDOW_MS = 15 * 60_000;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function answer(status: number): Response {
  return NextResponse.json({ ok: status >= 200 && status < 300 }, { status, headers: NO_STORE });
}

/**
 * Serve one App Store Server Notification V2 on the given rail.
 *
 * `allowGrants` is passed in by each route rather than decided here, so the
 * posture of each endpoint is visible at its own call site.
 */
export async function serveAppleNotification<E extends AppleEnvironment>(
  request: Request,
  rail: AppleRail<E>,
  allowGrants: boolean,
): Promise<Response> {
  // ---- 0. Bound the work before doing any of it --------------------------
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "local";
  const ipHash = createHash("sha256").update(ip).digest("hex");
  if (!rateLimitAllow(`applenotif${rail.environment}`, ipHash, RATE_LIMIT, RATE_WINDOW_MS)) {
    // 429 is a non-2xx, so Apple retries — which is exactly right: a throttled
    // genuine notification must come back, not be lost.
    return answer(429);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return answer(400);
  }
  if (Buffer.byteLength(raw, "utf8") > NOTIFICATION_MAX_BODY_BYTES) {
    return answer(413);
  }

  // Checked HERE and not only inside the writer, so an unconfigured deployment
  // answers 503 (Apple retries) instead of walking a verifier that would fail
  // for a reason indistinguishable from a forged signature.
  if (!getAppleIapConfig()) {
    // Never say WHY, and never name the missing variable — a payment endpoint
    // that explains its own configuration is a reconnaissance gift.
    // `describeConfigProblems()` exists for the operator, on the server side.
    console.error(`[apple] ${rail.environment} notification received while not configured`);
    // 503 so Apple retries: this is our outage, and the message is still real.
    return answer(503);
  }

  const result = await handleAppleNotification(raw, buildNotificationDeps(rail, allowGrants));
  return answer(result.status);
}

/**
 * A GET here is a person or a crawler, never Apple.
 *
 * 405 with no lookup and no state change. Deliberately not a friendly page: this
 * URL is in App Store Connect and nowhere else, and anything it renders is
 * something a scanner can fingerprint.
 */
export function refuseAppleNotificationGet(): Response {
  return NextResponse.json(
    { ok: false },
    { status: 405, headers: { ...NO_STORE, Allow: "POST", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
