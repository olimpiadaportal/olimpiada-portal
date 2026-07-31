import "server-only";

// Lightweight in-memory fixed-window rate limiter (R7 security hardening).
//
// Used to throttle the parent auth surface (login / register / password-reset)
// so account-enumeration and password-spray cost real time. Child login has
// its own DB-backed lockout (is_child_login_locked); Supabase GoTrue applies
// additional per-IP limits on the token endpoint underneath.
//
// KNOWN LIMITATION (documented, accepted for now): state is per server
// instance. In a multi-instance/serverless deployment each instance keeps its
// own counters, so the effective limit is (limit × instances) and cold starts
// reset windows. That still blunts bulk harvesting; a shared store (DB table
// or Redis — Redis stays optional per project rules) is the production
// follow-up if stronger guarantees are ever needed.
//
// WHY THE BUCKET MAP HANGS OFF globalThis: Next emits this module TWICE in a
// production build — once into the route-handler bundle (/api/**) and once
// into the RSC/server-action layer. Two module instances = two `new Map()` =
// two independent budgets, so a caller could take the full limit on a server
// action and the full limit again on the matching BFF route (verified in
// .next/server: distinct webpack module ids for the same source file). Every
// call site that documents ONE shared web+mobile budget depends on this line;
// do not turn it back into a module-local Map.

type Bucket = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __olympiqRateBuckets: Map<string, Bucket> | undefined;
}

const buckets: Map<string, Bucket> = (globalThis.__olympiqRateBuckets ??= new Map<
  string,
  Bucket
>());
const MAX_BUCKETS = 10_000; // hard memory cap; oldest evicted beyond this

function sweep(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
  // Still over cap (all live)? Drop oldest entries.
  if (buckets.size >= MAX_BUCKETS) {
    for (const k of buckets.keys()) {
      buckets.delete(k);
      if (buckets.size < MAX_BUCKETS / 2) break;
    }
  }
}

/**
 * Consume one attempt from the `${scope}:${key}` bucket.
 * Returns true when the attempt is ALLOWED, false when the caller should
 * reject with a "too many attempts" response. Keys should be low-cardinality
 * and non-sensitive (e.g. a normalized email, never a password).
 */
export function rateLimitAllow(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  sweep(now);
  const id = `${scope}:${key.toLowerCase()}`;
  const b = buckets.get(id);
  if (!b || b.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
