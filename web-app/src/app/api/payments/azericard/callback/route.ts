// AzeriCard / ABB payment CALLBACK (BACKREF target).
//
// PUBLIC ON PURPOSE — the gateway posts here, and it carries no credential of
// ours. That is the whole security problem this file exists to contain, so read
// the next paragraph before changing a line of it.
//
// THE CALLBACK IS UNTRUSTED CLIENT DATA. Worse than the usual case: the
// gateway's signature covers AMOUNT, TERMINAL, APPROVAL, RRN and INT_REF, and
// **not ORDER**. A valid signature therefore proves that *some* transaction
// happened on our terminal for that amount; it proves nothing about WHICH of
// our orders it belongs to. Anyone who ever obtains one valid tuple — a log
// line, a proxy, a browser history entry — can post it back naming a different
// order, and the signature will verify.
//
// Consequently this route NEVER decides anything from the callback. It:
//   a. verifies P_SIGN over the callback field order;
//   b. looks OUR order up, and stops dead on an unknown one;
//   c. refuses a tuple whose RRN / INT_REF already belongs to another order;
//   d. asks the gateway itself (TRTYPE 90) about OUR order and believes only
//      that answer;
//   e. records the result idempotently;
//   f. and ONLY THEN redeems the checkout's INTENT into the plan it was opened
//      for.
//
// (f) IS THE GRANT, AND IT BELONGS HERE (migration 125). Until then the plan was
// applied by the parent's own click and the charge was opened afterwards by a
// helper that could not fail it — so closing the tab before paying kept the
// access. Inverting that means the only place a plan can be created is behind a
// payment this route has already verified twice over.
//
// EVERY HARD GUARANTEE OF (f) IS IN SQL, NOT HERE. `checkout_redeem_plan` locks
// the session row, refuses anything that is not `paid`, re-prices the frozen
// basket against the amount the gateway confirmed, applies inside the same
// transaction that stamps `redeemed_at`, and records anything it cannot deliver
// safely as `needs_review` with a reason. A gateway retry, a double callback or
// a refresh therefore finds a decided row. This route only calls it and maps the
// answer onto what the parent is shown.
//
// It still writes no entitlement row: redemption goes through the subscription
// RPCs and migration 124's producer triggers mirror the result, exactly as
// docs/STORE_PAYMENTS_COMPLIANCE.md §4.1 requires (ABB is ONE producer, never
// the source of truth for access).
//
// It must also be safe to hit: idempotent under gateway retries, bounded in the
// work any single request can cause, rate limited, and generic in every
// response. No internal detail, no Postgres text, no gateway message, and no
// echo of any submitted field reaches the response body.
import { createHash } from "node:crypto";
import { getAzericardConfig } from "@/lib/payments/azericard/config";
import {
  normalizeCallbackFields,
  validateCallbackShape,
  CALLBACK_MAX_BODY_BYTES,
} from "@/lib/payments/azericard/callback";
import {
  queryTransactionStatus,
  verifyCallbackSignature,
} from "@/lib/payments/azericard/gateway";
import {
  findSessionByOrder,
  hasReferenceConflict,
  recordOutcome,
  PLAN_CHECKOUT_KIND,
} from "@/lib/payments/azericard/store";
import { formatAmount } from "@/lib/payments/azericard/format";
import {
  parentResultUrl,
  renderResultPage,
  safeLocale,
  type ResultKind,
} from "@/lib/payments/azericard/resultPage";
import { redeemPlanCheckout } from "@/lib/payments/checkoutIntent";
import { rateLimitAllow } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A bank redirect is never a GET we should answer with a result. */
const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

function page(kind: ResultKind, locale: ReturnType<typeof safeLocale>, status = 200): Response {
  return new Response(renderResultPage(kind, locale), { status, headers: HTML_HEADERS });
}

/**
 * Send a PARENT back into the product instead of onto the bare page.
 *
 * 303, so the browser turns this cross-site POST into a same-origin GET: that
 * navigation carries the SameSite=Lax session cookie a cross-site POST cannot,
 * which is what lets the parent land signed in. The Location is built by
 * parentResultUrl() from the reconciled ResultKind alone — a relative path with
 * one enum in it, so nothing from this request can steer it and there is no way
 * to express another origin.
 *
 * The body is empty on purpose: a redirect that also renders is two answers to
 * one question, and the second one would be the reflected page this route
 * exists not to produce.
 */
