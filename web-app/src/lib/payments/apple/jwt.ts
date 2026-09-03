// THE BEARER TOKEN the App Store Server API demands — the pure half.
//
// Apple authenticates server-to-server calls with a short-lived ES256 JWT signed
// by the "In-App Purchase" key downloaded once from App Store Connect. Claims
// (App Store Server API, verified 2026-08-31 against Apple's own Node and Python
// libraries):
//
//   header   { "alg": "ES256", "kid": <key id>, "typ": "JWT" }
//   payload  { "iss": <issuer id>, "iat": <now, seconds>, "exp": <now + n>,
//              "aud": "appstoreconnect-v1", "bid": <bundle id> }
//
// KEY-INJECTED ON PURPOSE, exactly like `azericard/signing.ts`: this module
// never reads an environment variable, so the tests sign with a throwaway P-256
// keypair generated in the test process and the real key never has to exist for
// the suite to run. `config.ts` is the one place the real key is read, and it
// hands the PEM straight in here.
//
// THE PRIVATE KEY IS NEVER RETURNED, NEVER LOGGED, NEVER WRITTEN. It appears in
// exactly one parameter and one `crypto.sign` call. Every failure below throws a
// content-free Error rather than wrapping the OpenSSL message, because an
// OpenSSL error string can quote key bytes.
import { createPrivateKey, sign as cryptoSign, type KeyObject } from "node:crypto";
import { base64UrlEncode } from "./jws";

/** Constant, for every App Store Server API environment. */
export const APP_STORE_JWT_AUDIENCE = "appstoreconnect-v1";

/**
 * Apple rejects a token whose lifetime exceeds 20 minutes. We mint for five,
 * matching Apple's own libraries: the token is created per call, so a longer
 * life buys nothing and only widens the window in which a leaked Authorization
 * header is useful.
 */
export const APP_STORE_JWT_MAX_LIFETIME_SECONDS = 1200;
export const APP_STORE_JWT_DEFAULT_LIFETIME_SECONDS = 300;

export type AppStoreJwtClaims = {
  /** Issuer id from App Store Connect (a UUID). */
  readonly issuerId: string;
  /** Key id of the in-app-purchase key (10 characters). */
  readonly keyId: string;
  /** Our bundle id — Apple scopes the token to one app via `bid`. */
  readonly bundleId: string;
};

export type AppStoreJwtOptions = {
  /** Injected so the expiry is testable without faking the process clock. */
  readonly nowMs?: number;
  readonly lifetimeSeconds?: number;
};

/**
 * Load a PEM as an EC P-256 private key, or refuse.
 *
 * The curve check is worth its three lines: an RS256 key from the same App Store
 * Connect page signs happily and produces a token Apple rejects with a bare 401,
 * which is a genuinely hard thing to diagnose from the outside.
 */
export function loadEs256PrivateKey(privateKeyPem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(privateKeyPem);
  } catch {
    throw new Error("apple: unusable in-app-purchase private key");
  }
  if (key.asymmetricKeyType !== "ec") {
    throw new Error("apple: in-app-purchase key is not an EC key");
  }
  const curve = key.asymmetricKeyDetails?.namedCurve;
  if (curve !== "prime256v1") {
    throw new Error("apple: in-app-purchase key is not on the P-256 curve");
  }
  return key;
}

/**
 * Mint the Authorization bearer token for one App Store Server API call.
 *
 * `dsaEncoding: "ieee-p1363"` is NOT optional — see the same note in `jws.ts`.
 * JOSE wants a raw 64-byte R||S signature and Node's EC default is DER, so
 * omitting it produces a token that is well-formed, signs cleanly, and is
 * rejected by Apple with no explanation.
 */
export function signAppStoreJwt(
  privateKeyPem: string,
  claims: AppStoreJwtClaims,
  options: AppStoreJwtOptions = {},
): string {
  const lifetime = options.lifetimeSeconds ?? APP_STORE_JWT_DEFAULT_LIFETIME_SECONDS;
  if (!Number.isInteger(lifetime) || lifetime <= 0) {
    throw new Error("apple: invalid token lifetime");
  }
  if (lifetime > APP_STORE_JWT_MAX_LIFETIME_SECONDS) {
    throw new Error("apple: token lifetime exceeds the App Store maximum");
  }

  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) throw new Error("apple: invalid clock");
  const issuedAt = Math.floor(nowMs / 1000);

  const key = loadEs256PrivateKey(privateKeyPem);

  const header = { alg: "ES256", kid: claims.keyId, typ: "JWT" };
  const payload = {
    iss: claims.issuerId,
    iat: issuedAt,
    exp: issuedAt + lifetime,
    aud: APP_STORE_JWT_AUDIENCE,
    bid: claims.bundleId,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload),
  )}`;

  let signature: Buffer;
  try {
    signature = cryptoSign("sha256", Buffer.from(signingInput, "ascii"), {
      key,
      dsaEncoding: "ieee-p1363",
    });
  } catch {
    throw new Error("apple: token signing failed");
  }

  return `${signingInput}.${base64UrlEncode(signature)}`;
}
