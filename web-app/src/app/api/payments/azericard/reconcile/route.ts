// AzeriCard RECONCILIATION SWEEP — the scheduled entrypoint for a lost callback.
//
// A payment authorised at the bank whose BACKREF POST never reaches us leaves
// the family charged with no record, no plan and no alarm. The gateway answers
// a TRTYPE=90 status query about an order for 24 HOURS; after that the money is
// only recoverable through a settlement report and a support ticket. So this
// asks, on a schedule, about every pending intent still inside that window and
// then redeems or leaves alone exactly as the callback would — through the same
// `recordOutcome` and the same `checkout_redeem_plan`, never a second copy of
// that logic. All of it lives in lib/payments/reconcileCore.
//
// WHY IT IS AN HTTP ROUTE AND NOT A pg_cron JOB. Asking the gateway requires a
// MAC signed with the merchant private key. That key lives in this app's
// environment and must never enter the database, and this deployment has no
// pg_net — so a SQL job cannot make the call even in principle. What SQL CAN do
// without a network is redeem sessions the ledger already records as paid, and
// that is scheduled as `olympiq_checkout_redeem_sweep` (016) as the floor under
// this route. Both are idempotent and either may run without the other.
//
// TWO SCHEDULERS, ONE CORE — the shape lib/notifications' processor established:
// POST with `x-reconcile-key` (an external cron), GET with
// `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron). Both compare in constant
// time, both are CLOSED when their secret is unset, and neither reads anything
// else from the request. There is no user session here and no parameter a caller
// can steer the sweep with — not an order, not an amount, not a batch size.
//
// IT GRANTS NOTHING ON ITS OWN AUTHORITY. Every decision comes from the
// gateway's answer to a query this server initiated; a failed or mismatched
// answer leaves the session pending for the next pass, and anything that cannot
// be delivered safely is recorded by `checkout_redeem_plan` as `needs_review`
// with a reason. 013 check 118 is the alarm for both.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { reconcilePendingCheckouts } from "@/lib/payments/reconcileCore";

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

async function sweep(): Promise<Response> {
  const summary = await reconcilePendingCheckouts();
  // Counts only. A scheduler reads this to know the job ran; an order id or an
  // amount in a response body is a detail that has no business leaving the
  // server, and this endpoint answers on a schedule forever.
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
