// The OAuth 2.0 service-account assertion Google's token endpoint demands — and
// the RS256 verification of the OIDC token Pub/Sub pushes with. The pure half.
//
// SIGNING (server -> Google). A service account authenticates by signing a
// short-lived JWT with its RSA key and exchanging it at the token endpoint for
// an access token (RFC 7523, "JWT bearer" grant):
//
//   header   { "alg": "RS256", "typ": "JWT", "kid": <private_key_id> }
//   payload  { "iss": <client_email>, "scope": <space-separated scopes>,
//              "aud": "https://oauth2.googleapis.com/token",
//              "iat": <now, seconds>, "exp": <now + <=3600> }
//
// KEY-INJECTED ON PURPOSE, exactly like apple/jwt.ts: this module never reads an
// environment variable, so the tests sign with a throwaway RSA keypair and the
// real key never has to exist for the suite to run. Every failure throws a
// content-free Error, because an OpenSSL message can quote key bytes.
//
// No dependency: `node:crypto` signs and verifies RS256 natively, and a JWT is
// three base64url segments. Adding google-auth-library would put the key in a
// second place that holds it and pull a large tree into a payment path for two
// functions.
import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";

/** Google's OAuth 2.0 token endpoint. Pinned; a key file's `token_uri` is ignored. */
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** The one scope this platform asks for. */
export const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/** Google rejects an assertion living longer than an hour. */
export const SERVICE_ACCOUNT_JWT_MAX_LIFETIME_SECONDS = 3600;

export type ServiceAccountJwtClaims = {
  readonly clientEmail: string;
  readonly privateKeyId: string | null;
  readonly scope: string;
  readonly audience?: string;
};

export type ServiceAccountJwtOptions = {
  readonly nowMs?: number;
  readonly lifetimeSeconds?: number;
};

export function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function base64UrlDecode(input: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) return null;
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Load a PEM as an RSA private key, or refuse with a content-free error. */
export function loadRsaPrivateKey(privateKeyPem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(privateKeyPem);
  } catch {
    throw new Error("google: unusable service-account private key");
  }
  if (key.asymmetricKeyType !== "rsa") {
    throw new Error("google: service-account key is not an RSA key");
  }
  return key;
}

/** Mint the assertion exchanged at the token endpoint for an access token. */
export function signServiceAccountJwt(
  privateKeyPem: string,
  claims: ServiceAccountJwtClaims,
  options: ServiceAccountJwtOptions = {},
): string {
  const lifetime = options.lifetimeSeconds ?? SERVICE_ACCOUNT_JWT_MAX_LIFETIME_SECONDS;
  if (!Number.isInteger(lifetime) || lifetime <= 0) {
    throw new Error("google: invalid assertion lifetime");
  }
  if (lifetime > SERVICE_ACCOUNT_JWT_MAX_LIFETIME_SECONDS) {
    throw new Error("google: assertion lifetime exceeds the maximum");
  }
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) throw new Error("google: invalid clock");
  const issuedAt = Math.floor(nowMs / 1000);

  const key = loadRsaPrivateKey(privateKeyPem);

  const header: Record<string, string> = { alg: "RS256", typ: "JWT" };
  if (claims.privateKeyId) header.kid = claims.privateKeyId;
  const payload = {
    iss: claims.clientEmail,
    scope: claims.scope,
    aud: claims.audience ?? GOOGLE_OAUTH_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + lifetime,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;

  let signature: Buffer;
  try {
    // RSASSA-PKCS1-v1_5 with SHA-256 is node's default for an RSA key — which
    // is exactly what RS256 is.
    signature = cryptoSign("sha256", Buffer.from(signingInput, "ascii"), key);
  } catch {
    throw new Error("google: assertion signing failed");
  }
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

// ---------------------------------------------------------------------------
// VERIFYING the OIDC token a Pub/Sub push carries.
// ---------------------------------------------------------------------------

/** The two issuer spellings Google documents for its OIDC tokens. */
export const GOOGLE_OIDC_ISSUERS: ReadonlySet<string> = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);

/** Clock skew tolerated on exp / iat, in seconds. */
export const OIDC_CLOCK_SKEW_SECONDS = 300;
/** Google's OIDC tokens live an hour; refuse anything claiming far longer. */
const OIDC_MAX_LIFETIME_SECONDS = 2 * 3600;
const JWT_MAX_CHARS = 8192;

