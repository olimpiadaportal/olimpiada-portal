// COMPACT JWS — the pure half of reading Apple's signed data.
//
// WHAT THIS FILE IS AND IS NOT. Apple signs every transaction and every server
// notification as a compact JWS whose header carries an `x5c` certificate chain
// that must be validated up to the Apple Root CA. THIS MODULE DOES NOT DO THAT.
// Hand-rolled certificate-chain validation is the classic subtly-wrong-and-
// catastrophic security code, so the chain is delegated to Apple's own
// `SignedDataVerifier` (see `verifier.ts`). What lives here is the part that has
// to exist anyway and is worth being able to unit-test without a network, a key
// or a certificate authority:
//
//   * `decodeJwsUnverified` — the UNTRUSTED peek. You cannot pick which rail to
//     verify on until you have read the `environment` claim, and you cannot read
//     it without decoding first. The name says untrusted because the value is.
//   * `verifyJwsEs256` — the ES256 signature check against a public key you
//     supply. Real, load-bearing crypto, fully testable with a throwaway key.
//   * `leafCertificatePem` — x5c[0] wrapped as PEM, so the leaf's public key can
//     be pulled out. Trust in that leaf comes from the chain check, not here.
//
// KEY-INJECTED ON PURPOSE, exactly like `azericard/signing.ts`: this module
// never reads an environment variable and never imports `config.ts`, so the
// tests exercise it end to end with a keypair generated in the test process.
//
// NOTHING HERE MAY EVER BE LOGGED. Not a key, not a signature, not the reason an
// OpenSSL call threw — an OpenSSL error string can quote key material. Every
// failure below collapses to `null` or `false`.
import { createPublicKey, createVerify, X509Certificate, type KeyObject } from "node:crypto";

/**
 * Hard cap on signed data we will even look at.
 *
 * A notification body is a few kilobytes; a transaction JWS is smaller. The cap
 * exists because the endpoint receiving this is public, and base64 decoding an
 * unbounded body on an unauthenticated request is a free CPU and memory lever.
 */
export const JWS_MAX_BYTES = 64 * 1024;

/** Apple signs with ES256. Anything else is not Apple, whatever the chain says. */
export const JWS_ALGORITHM = "ES256";

/** ES256 produces a fixed 64-byte (R||S) signature. */
const ES256_SIGNATURE_BYTES = 64;

export type JwsHeader = {
  alg?: string;
  x5c?: unknown;
  [key: string]: unknown;
};

export type CompactJws = {
  readonly header: JwsHeader;
  /** The `header.payload` string the signature covers, ASCII. */
  readonly signingInput: string;
  /** Raw JOSE (R||S) signature bytes. */
  readonly signature: Buffer;
  readonly payloadJson: unknown;
};

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

/** base64url -> Buffer. Rejects rather than silently truncating on bad input. */
export function base64UrlDecode(segment: string): Buffer | null {
  if (typeof segment !== "string" || segment.length === 0) return null;
  if (!BASE64URL_RE.test(segment)) return null;
  try {
    return Buffer.from(segment, "base64url");
  } catch {
    return null;
  }
}

/** Buffer -> base64url, unpadded. Used by `jwt.ts` too. */
export function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input as Buffer).toString("base64url");
}

