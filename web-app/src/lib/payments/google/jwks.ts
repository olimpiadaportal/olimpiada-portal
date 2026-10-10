// Google's OIDC signing keys, fetched and cached — SERVER ONLY.
//
// The Pub/Sub push that delivers a Play real-time developer notification carries
// a Google-signed OIDC token. Its signature is checked against the keys Google
// publishes at the URL below — fetched over a connection WE open to a host WE
// name, never taken from the request.
//
// CACHED for as long as Google's Cache-Control says (bounded to a day), because
// the endpoint that needs them is public and must not be a lever for making this
// server fetch on demand. An UNKNOWN kid triggers at most one refresh per five
// minutes — Google rotates keys, and a new one must be picked up, but an
// attacker inventing kids must not be able to turn every request into a fetch.
import "server-only";
import type { KeyObject } from "node:crypto";
import { publicKeyFromJwk } from "./jwt";

export const GOOGLE_OIDC_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_TTL_MS = 60 * 60_000;
const MAX_TTL_MS = 24 * 60 * 60_000;
const MIN_REFRESH_INTERVAL_MS = 5 * 60_000;
const STALE_RETRY_MS = 30_000;

let keys: Map<string, KeyObject> | null = null;
let expiresAtMs = 0;
let lastFetchMs = 0;
let inFlight: Promise<void> | null = null;

function ttlFrom(cacheControl: string | null): number {
  const match = /max-age=(\d+)/i.exec(cacheControl ?? "");
  if (!match) return DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(60_000, Number(match[1]) * 1000));
}

async function refresh(): Promise<void> {
  lastFetchMs = Date.now();
  let response: Response;
  try {
    response = await fetch(GOOGLE_OIDC_JWKS_URL, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    console.error("[google] OIDC key set unreachable");
    return;
  }
  if (!response.ok) {
    console.error(`[google] OIDC key set fetch failed: status=${response.status}`);
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse((await response.text()).slice(0, 256 * 1024));
  } catch {
    console.error("[google] OIDC key set was not JSON");
    return;
  }
  const list = body && typeof body === "object" ? (body as { keys?: unknown }).keys : undefined;
  if (!Array.isArray(list)) return;
  const next = new Map<string, KeyObject>();
  for (const jwk of list) {
    const kid = jwk && typeof jwk === "object" ? (jwk as { kid?: unknown }).kid : undefined;
    if (typeof kid !== "string" || kid === "") continue;
    const key = publicKeyFromJwk(jwk);
    if (key) next.set(kid, key);
  }
  if (next.size === 0) return;
  keys = next;
  expiresAtMs = Date.now() + ttlFrom(response.headers.get("cache-control"));
}

function refreshOnce(): Promise<void> {
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Resolve an OIDC key id to Google's public key, or null. */
export async function resolveGoogleOidcKey(kid: string): Promise<KeyObject | null> {
  const now = Date.now();
  const sinceLast = now - lastFetchMs;
  const stale = !keys || now >= expiresAtMs;
  const unknownKid = keys !== null && !keys.has(kid);
  // A failed fetch is retried after STALE_RETRY_MS, not on every request: an
  // outage at Google must not turn this endpoint into a fetch amplifier.
  if (
    (stale && (lastFetchMs === 0 || sinceLast >= STALE_RETRY_MS)) ||
    (unknownKid && sinceLast >= MIN_REFRESH_INTERVAL_MS)
  ) {
    await refreshOnce();
  }
  // Keys past their TTL are still used when a refresh failed: they are
  // Google's keys either way, and refusing every push during a JWKS outage
  // only delays notifications Pub/Sub will redeliver anyway.
  return keys?.get(kid) ?? null;
}

/** Test-only seam. */
export function resetGoogleOidcKeysForTests(): void {
  keys = null;
  expiresAtMs = 0;
  lastFetchMs = 0;
  inFlight = null;
}
