// The Android Publisher access token — SERVER ONLY.
//
// One RS256 assertion, exchanged at Google's token endpoint for an access token
// that lives an hour. CACHED until a minute before it expires: minting one per
// request would put a token-endpoint round trip in front of every purchase
// verification, and Google rate-limits that endpoint.
//
// WHAT IS CACHED IS THE ACCESS TOKEN, NEVER THE KEY. The private key is read,
// handed to the signer and dropped on every mint (see config.ts). The access
// token is itself a credential for an hour, so it lives only in this module's
// closure, is never logged, never returned to a client and never written down.
//
// Concurrent callers share ONE in-flight mint rather than racing to mint five.
import "server-only";
import { getGooglePlayConfig, getServiceAccountPrivateKeyPem } from "./config";
import { ANDROID_PUBLISHER_SCOPE, GOOGLE_OAUTH_TOKEN_URL, signServiceAccountJwt } from "./jwt";

const REQUEST_TIMEOUT_MS = 15_000;
/** Refresh this long before Google's stated expiry, so no call races it. */
const REFRESH_MARGIN_MS = 60_000;

let cached: { token: string; expiresAtMs: number } | null = null;
let inFlight: Promise<string | null> | null = null;

async function mint(): Promise<string | null> {
  const config = getGooglePlayConfig();
  const pem = getServiceAccountPrivateKeyPem();
  if (!config || !pem) return null;

  let assertion: string;
  try {
    assertion = signServiceAccountJwt(pem, {
      clientEmail: config.clientEmail,
      privateKeyId: config.privateKeyId,
      scope: ANDROID_PUBLISHER_SCOPE,
    });
  } catch {
    // Content-free by construction; dropped anyway.
    console.error("[google] could not sign the service-account JWT");
    return null;
  }

  let response: Response;
  try {
    response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    console.error("[google] token endpoint unreachable");
    return null;
  }

  let body: unknown = null;
  try {
    body = JSON.parse((await response.text()).slice(0, 64 * 1024));
  } catch {
    body = null;
  }
  if (!response.ok || !body || typeof body !== "object") {
    // Status only. Google's error_description can name the service account.
    console.error(`[google] token exchange refused: status=${response.status}`);
    return null;
  }
  const record = body as Record<string, unknown>;
  const accessToken = typeof record.access_token === "string" ? record.access_token : "";
  const expiresIn =
    typeof record.expires_in === "number" && Number.isFinite(record.expires_in)
      ? record.expires_in
      : 0;
  if (accessToken === "" || expiresIn <= 0) {
    console.error("[google] token exchange returned no usable token");
    return null;
  }
  cached = { token: accessToken, expiresAtMs: Date.now() + expiresIn * 1000 };
  return accessToken;
}

/**
 * A valid Android Publisher access token, or null when the platform is not
 * configured or Google would not issue one. Null is a refusal to verify, and
 * the callers turn it into "not verified, try again" — never into a grant.
 */
export async function getAndroidPublisherAccessToken(): Promise<string | null> {
  if (cached && cached.expiresAtMs - REFRESH_MARGIN_MS > Date.now()) return cached.token;
  if (!inFlight) {
    inFlight = mint().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/**
 * Forget the cached access token. Called when Google answers 401 to a token we
 * still believed valid (a revoked key, a rotated service account), so the next
 * call mints afresh instead of failing for the rest of the hour.
 */
export function invalidateAndroidPublisherAccessToken(): void {
  cached = null;
}
