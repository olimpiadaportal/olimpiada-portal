// Google Play Billing configuration — SERVER ONLY.
//
// The twin of `lib/payments/apple/config.ts`, with the same rules:
//
//   * `server-only` makes the BUILD FAIL if this module is ever pulled into a
//     client bundle. The service-account key signs requests that can read and
//     consume every purchase this app has ever sold.
//   * NOTHING HERE IS EVER LOGGED OR RETURNED. `describeGooglePlayConfigProblems`
//     reports only the NAME of a variable that is missing or malformed — never
//     its value, never a fragment of the key, never the client email.
//   * The private key leaves this module through exactly one getter, whose one
//     caller (`oauth.ts`) passes it straight into `node:crypto` and drops it.
//
// THE VARIABLES
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   the JSON key of a Google Cloud service
//                                      account that Play Console has granted
//                                      access to this app. Raw JSON or base64 of
//                                      it — hosting panels mangle multi-line
//                                      secrets, and base64 survives them all.
//   GOOGLE_PLAY_PACKAGE_NAME           optional; defaults to ai.olympiq.app,
//                                      which is permanent (CLAUDE.md, App
//                                      identity).
//   GOOGLE_PLAY_RTDN_AUDIENCE          the `aud` the Pub/Sub push subscription
//                                      puts in its OIDC token. The RTDN endpoint
//                                      is CLOSED while it is unset.
//   GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT   the service-account email the push
//                                      subscription authenticates as. Also
//                                      required; also closed while unset.
//   GOOGLE_PLAY_TEST_GRANTS            posture switch, not a secret: `off`
//                                      stops license-tester (test) purchases
//                                      from granting. Default on, namespaced.
//
// THE TOKEN ENDPOINT IS PINNED. A service-account JSON carries its own
// `token_uri`; it is deliberately IGNORED. The signed assertion is a bearer
// credential for an hour, and the only host it may ever be sent to is Google's.
import "server-only";
import { createPrivateKey } from "node:crypto";

/** Permanent: Play Console never lets a package name change once published. */
export const DEFAULT_PACKAGE_NAME = "ai.olympiq.app";

export type GooglePlayConfig = {
  readonly packageName: string;
  /** The service account's email — the JWT `iss`. Not a secret, never logged. */
  readonly clientEmail: string;
  /** The key id — the JWT header `kid`. Optional in Google's own libraries. */
  readonly privateKeyId: string | null;
};

export type ParsedServiceAccount = {
  readonly clientEmail: string;
  readonly privateKeyId: string | null;
  readonly privateKeyPem: string;
};

export type RtdnAuthConfig = {
  readonly audience: string;
  readonly serviceAccountEmail: string;
};

/** Read a server env var, trimmed; empty string becomes null. */
function env(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v === "" ? null : v;
}

/** Android application ids: dot-separated Java identifiers. */
const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
/** A service-account email. Bounded, and shaped like the ones Google mints. */
const SERVICE_EMAIL_RE = /^[A-Za-z0-9._%+-]{1,100}@[A-Za-z0-9.-]{1,150}\.[A-Za-z]{2,}$/;
const KEY_ID_RE = /^[A-Za-z0-9]{1,100}$/;
/** The JSON key file is ~2.3KB; anything far larger is not one. */
const SERVICE_ACCOUNT_MAX_CHARS = 20_000;

/**
 * Parse the service-account key, from raw JSON or base64 of it.
 *
 * Returns null — never a partial object — for anything that is not a usable
 * RSA service-account key. Pure apart from parsing the key with node:crypto;
 * exported for the tests.
 */
export function parseServiceAccountJson(value: string): ParsedServiceAccount | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > SERVICE_ACCOUNT_MAX_CHARS) return null;

  let text = trimmed;
  if (!trimmed.startsWith("{")) {
    try {
      text = Buffer.from(trimmed, "base64").toString("utf8").trim();
    } catch {
      return null;
    }
    if (!text.startsWith("{")) return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const json = parsed as Record<string, unknown>;

  if (json.type !== "service_account") return null;
  const clientEmail = typeof json.client_email === "string" ? json.client_email.trim() : "";
  if (!SERVICE_EMAIL_RE.test(clientEmail)) return null;
  const rawKey = typeof json.private_key === "string" ? json.private_key : "";
  if (!rawKey.includes("-----BEGIN")) return null;
  const privateKeyPem = `${rawKey.split("\r\n").join("\n").split("\\n").join("\n").trim()}\n`;
  try {
    const key = createPrivateKey(privateKeyPem);
    if (key.asymmetricKeyType !== "rsa") return null;
  } catch {
    // The OpenSSL message can quote key bytes; it is dropped.
    return null;
  }
  const kid = typeof json.private_key_id === "string" ? json.private_key_id.trim() : "";
  return {
    clientEmail,
    privateKeyId: KEY_ID_RE.test(kid) ? kid : null,
    privateKeyPem,
  };
}

