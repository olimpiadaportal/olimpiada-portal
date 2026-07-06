import "server-only";

// Lightweight in-memory fixed-window rate limiter — ported from
// web-app/src/lib/rateLimit.ts (audit finding M4: the admin login form had no
// throttle). Used to slow password-spray / credential-stuffing against the
// admin panel's signIn action. Supabase GoTrue applies additional per-IP
// limits on the token endpoint underneath.
//
// KNOWN LIMITATION (documented, accepted for now): state is per server
// instance. In a multi-instance/serverless deployment each instance keeps its
// own counters, so the effective limit is (limit × instances) and cold starts
// reset windows. That still blunts bulk attacks; a shared store (DB table or
// Redis — Redis stays optional per project rules) is the production follow-up
// if stronger guarantees are ever needed.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
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
 * and non-sensitive (e.g. an IP + normalized email, never a password).
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
