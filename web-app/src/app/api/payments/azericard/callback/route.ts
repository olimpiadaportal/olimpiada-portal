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
//   e. records the result idempotently — and GRANTS NOTHING.
//
// (e) is not a simplification. docs/STORE_PAYMENTS_COMPLIANCE.md §4.1 requires
// a provider-agnostic `entitlements` table as the single source of truth for
// access, with ABB as one producer of rows. That table does not exist yet, and
// wiring money to access before it does is the exact trap that document names.
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
} from "@/lib/payments/azericard/store";
import { formatAmount } from "@/lib/payments/azericard/format";
import { renderResultPage, safeLocale, type ResultKind } from "@/lib/payments/azericard/resultPage";
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
  const expectedAmount = session.amount === null ? null : formatAmount(session.amount);
  if (!expectedAmount) {
    console.error("[azericard] checkout session has no usable amount");
    return page("pending", locale, 500);
  }

  // ---- 4. Reference reuse, checked BEFORE we spend a status query ----------
  if (await hasReferenceConflict(shape.order, shape.rrn, shape.intRef)) {
    console.warn("[azericard] callback references already belong to a different order");
    return page("failed", locale, 409);
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
    return page("pending", locale, 200);
  }

  // ---- 6. Record. Grant nothing. ------------------------------------------
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
    return page(recorded.error === "reference_reused" ? "failed" : "pending", locale, 200);
  }

  // A summary line the owner can read during the live test. Deliberately made
  // of enum values only — no order id, no references, no amount, no body.
  console.info(
    `[azericard] callback processed outcome=${recorded.outcome} replay=${recorded.replay} ` +
      `mismatches=${status.reconciliation.mismatches.join("|") || "none"} ` +
      `format=${status.parsed.format} unmapped=${status.parsed.unrecognisedCount}`,
  );

  const kind: ResultKind =
    recorded.outcome === "approved"
      ? "ok"
      : recorded.outcome === "declined" || recorded.outcome === "failed"
        ? "failed"
        : "pending";
  return page(kind, locale, 200);
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