function parseJsonSegment(segment: string): unknown {
  const raw = base64UrlDecode(segment);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Split and decode a compact JWS without verifying anything.
 *
 * Returns null for anything that is not three base64url segments carrying JSON
 * in the first two and an ES256-shaped signature in the third.
 */
export function parseCompactJws(compact: string): CompactJws | null {
  if (typeof compact !== "string") return null;
  if (compact.length === 0 || Buffer.byteLength(compact, "utf8") > JWS_MAX_BYTES) return null;

  const parts = compact.split(".");
  if (parts.length !== 3) return null;
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  const header = parseJsonSegment(headerSegment);
  if (typeof header !== "object" || header === null || Array.isArray(header)) return null;

  const payloadJson = parseJsonSegment(payloadSegment);
  if (payloadJson === undefined) return null;

  const signature = base64UrlDecode(signatureSegment);
  // Length is checked HERE rather than at verify time so that a DER-encoded
  // signature — the shape Node produces by default, and the single easiest way
  // to get this wrong — is rejected as malformed instead of as "wrong key".
  if (!signature || signature.length !== ES256_SIGNATURE_BYTES) return null;

  return {
    header: header as JwsHeader,
    signingInput: `${headerSegment}.${payloadSegment}`,
    signature,
    payloadJson,
  };
}

/**
 * THE UNTRUSTED PEEK. Decode the payload so the caller can read which
 * environment and which app the message CLAIMS to be about, and pick a rail.
 *
 * The name is the documentation: nothing this returns has been verified, and no
 * decision that matters may be taken on it. The only legitimate uses are
 * choosing a verifier and logging that something arrived.
 */
export function decodeJwsUnverified<T = unknown>(
  compact: string,
): { header: JwsHeader; payload: T } | null {
  const parsed = parseCompactJws(compact);
  if (!parsed) return null;
  return { header: parsed.header, payload: parsed.payloadJson as T };
}

/**
 * Verify the ES256 signature of a compact JWS against a public key.
 *
 * Returns a plain boolean and never throws: a malformed key, a malformed
 * signature and a genuinely wrong signature are all "not verified" and the
 * caller must treat them identically. Any distinction drawn here would be an
 * oracle, and there is nothing useful a caller could do with it.
 *
 * `dsaEncoding: "ieee-p1363"` is NOT optional. JOSE signatures are raw R||S;
 * Node's default for EC is DER. Omitting it makes every genuine Apple signature
 * fail to verify, which reads in production as "Apple sent us something bad".
 */
export function verifyJwsEs256(compact: string, publicKey: string | KeyObject): boolean {
  const parsed = parseCompactJws(compact);
  if (!parsed) return false;
  if (parsed.header.alg !== JWS_ALGORITHM) return false;
  try {
    const key = typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;
    const verifier = createVerify("sha256");
    verifier.update(parsed.signingInput, "ascii");
    verifier.end();
    return verifier.verify({ key, dsaEncoding: "ieee-p1363" }, parsed.signature);
  } catch {
    return false;
  }
}

/**
 * The leaf certificate from the header's `x5c`, wrapped as PEM.
 *
 * PROVES NOTHING ABOUT TRUST. It is the certificate the sender chose to attach.
 * Only the chain validation in `verifier.ts` decides whether that certificate is
 * Apple's.
 */
export function leafCertificatePem(header: JwsHeader): string | null {
  const chain = header.x5c;
  if (!Array.isArray(chain) || chain.length === 0) return null;
  const leaf = chain[0];
  if (typeof leaf !== "string" || leaf.length === 0 || leaf.length > 8192) return null;
  // Standard base64 (x5c is base64, not base64url) wrapped at 64 columns.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(leaf)) return null;
  const body = leaf.replace(/(.{64})/g, "$1\n").replace(/\n$/, "");
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

/**
 * Verify a JWS against the public key of the certificate it carries.
 *
 * DEFENCE IN DEPTH, NOT THE DECISION. It answers "was this signed by the key in
 * the attached certificate", which is worthless on its own — an attacker can
 * attach their own certificate and sign with it. It is useful only AFTER
 * `verifier.ts` has established that the attached chain really is Apple's.
 */
export function verifyJwsAgainstEmbeddedLeaf(compact: string): boolean {
  const parsed = parseCompactJws(compact);
  if (!parsed) return false;
  const pem = leafCertificatePem(parsed.header);
  if (!pem) return false;
  try {
    return verifyJwsEs256(compact, new X509Certificate(pem).publicKey);
  } catch {
    return false;
  }
}