function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // The locale rides on BACKREF (we put it there when building the request):
  // this is a CROSS-SITE POST, so our SameSite `locale` cookie is not sent.
  const locale = safeLocale(url.searchParams.get("lang"));

  // ---- 0. Bound the work before doing any of it --------------------------
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const ip =
    xff.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "local";
  const ipHash = createHash("sha256").update(ip).digest("hex");
  if (!rateLimitAllow("azericardcb", ipHash, 60, 15 * 60_000)) {
    return page("pending", locale, 429);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return page("failed", locale, 400);
  }
  if (Buffer.byteLength(raw, "utf8") > CALLBACK_MAX_BODY_BYTES) {
    return page("failed", locale, 413);
  }

  const config = getAzericardConfig();
  if (!config) {
    // Never say WHY. A misconfigured payment endpoint that explains itself is a
    // reconnaissance gift.
    console.error("[azericard] callback received while not configured");
    return page("pending", locale, 503);
  }

  // ---- 1. Shape -----------------------------------------------------------
  const fields = normalizeCallbackFields(parseBody(raw, request.headers.get("content-type")));
  const shaped = validateCallbackShape(fields, config.terminal);
  if (!shaped.ok) {
    console.warn(`[azericard] callback rejected: ${shaped.reason}`);
    return page("failed", locale, 400);
  }
  const shape = shaped.shape;

  // Per-order throttle on top of the per-IP one: one order cannot be used to
  // drive an unbounded number of status queries from many addresses.
  if (!rateLimitAllow("azericardcborder", shape.order, 10, 15 * 60_000)) {
    return page("pending", locale, 429);
  }

  // ---- 2. Signature, before any database or network work ------------------
  if (!verifyCallbackSignature(shape)) {
    console.warn("[azericard] callback signature verification failed");
    return page("failed", locale, 400);
  }

  // ---- 3. Our order, or nothing -------------------------------------------
  const session = await findSessionByOrder(shape.order);
  if (!session) {
    console.warn("[azericard] callback named an order we never minted");
    return page("failed", locale, 404);
  }

  // WHO CAME BACK. A plan checkout belongs to a signed-in parent, who needs a
  // route back into the product; the owner's protocol test belongs to nobody and
  // keeps the bare, chrome-free page. The decision comes from OUR OWN row, never
  // from a request field — the callback cannot ask to be redirected anywhere.
  //
  // Every answer from here on goes through `respond`, so a parent lands on the
  // result screen whichever way the transaction settles, including the ones that
  // settle badly.
  const parentFlow = session.kind === PLAN_CHECKOUT_KIND;
  const respond = (result: ResultKind, status = 200): Response =>
    parentFlow ? seeOther(parentResultUrl(result)) : page(result, locale, status);

  const expectedAmount = session.amount === null ? null : formatAmount(session.amount);
  if (!expectedAmount) {
    console.error("[azericard] checkout session has no usable amount");
    return respond("pending", 500);
  }

  // ---- 4. Reference reuse, checked BEFORE we spend a status query ----------
  if (await hasReferenceConflict(shape.order, shape.rrn, shape.intRef)) {
    console.warn("[azericard] callback references already belong to a different order");
    return respond("failed", 409);
  }

  // ---- 5. Ask the gateway about OUR order, and believe only that -----------
  const status = await queryTransactionStatus({
    order: session.order,
    expectation: {
      order: session.order,
      terminal: config.terminal,
      amount: expectedAmount,
      currency: session.currency,
      // The SIGNED half of the callback. The gateway's callback MAC covers RRN
      // and INT_REF but not ORDER, so these are the only transaction identity
      // in this request an attacker cannot choose — and the status answer has
      // to agree with them.
      rrn: shape.rrn,
      intRef: shape.intRef,
    },
  });

  if (!status.ok) {
    // We could not establish what happened. That is explicitly NOT a licence to
    // fall back on the callback's own ACTION/RC — the whole design exists
    // because those are not trustworthy on their own. Leave the payment pending
    // and let reconciliation (or a retry from the gateway) settle it.
    console.error(`[azericard] status query failed: ${status.error}`);
    return respond("pending");
  }

  // ---- 6. Record the money. -----------------------------------------------
  const recorded = await recordOutcome({
    session,
    shape,
    reconciliation: status.reconciliation,
    statusMeta: {
      queried: true,
      format: status.parsed.format,
      unrecognisedCount: status.parsed.unrecognisedCount,
    },
  });

  if (!recorded.ok) {
    console.error(`[azericard] recording the outcome failed: ${recorded.error}`);
    return respond(recorded.error === "reference_reused" ? "failed" : "pending");
  }

  // A summary line the owner can read during the live test. Deliberately made
  // of enum values only — no order id, no references, no amount, no body.
  console.info(
    `[azericard] callback processed outcome=${recorded.outcome} replay=${recorded.replay} ` +
      `mismatches=${status.reconciliation.mismatches.join("|") || "none"} ` +
      `format=${status.parsed.format} unmapped=${status.parsed.unrecognisedCount}`,
  );

  if (recorded.outcome !== "approved") {
    return respond(
      recorded.outcome === "declined" || recorded.outcome === "failed"
        ? "failed"
        : "pending",
    );
  }

  // ---- 7. The money is real. Now deliver what it bought. ------------------
  //
  // Only for a PLAN checkout: the owner's protocol test has no intent, and
  // `checkout_redeem_plan` answers 'no_intent' for it rather than improvising
  // one. Everything else about safety lives in that function.
  if (!parentFlow) return respond("ok");

  const redeemed = await redeemPlanCheckout(session.order);

  // WHAT THE PARENT IS TOLD. 'ok' means the plan is live — and it is only said
  // when the redemption actually applied. A payment we took but could not turn
  // into a plan is `pending` on the screen, because from the payer's side that
  // is exactly what it is: taken, not finished, and now in front of a human
  // (013 check 118). Claiming success there would be the one lie a parent is
  // guaranteed to discover.
  const kind: ResultKind = redeemed === "applied" ? "ok" : "pending";
  return respond(kind);
}

/**
 * The gateway posts `application/x-www-form-urlencoded`. JSON is accepted too
 * so a future change on their side does not silently break the endpoint, and
 * both paths are size-capped by the caller. Anything unparseable yields no
 * entries, which the shape validator then rejects.
 */
function parseBody(raw: string, contentType: string | null): [string, string][] {
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.entries(parsed as Record<string, unknown>)
          .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
          .map(([k, v]) => [k, String(v)] as [string, string]);
      }
    } catch {
      return [];
    }
    return [];
  }
  try {
    return Array.from(new URLSearchParams(raw).entries());
  } catch {
    return [];
  }
}

/**
 * A GET here is a person or a crawler, never the gateway. Answer with the same
 * bare page and nothing else — no lookup, no query parameters honoured beyond
 * the language, and above all no state change.
 */
export async function GET(request: Request): Promise<Response> {
  const locale = safeLocale(new URL(request.url).searchParams.get("lang"));
  return page("pending", locale, 200);
}
