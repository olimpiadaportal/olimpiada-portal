// GOOGLE PLAY RECONCILIATION SWEEP — revokes refunded and charged-back purchases
// whose notification never arrived. The core is _lib/reconcileCore.ts.
//
// AN HTTP ROUTE, NOT A pg_cron JOB, for the Apple reason: asking Google needs a
// token signed with the service-account key, which lives in this app's
// environment and never in the database.
//
// SECURED EXACTLY AS ../../apple/reconcile/route.ts (and azericard/reconcile):
// POST with `x-reconcile-key: $PAYMENTS_RECONCILE_KEY` (an external cron), or
// GET with `Authorization: Bearer $CRON_SECRET` (Vercel Cron). Both compared in
// constant time, both CLOSED while their secret is unset, and nothing in the
// request can steer the sweep.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { reconcileGoogleVoided, type GoogleReconcileSummary } from "../_lib/reconcileCore";
import { buildGoogleReconcileDeps } from "../_lib/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECONCILE_KEY = process.env.PAYMENTS_RECONCILE_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

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

export async function POST(request: Request): Promise<Response> {
  if (!keyOk(request.headers.get("x-reconcile-key"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return sweep();
}

export async function GET(request: Request): Promise<Response> {
  if (!cronOk(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return sweep();
}

const NOTHING_DONE: GoogleReconcileSummary = {
  pages: 0,
  voided: 0,
  matched: 0,
  revoked: 0,
  unresolved: 0,
  failed: false,
};

async function sweep(): Promise<Response> {
  const deps = buildGoogleReconcileDeps();
  if (!deps) {
    console.error("[google] reconciliation skipped: not configured");
    return NextResponse.json(NOTHING_DONE, { headers: { "Cache-Control": "no-store" } });
  }
  const summary = await reconcileGoogleVoided(deps);
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