export type OidcExpectation = {
  readonly audience: string;
  /** Lower-cased service-account email the push subscription authenticates as. */
  readonly email: string;
  readonly nowMs?: number;
};

/** Resolve a key id to a public key. Null = unknown kid. */
export type OidcKeyResolver = (kid: string) => Promise<KeyObject | null>;

export type OidcVerifyResult =
  | { readonly ok: true; readonly claims: Record<string, unknown> }
  | {
      readonly ok: false;
      /** Internal code, logged by name only and never returned to a caller. */
      readonly reason:
        | "malformed"
        | "alg"
        | "unknown_kid"
        | "signature"
        | "issuer"
        | "audience"
        | "email"
        | "expired"
        | "not_yet_valid"
        | "lifetime";
    };

function parseSegment(segment: string): Record<string, unknown> | null {
  const raw = base64UrlDecode(segment);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw.toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Build a public key from one JWKS entry, or null for anything not RS256/RSA. */
export function publicKeyFromJwk(jwk: unknown): KeyObject | null {
  if (!jwk || typeof jwk !== "object") return null;
  const k = jwk as Record<string, unknown>;
  if (k.kty !== "RSA" || typeof k.n !== "string" || typeof k.e !== "string") return null;
  if (k.alg !== undefined && k.alg !== "RS256") return null;
  if (k.use !== undefined && k.use !== "sig") return null;
  try {
    return createPublicKey({
      key: { kty: "RSA", n: k.n, e: k.e } as JsonWebKey,
      format: "jwk",
    });
  } catch {
    return null;
  }
}

/**
 * Verify a Google-signed OIDC token: RS256 signature against Google's key, the
 * issuer, the audience WE configured, the service-account email WE configured,
 * and the validity window. Every refusal is a value; nothing throws.
 *
 * The algorithm is PINNED to RS256 before the key is even looked up — a token
 * that names `none` or `HS256` is refused on its header, which is the classic
 * JWT confusion attack closed at the first line rather than at the last.
 */
export async function verifyGoogleOidcToken(
  token: string,
  expect: OidcExpectation,
  resolveKey: OidcKeyResolver,
): Promise<OidcVerifyResult> {
  if (typeof token !== "string" || token.length === 0 || token.length > JWT_MAX_CHARS) {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [h, p, s] = parts as [string, string, string];

  const header = parseSegment(h);
  const claims = parseSegment(p);
  const signature = base64UrlDecode(s);
  if (!header || !claims || !signature || signature.length === 0) {
    return { ok: false, reason: "malformed" };
  }
  if (header.alg !== "RS256") return { ok: false, reason: "alg" };
  if (typeof header.kid !== "string" || header.kid === "" || header.kid.length > 200) {
    return { ok: false, reason: "unknown_kid" };
  }

  const key = await resolveKey(header.kid);
  if (!key) return { ok: false, reason: "unknown_kid" };

  let valid = false;
  try {
    valid = cryptoVerify("sha256", Buffer.from(`${h}.${p}`, "ascii"), key, signature);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "signature" };

  // Claims are only read AFTER the signature holds.
  if (typeof claims.iss !== "string" || !GOOGLE_OIDC_ISSUERS.has(claims.iss)) {
    return { ok: false, reason: "issuer" };
  }
  const aud = claims.aud;
  const audOk =
    (typeof aud === "string" && aud === expect.audience) ||
    (Array.isArray(aud) && aud.length === 1 && aud[0] === expect.audience);
  if (!audOk) return { ok: false, reason: "audience" };

  if (
    typeof claims.email !== "string" ||
    claims.email.toLowerCase() !== expect.email ||
    claims.email_verified !== true
  ) {
    return { ok: false, reason: "email" };
  }

  const now = Math.floor((expect.nowMs ?? Date.now()) / 1000);
  const exp = claims.exp;
  const iat = claims.iat;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return { ok: false, reason: "expired" };
  if (typeof iat !== "number" || !Number.isFinite(iat)) return { ok: false, reason: "not_yet_valid" };
  if (exp + OIDC_CLOCK_SKEW_SECONDS < now) return { ok: false, reason: "expired" };
  if (iat - OIDC_CLOCK_SKEW_SECONDS > now) return { ok: false, reason: "not_yet_valid" };
  if (exp - iat > OIDC_MAX_LIFETIME_SECONDS || exp <= iat) return { ok: false, reason: "lifetime" };

  return { ok: true, claims };
}
