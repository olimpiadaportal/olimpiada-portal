// OWNER-ONLY test initiation for the AzeriCard sandbox — no UI, no session.
//
// The bank issued a TEST terminal and asked us to run a transaction and report
// back. This route exists so that can happen before any purchase experience is
// built. It is NOT a checkout endpoint and must never become one: the real
// parent-facing flow will authorise with `requireParent()`, price server-side,
// and live somewhere else entirely.
//
// WHY A BEARER TOKEN AND NOT A ROLE
// There is no admin session in this app (the admin panel is a separate
// deployment), and the one person who runs the live test is the owner, from a
// terminal. A shared secret in a server-only env var is the smallest thing that
// works. Consequences, all enforced below:
//   * `AZERICARD_TEST_TOKEN` has no NEXT_PUBLIC_ prefix, so it is never in a
//     client bundle, and nothing in this file is imported by client code.
//   * An UNSET token CLOSES the route. It is never "open while unconfigured".
//   * Comparison is constant-time.
//   * Every refusal — no token, wrong token, unset token — answers 404 with an
//     empty body, so a parent or a child who stumbles on the path cannot tell
//     the route from a typo. (The notifications processor answers 401; this one
//     is deliberately quieter, because that one is called by our own scheduler
//     and this one must be invisible to the app's real users.)
//   * A valid token is authentication, not a licence: the owning profile the
//     caller names is still re-verified to be a real parent before any row is
//     written.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  describeConfigProblems,
  getAzericardConfig,
  getTestToken,
} from "@/lib/payments/azericard/config";
import { buildAuthRequest, queryTransactionStatus } from "@/lib/payments/azericard/gateway";
import { createCheckoutSession, findSessionByOrder, isParentProfile } from "@/lib/payments/azericard/store";
import { formatAmount, isQueryableOrder } from "@/lib/payments/azericard/format";
import { renderRedirectForm, safeLocale } from "@/lib/payments/azericard/resultPage";
import { isUuid } from "@/lib/uuid";
import { rateLimitAllow } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Test payments stay small on purpose; the sandbox needs no more. */
const MAX_TEST_AMOUNT = 50;
const BODY_MAX_BYTES = 4096;

/** Indistinguishable from a route that does not exist. */
function notFound(): Response {
  return new Response(null, { status: 404 });
}

function json(body: Record<string, unknown>, status = 200): Response {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function constantTimeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Authorise FIRST — before reading a body, before touching the database. */
function authorized(request: Request): boolean {
  const expected = getTestToken();
  if (!expected) return false; // fail closed
  const header = request.headers.get("authorization");
  if (!header) return false;
  return constantTimeEqual(header, `Bearer ${expected}`);
}

/**
 * GET — configuration self-check, or a status query for an existing order.
 *
 * `?order=…` re-runs the TRTYPE 90 inquiry for an order we minted, which is how
 * the owner inspects a transaction after the fact (the gateway answers for 24
 * hours). Everything reported is enum-shaped or a variable NAME; no key
 * material, no response body, no card data.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return notFound();

  const url = new URL(request.url);
  const order = url.searchParams.get("order");
  if (order) {
    if (!isQueryableOrder(order)) return json({ error: "invalid_order" }, 400);
    const session = await findSessionByOrder(order);
    if (!session) return json({ error: "unknown_order" }, 404);
    const config = getAzericardConfig();
    const amount = session.amount === null ? null : formatAmount(session.amount);
    if (!config || !amount) return json({ error: "not_configured" }, 503);
    const result = await queryTransactionStatus({
      order: session.order,
      expectation: {
        order: session.order,
        terminal: config.terminal,
        amount,
        currency: session.currency,
      },
    });
    if (!result.ok) return json({ ok: false, error: result.error }, 200);
    return json({
      ok: true,
      // The parsed field NAMES and the verdict — never the raw body, which
      // §8.2 says carries the masked card number.
      format: result.parsed.format,
      recognisedFields: Object.keys(result.parsed.fields),
      unrecognisedCount: result.parsed.unrecognisedCount,
      outcome: result.reconciliation.outcome,
      approved: result.reconciliation.approved,
      mismatches: result.reconciliation.mismatches,
      action: result.reconciliation.action,
      rc: result.reconciliation.rc,
    });
  }

  const problems = describeConfigProblems();
  return json({
    configured: problems.length === 0,
    // Variable NAMES and the reason they are unusable. Never a value, never a
    // fragment of a key.
    problems,
  });
}

/**
 * POST — mint an order, build the signed field set, and hand back a full-page
 * redirect POST to the gateway.
 *
 * Body: { parent_profile_id, amount, description?, lang? }
 * `?format=html` returns the redirect form for a browser; the default is JSON
 * so the fields and the signature can be inspected from a terminal.
 */
export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return notFound();

  // A correct token is not a reason to allow unbounded minting.
  if (!rateLimitAllow("azericardtest", "owner", 30, 15 * 60_000)) {
    return json({ error: "rate_limited" }, 429);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > BODY_MAX_BYTES) {
      return json({ error: "invalid_input" }, 400);
    }
    if (raw.trim() !== "") {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    }
  } catch {
    return json({ error: "invalid_input" }, 400);
  }

  const parentProfileId =
    typeof body.parent_profile_id === "string" ? body.parent_profile_id.trim() : "";
  if (!isUuid(parentProfileId)) return json({ error: "invalid_input" }, 400);

  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_TEST_AMOUNT) {
    return json({ error: "invalid_input" }, 400);
  }
  if (!formatAmount(amount)) return json({ error: "invalid_input" }, 400);

  const description =
    typeof body.description === "string" && body.description.trim() !== ""
      ? body.description.trim().slice(0, 50)
      : "OlympIQ test";
  const lang = safeLocale(typeof body.lang === "string" ? body.lang : null);

  const config = getAzericardConfig();
  if (!config) return json({ error: "not_configured", problems: describeConfigProblems() }, 503);

  // Re-verify ownership server-side even though the token already authenticated
  // the caller: a token proves who is asking, not which rows they may name.
  if (!(await isParentProfile(parentProfileId))) {
    return json({ error: "invalid_input" }, 400);
  }

  const created = await createCheckoutSession({
    ownerParentProfileId: parentProfileId,
    // Its own kind, not a fake 'subscription'. A protocol test that pretends to
    // be a subscription would show up in every future reconciliation report as
    // a subscription nobody can explain.
    kind: "protocol_test",
    amount,
    currency: config.currency,
  });
  if (!created.ok) return json({ error: created.error }, 500);

  const built = buildAuthRequest({
    order: created.order,
    amount,
    description,
    lang,
  });
  if (!built) return json({ error: "build_failed" }, 500);

  if (new URL(request.url).searchParams.get("format") === "html") {
    return new Response(renderRedirectForm(built.action, built.fields, lang), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  return json({
    ok: true,
    checkoutSessionId: created.checkoutSessionId,
    order: created.order,
    // These are exactly the values to POST. P_SIGN is a signature over data the
    // gateway will see anyway — it is not a credential, and returning it is the
    // only way the owner can reproduce the request by hand.
    method: "POST",
    action: built.action,
    fields: built.fields,
  });
}
