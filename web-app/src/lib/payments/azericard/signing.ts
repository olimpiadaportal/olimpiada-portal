// RSA-SHA256 signing / verification for the AzeriCard MAC — the pure half.
//
// KEY-INJECTED ON PURPOSE. This module never reads an environment variable and
// never touches `config.ts`, so the unit tests can exercise it end-to-end with
// a THROWAWAY keypair generated in the test process. The real keys are read
// exactly once, in `gateway.ts` (which is `server-only`), and are passed in
// here as PEM text.
//
// The spec (§8.3): "Standart MAC alqoritmi RSAwithSHA256-dir … Effektiv açar
// uzunluğu … RSA üçün 2048 bit olmalıdır. MAC sahəsinin dəyəri böyük hərf və ya
// kiçik hərf onaltılıq sətir ola bilər." So: RSA-2048 minimum, SHA-256, and the
// signature travels as a hex string in EITHER case. To verify theirs: "əvvəlcə
// hex2bin(P_SIGN) funksiyasından istifadə etməli, sonra AZERICARDpublic.pem
// vasitəsilə məlumatları yoxlamalısınız."
//
// NOTHING IN HERE MAY EVER BE LOGGED. Not the key, not a fragment of it, not
// the reason a `createSign` call threw — an OpenSSL error message can carry key
// material. Every failure below collapses to a boolean or a generic Error.
import { createSign, createVerify, createPrivateKey, createPublicKey } from "node:crypto";

/** The signature algorithm the gateway specifies. */
export const MAC_ALGORITHM = "RSA-SHA256";

/** Minimum effective key length the spec demands. */
export const MIN_RSA_MODULUS_BITS = 2048;

const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Is this a plausible hex-encoded signature? Checked BEFORE `Buffer.from(…,
 * "hex")`, because that call silently truncates at the first invalid character
 * and would turn "not hex at all" into "a short buffer that simply fails to
 * verify" — the same outcome for now, but a lie in any future log line.
 */
export function isHexSignature(text: string): boolean {
  return (
    typeof text === "string" &&
    text.length >= 2 &&
    text.length <= 2048 &&
    text.length % 2 === 0 &&
    HEX_RE.test(text)
  );
}

/**
 * Sign a MAC source string with our private key. Returns LOWERCASE hex.
 *
 * Throws a deliberately content-free Error when the key is unusable; the caller
 * turns that into a generic failure. The underlying OpenSSL message is dropped
 * on the floor rather than wrapped, because it can quote key bytes.
 */
export function signMacSource(privateKeyPem: string, macSource: string): string {
  let key;
  try {
    key = createPrivateKey(privateKeyPem);
  } catch {
    throw new Error("azericard: unusable private key");
  }
  try {
    const signer = createSign(MAC_ALGORITHM);
    signer.update(macSource, "utf8");
    signer.end();
    return signer.sign(key, "hex");
  } catch {
    throw new Error("azericard: signing failed");
  }
}

/**
 * Verify a gateway signature over a MAC source string with THEIR public key.
 *
 * Returns a plain boolean and never throws: a malformed key, a malformed
 * signature and a genuinely wrong signature are all "not verified", and the
 * caller must treat them identically. Any distinction we drew here would be an
 * oracle, and there is nothing useful the caller could do with it anyway.
 */
export function verifyMacSignature(
  publicKeyPem: string,
  macSource: string,
  signatureHex: string,
): boolean {
  if (!isHexSignature(signatureHex)) return false;
  try {
    const key = createPublicKey(publicKeyPem);
    const verifier = createVerify(MAC_ALGORITHM);
    verifier.update(macSource, "utf8");
    verifier.end();
    return verifier.verify(key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

/**
 * Modulus size of an RSA key, or null when the PEM is not an RSA key we can
 * read. Used by the configuration self-check so a 1024-bit key is refused at
 * startup instead of failing as an unexplained decline at the gateway.
 * The key itself is never returned, only its size.
 */
export function rsaModulusBits(pem: string, kind: "private" | "public"): number | null {
  try {
    const key = kind === "private" ? createPrivateKey(pem) : createPublicKey(pem);
    if (key.asymmetricKeyType !== "rsa" && key.asymmetricKeyType !== "rsa-pss") {
      return null;
    }
    const bits = key.asymmetricKeyDetails?.modulusLength;
    return typeof bits === "number" ? bits : null;
  } catch {
    return null;
  }
}

/**
 * Decode a key that was transported as base64 (which is how both AzeriCard keys
 * reach us: a raw PEM's newlines do not survive every env-var transport, and a
 * mangled key fails as "invalid signature" with nothing to debug).
 *
 * Tolerant of a value that is ALREADY a PEM, so an operator who pastes the file
 * contents directly is not punished for it. Returns null when the input decodes
 * to something that is not a PEM at all — the caller reports "not configured",
 * never the value.
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
 * CRLF and escaped "\n" both appear in the wild when a PEM is round-tripped
 * through a dashboard env editor. OpenSSL wants real LFs.
 */
function normalizePem(pem: string): string {
  return pem.split("\\n").join("\n").split("\r\n").join("\n").trim() + "\n";
}
