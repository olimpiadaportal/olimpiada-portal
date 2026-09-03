// Apple in-app-purchase configuration — SERVER ONLY.
//
// The `server-only` import makes the BUILD FAIL if this module is ever pulled
// into client code. Everything it reads is either a secret or a value that tells
// an attacker how to shape a message, so none of it may reach a browser bundle
// and none of it is ever returned to a client.
//
// NOTHING HERE IS EVER LOGGED OR RETURNED. `describeConfigProblems()` reports
// only the NAME of a variable that is missing or malformed — never its value,
// never a fragment of a key, never a decoded PEM. Key material leaves this
// module through exactly two getters, whose callers pass it straight into
// `node:crypto` and drop it.
//
// THERE IS NO "WHICH ENVIRONMENT AM I" VARIABLE, AND THAT IS DELIBERATE. App
// Review testers buy in SANDBOX against our PRODUCTION server, so a production
// deployment must be able to verify sandbox data while being structurally unable
// to grant production access from it. That separation is carried by the types
// (see `environment.ts`), not by a flag someone could set wrongly. The same
// issuer id, key id and private key authenticate BOTH rails; only the base URL
// and the signing certificates differ.
import "server-only";
import { X509Certificate } from "node:crypto";
import { isUuid } from "@/lib/uuid";
import { loadEs256PrivateKey } from "./jwt";

export type AppleIapConfig = {
  /** Fixed by App Store Connect and permanent: `ai.olympiq.app`. */
  bundleId: string;
  /** App Store Connect issuer id (UUID). */
  issuerId: string;
  /** Key id of the in-app-purchase key (10 characters). */
  keyId: string;
  /**
   * The app's numeric Apple id. Apple's `SignedDataVerifier` needs it to check
   * that PRODUCTION signed data is about OUR app; it is not a secret, but it is
   * required, so a missing value is a configuration problem rather than a
   * default.
   */
  appAppleId: number;
};

/** Read a server env var, trimmed; empty string becomes null. */
function env(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v === "" ? null : v;
}

/** App Store Connect key ids are 10 uppercase alphanumerics. */
const KEY_ID_RE = /^[A-Z0-9]{10}$/;
/** Reverse-DNS bundle id, as registered with Apple. */
const BUNDLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,154}$/;

/** Normalise line endings and guarantee a trailing newline, as OpenSSL wants. */
function normalizePem(pem: string): string {
  const text = pem.split("\r\n").join("\n").trim();
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Accept the key either as literal PEM or as base64-of-PEM.
 *
 * Same tolerance as `azericard/signing.ts#decodeKeyMaterial`, and for the same
 * reason: hosting panels mangle multi-line secrets, and a base64 blob survives
 * every one of them. Returns null rather than a partially-decoded string.
 */
export function decodeKeyMaterial(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("-----BEGIN")) return normalizePem(trimmed);
  let decoded: string;
  try {
    decoded = Buffer.from(trimmed, "base64").toString("utf8");
  } catch {
    return null;
  }
  if (!decoded.includes("-----BEGIN")) return null;
  return normalizePem(decoded);
}

/**
 * Parse the configured Apple root certificates.
 *
 * WHY THIS IS A VARIABLE AND NOT A CONSTANT IN THE SOURCE. Chain validation is
 * only as good as its trust anchor, and an anchor typed from memory into a
 * source file is an anchor nobody can audit. Apple publishes the roots at
 * https://www.apple.com/certificateauthority/ ; the operator downloads them and
 * sets the variable. Missing or unparseable means the module refuses to verify
 * ANYTHING, which is the correct failure: no verification, no grant.
 *
 * Format: one or more base64 DER certificates (a PEM body, or a whole PEM file),
 * separated by whitespace or commas. Returned as DER buffers, which is what
 * Apple's `SignedDataVerifier` takes.
 */
export function parseRootCertificates(value: string): Buffer[] | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const text = value.split("\r\n").join("\n");

  const pemBlocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  const candidates = pemBlocks
    ? pemBlocks
    : text
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => s !== "");

  const out: Buffer[] = [];
  for (const candidate of candidates) {
    const base64 = candidate
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s+/g, "");
    if (base64 === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
    const der = Buffer.from(base64, "base64");
    try {
      // Parsing proves it is a certificate and not, say, a truncated paste.
      new X509Certificate(der);
    } catch {
      return null;
    }
    out.push(der);
  }
  return out.length > 0 ? out : null;
}

// Memoized because the checks below PARSE A PRIVATE KEY AND EVERY ROOT
// CERTIFICATE, and the notification endpoint that will call this is public:
// re-deriving the configuration per request would hand an unauthenticated caller
// a CPU lever. The process environment does not change at runtime, so one
// evaluation is also the only correct number. Decoded key material is NOT
// cached — see the getters.
let cachedProblems: string[] | null = null;
let cachedConfig: { value: AppleIapConfig | null } | null = null;

/**
 * Names of the variables that are missing or malformed. NEVER their values.
 * An empty array means the configuration is usable.
 */
