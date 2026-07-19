// Mobile BFF — shared HTTP envelope helpers (Stage M2).
//
// Every /api/mobile/v1/* endpoint speaks the SAME house envelope the M1 auth
// endpoints established: POST-only JSON, `Cache-Control: no-store`, success =
// {ok:true, data}, failure = {error:"<i18nKey>", retryable:boolean} — the app
// translates the key locally; raw server text never renders. Body parsing is
// defensive: size-capped, JSON.parse never throws out; an oversized or
// malformed body falls through as empty fields and is rejected by the same
// validation path a real bad submission hits.
import "server-only";
import { NextResponse } from "next/server";

/** Default JSON body cap — parent-surface payloads are small. */
export const JSON_BODY_MAX_BYTES = 4096;

export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** 200 {ok:true, data} */
export function okResponse(data: Record<string, unknown>): Response {
  return jsonResponse({ ok: true, data }, 200);
}

/** {error:key, retryable} with the given status. */
export function errorResponse(
  key: string,
  status: number,
  retryable = false,
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse({ error: key, retryable, ...(extra ?? {}) }, status);
}

/**
 * 401 — unauthenticated or the wrong role for the endpoint (a resolveBearer*
 * helper returned null). ONE generic key app-wide, no role disambiguation.
 */
export function unauthorizedResponse(): Response {
  return errorResponse("parent.err.invalid", 401, false);
}

/**
 * HTTP status for a core error KEY: ownership failures → 403, payment-mode /
 * free-access gates → 409 (conflict with current server state), everything
 * else (validation + generic business failures) → 400. The app switches on
 * the KEY, not the status — this mapping is for correct HTTP semantics only.
 */
export function statusForErrorKey(key: string): number {
  if (key.endsWith(".notYourChild")) return 403;
  if (key.startsWith("gate.")) return 409;
  // Sale window closed between listing and purchase — a conflict with current
  // server state, like the payment-mode gates.
  if (key === "poly.err.notOnSale") return 409;
  return 400;
}

/**
 * Defensive JSON body read (M1 pattern): cap size, tolerate malformed JSON,
 * only accept a plain object. Never throws.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number = JSON_BODY_MAX_BYTES,
): Promise<Record<string, unknown>> {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > maxBytes) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through with empty body
  }
  return {};
}

/** String field or "" (never trusts types). */
export function bodyStr(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v : "";
}

/**
 * String-array field: non-arrays → [], non-string members dropped, hard cap
 * on length BEFORE any further processing (the cores re-validate UUID shape
 * and their own caps exactly like the web actions).
 */
export function bodyStrArray(
  body: Record<string, unknown>,
  key: string,
  maxItems = 50,
): string[] {
  const v = body[key];
  if (!Array.isArray(v)) return [];
  return v.slice(0, maxItems).filter((x): x is string => typeof x === "string");
}