// Memoized for the reason apple/config.ts gives: parsing a private key per
// request on a public endpoint is a CPU lever. Key material is NOT cached.
let cachedProblems: string[] | null = null;
let cachedConfig: { value: GooglePlayConfig | null } | null = null;

/**
 * Names of the Play API variables that are missing or malformed. NEVER their
 * values. Empty means the Android Publisher client is usable.
 */
export function describeGooglePlayConfigProblems(): string[] {
  if (cachedProblems) return [...cachedProblems];
  const problems: string[] = [];

  const account = env("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  if (!account) problems.push("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing");
  else if (!parseServiceAccountJson(account)) {
    problems.push("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON malformed");
  }

  const pkg = env("GOOGLE_PLAY_PACKAGE_NAME");
  if (pkg && !PACKAGE_RE.test(pkg)) problems.push("GOOGLE_PLAY_PACKAGE_NAME malformed");

  cachedProblems = problems;
  return [...problems];
}

let reportedOnce = false;

/**
 * The non-secret configuration, or null when anything is missing or malformed.
 *
 * FAILS CLOSED, AND SAYS WHICH VARIABLE. The first refusal logs the variable
 * NAMES (never values) once per process, so an operator reading the server log
 * learns "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing" instead of a bare 503.
 */
export function getGooglePlayConfig(): GooglePlayConfig | null {
  if (cachedConfig) return cachedConfig.value;
  const problems = describeGooglePlayConfigProblems();
  let value: GooglePlayConfig | null = null;
  if (problems.length === 0) {
    const parsed = parseServiceAccountJson(env("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") ?? "");
    if (parsed) {
      value = {
        packageName: env("GOOGLE_PLAY_PACKAGE_NAME") ?? DEFAULT_PACKAGE_NAME,
        clientEmail: parsed.clientEmail,
        privateKeyId: parsed.privateKeyId,
      };
    }
  } else if (!reportedOnce) {
    reportedOnce = true;
    console.error(`[google] Play API not configured: ${problems.join(", ")}`);
  }
  cachedConfig = { value };
  return value;
}

/**
 * The service account's private key as PEM, or null.
 *
 * NOT CACHED, for the reason apple/config.ts#getIapPrivateKeyPem gives. The one
 * caller passes it straight into the JWT signer and lets it fall out of scope.
 */
export function getServiceAccountPrivateKeyPem(): string | null {
  const raw = env("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  return parseServiceAccountJson(raw)?.privateKeyPem ?? null;
}

/**
 * Names of the RTDN push-authentication variables that are missing or
 * malformed. A separate list because the notification endpoint needs both
 * these AND the Play API configuration, and an operator needs to know which.
 */
export function describeRtdnConfigProblems(): string[] {
  const problems: string[] = [];
  const audience = env("GOOGLE_PLAY_RTDN_AUDIENCE");
  if (!audience) problems.push("GOOGLE_PLAY_RTDN_AUDIENCE missing");
  else if (audience.length > 500) problems.push("GOOGLE_PLAY_RTDN_AUDIENCE malformed");
  const email = env("GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT");
  if (!email) problems.push("GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT missing");
  else if (!SERVICE_EMAIL_RE.test(email)) problems.push("GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT malformed");
  return problems;
}

/**
 * What a genuine Pub/Sub push must prove, or null — in which case the RTDN
 * endpoint is CLOSED. An unset audience is never "accept any audience".
 */
export function getRtdnAuthConfig(): RtdnAuthConfig | null {
  const problems = describeRtdnConfigProblems();
  if (problems.length > 0) {
    console.error(`[google] RTDN endpoint closed: ${problems.join(", ")}`);
    return null;
  }
  return {
    audience: env("GOOGLE_PLAY_RTDN_AUDIENCE") ?? "",
    serviceAccountEmail: (env("GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT") ?? "").toLowerCase(),
  };
}

/**
 * May a license-tester (TEST) purchase create real access?
 *
 * DEFAULT YES, for the reason the Apple rail grants sandbox purchases: the
 * closed-testing testers and the owner verify the rail with test purchases, and
 * a rail that takes a tester through the sheet and grants nothing reads as
 * broken. The grant is namespaced (`gp:test:`), so it never collides with a
 * real order and stays greppable and revocable. Only accounts the developer
 * lists as license testers can make a test purchase at all.
 *
 * `GOOGLE_PLAY_TEST_GRANTS=off` turns it off.
 */
export function testGrantsEnabled(): boolean {
  return (process.env.GOOGLE_PLAY_TEST_GRANTS ?? "").trim().toLowerCase() !== "off";
}

/** Test-only seam: the memoization above would otherwise pin the first read. */
export function resetGooglePlayConfigCacheForTests(): void {
  cachedProblems = null;
  cachedConfig = null;
  reportedOnce = false;
}