export function describeConfigProblems(): string[] {
  if (cachedProblems) return [...cachedProblems];
  cachedProblems = computeConfigProblems();
  return [...cachedProblems];
}

function computeConfigProblems(): string[] {
  const problems: string[] = [];

  const bundleId = env("APPLE_IAP_BUNDLE_ID");
  if (!bundleId) problems.push("APPLE_IAP_BUNDLE_ID missing");
  else if (!BUNDLE_ID_RE.test(bundleId)) problems.push("APPLE_IAP_BUNDLE_ID malformed");

  const issuerId = env("APPLE_IAP_ISSUER_ID");
  if (!issuerId) problems.push("APPLE_IAP_ISSUER_ID missing");
  else if (!isUuid(issuerId)) problems.push("APPLE_IAP_ISSUER_ID malformed");

  const keyId = env("APPLE_IAP_KEY_ID");
  if (!keyId) problems.push("APPLE_IAP_KEY_ID missing");
  else if (!KEY_ID_RE.test(keyId)) problems.push("APPLE_IAP_KEY_ID malformed");

  const appAppleId = env("APPLE_IAP_APP_APPLE_ID");
  if (!appAppleId) problems.push("APPLE_IAP_APP_APPLE_ID missing");
  else if (!/^[0-9]{1,19}$/.test(appAppleId)) problems.push("APPLE_IAP_APP_APPLE_ID malformed");

  const privateKeyRaw = env("APPLE_IAP_PRIVATE_KEY");
  if (!privateKeyRaw) problems.push("APPLE_IAP_PRIVATE_KEY missing");
  else {
    const pem = decodeKeyMaterial(privateKeyRaw);
    if (!pem) problems.push("APPLE_IAP_PRIVATE_KEY malformed");
    else {
      try {
        loadEs256PrivateKey(pem);
      } catch {
        // The thrown message is content-free by construction, and is dropped
        // here regardless: only the variable NAME is ever reported.
        problems.push("APPLE_IAP_PRIVATE_KEY not an ES256 (P-256) key");
      }
    }
  }

  const roots = env("APPLE_IAP_ROOT_CERTIFICATES");
  if (!roots) problems.push("APPLE_IAP_ROOT_CERTIFICATES missing");
  else if (!parseRootCertificates(roots)) problems.push("APPLE_IAP_ROOT_CERTIFICATES malformed");

  return problems;
}

/** The non-secret configuration, or null when anything is missing or malformed. */
export function getAppleIapConfig(): AppleIapConfig | null {
  if (cachedConfig) return cachedConfig.value;
  const value = describeConfigProblems().length === 0 ? readConfig() : null;
  cachedConfig = { value };
  return value;
}

function readConfig(): AppleIapConfig | null {
  const bundleId = env("APPLE_IAP_BUNDLE_ID");
  const issuerId = env("APPLE_IAP_ISSUER_ID");
  const keyId = env("APPLE_IAP_KEY_ID");
  const appAppleId = env("APPLE_IAP_APP_APPLE_ID");
  if (!bundleId || !issuerId || !keyId || !appAppleId) return null;
  return { bundleId, issuerId, keyId, appAppleId: Number(appAppleId) };
}

/**
 * The in-app-purchase signing key as PEM, or null.
 *
 * NOT CACHED, deliberately: a decoded private key held in a module-level
 * variable is a long-lived copy of a secret in the heap for the life of the
 * process, and the decode is cheap. The single caller passes it straight into
 * `signAppStoreJwt` and lets it fall out of scope. Never log the return value,
 * never put it in an error, never write it to a file.
 */
export function getIapPrivateKeyPem(): string | null {
  const raw = env("APPLE_IAP_PRIVATE_KEY");
  if (!raw) return null;
  return decodeKeyMaterial(raw);
}

/** Apple root CA certificates as DER buffers, or null. Public data, not a secret. */
export function getAppleRootCertificates(): Buffer[] | null {
  const raw = env("APPLE_IAP_ROOT_CERTIFICATES");
  if (!raw) return null;
  return parseRootCertificates(raw);
}

/** Test-only seam: the memoization above would otherwise pin the first read. */
export function resetAppleConfigCacheForTests(): void {
  cachedProblems = null;
  cachedConfig = null;
}

/**
 * May a SANDBOX purchase create real access?
 *
 * DEFAULT YES, and the asymmetry is the point. App Review buys in sandbox
 * against the production build, so default-NO costs a rejected submission and
 * days of review turnaround, while default-YES costs a narrow, marked
 * ("sbx:"-prefixed), revocable vector that requires developer tooling and a
 * sandbox Apple ID configured on the device. Default to the state in which
 * review passes.
 *
 * Set APPLE_IAP_SANDBOX_GRANTS=off to turn it off once the app is live and the
 * reviewer no longer needs it.
 */
export function sandboxGrantsEnabled(): boolean {
  return (process.env.APPLE_IAP_SANDBOX_GRANTS ?? "").trim().toLowerCase() !== "off";
}
