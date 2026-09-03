// APPLE RECONCILIATION SWEEP — the scheduled entrypoint for a lost notification.
//
// Apple can drop an App Store Server Notification. When it does, a family that
// paid has no access and nothing in the platform knows: the money is Apple's
// problem to have taken and ours to have not delivered against. This asks, on a
// schedule, about every purchase whose transaction we know of and whose intent
// was never consumed, and then grants or revokes exactly as the notification
// route would — through the same re-query, the same `toAppleGrant`, the same
// `requireProductionGrant` and the same shared writer, never a second copy of
// that logic. All of it lives in `_lib/reconcileCore.ts`.
//
// WHY IT IS AN HTTP ROUTE AND NOT A pg_cron JOB. Asking Apple requires a bearer
// token signed with the App Store Connect private key. That key lives in this
// app's environment and must never enter the database, so the SIGNING has to
// happen here. This is the same reason `azericard/reconcile` is a route.
//
// IT IS CLOSED WITHOUT ITS SECRET. `PAYMENTS_RECONCILE_KEY` unset means every
// POST is 401 — not "open because unconfigured", which is the failure mode this
// shape exists to make impossible. The key is SHARED with the AzeriCard sweep on
// purpose: it authenticates the same operator to the same class of endpoint, and
// a second secret is a second thing to rotate, a second thing to leave unset,
// and no additional protection.
//
// TWO SCHEDULERS, ONE CORE — the shape `azericard/reconcile` established, copied
// verbatim so the two cannot drift: POST with `x-reconcile-key` (an external
// cron, or pg_cron through pg_net), GET with `Authorization: Bearer
// ${CRON_SECRET}` (Vercel Cron). Both compare in constant time, both are CLOSED
// when their secret is unset, and neither reads anything else from the request.
// There is no user session here and no parameter a caller can steer the sweep
// with — not an intent, not a transaction id, not a batch size.
//
// IT GRANTS NOTHING ON ITS OWN AUTHORITY. Every decision comes from Apple's
// answer to a query this server initiated; a failed or unverifiable answer
// leaves the intent unconsumed for the next pass.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { reconcileAppleIntents, type AppleReconcileSummary } from "../_lib/reconcileCore";
import { buildReconcileDeps } from "../_lib/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECONCILE_KEY = process.env.PAYMENTS_RECONCILE_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

/**
 * Constant-time compare.
 *
 * The length check is first because `timingSafeEqual` THROWS on unequal
 * lengths — and comparing lengths leaks only the length, which is not the
 * secret.
 */
function constantTimeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** An unset secret means CLOSED, never open. */
function keyOk(provided: string | null): boolean {
  if (!RECONCILE_KEY || !provided) return false;
  return constantTimeEqual(provided, RECONCILE_KEY);
}

function cronOk(authorization: string | null): boolean {
  if (!CRON_SECRET || !authorization) return false;
  return constantTimeEqual(authorization, `Bearer ${CRON_SECRET}`);
}

/** External cron / shared-secret entrypoint. */
export async function POST(request: Request): Promise<Response> {
  if (!keyOk(request.headers.get("x-reconcile-key"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return sweep();
}

/** Vercel Cron entrypoint — the same core, so the two can never drift. */
export async function GET(request: Request): Promise<Response> {
  if (!cronOk(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return sweep();
}

const NOTHING_DONE: AppleReconcileSummary = {
  candidates: 0,
  queried: 0,
  granted: 0,
  revoked: 0,
  unresolved: 0,
  unattributable: 0,
};

async function sweep(): Promise<Response> {
  const deps = buildReconcileDeps();
  if (!deps) {
    // Not configured is an operator problem, not a payer's. Ask Apple nothing,
    // and do not say which variable is missing — `describeConfigProblems()`
    // exists for that, server-side.
    console.error("[apple] reconciliation skipped: not configured");
    return NextResponse.json(NOTHING_DONE, { headers: { "Cache-Control": "no-store" } });
  }
  const summary = await reconcileAppleIntents(deps);
  // Counts only. A scheduler reads this to know the job ran; a transaction id or
  // an intent id in a response body is a detail that has no business leaving the
  // server, and this endpoint answers on a schedule forever.
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
