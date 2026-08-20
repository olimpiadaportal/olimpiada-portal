// RSA-SHA256 sign / verify, exercised with a THROWAWAY keypair generated in
// this process. The real AzeriCard keys must never appear in a test, a fixture,
// a snapshot or a log line, and nothing here reads an environment variable.
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decodeKeyMaterial,
  isHexSignature,
  MIN_RSA_MODULUS_BITS,
  rsaModulusBits,
  signMacSource,
  verifyMacSignature,
} from "../signing";
import { authMacSource, callbackMacSource } from "../mac";

function throwawayKeys(modulusLength = 2048) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

const KEYS = throwawayKeys();

const AUTH_SOURCE = authMacSource({
  AMOUNT: "11.48",
  CURRENCY: "USD",
  TERMINAL: "99999999",
  TRTYPE: "1",
  TIMESTAMP: "20030105153021",
  NONCE: "F2B2DD7E603A7ADA",
  MERCH_URL: "www.sample.com",
});

describe("sign / verify round trip", () => {
  it("signs to lowercase hex and verifies", () => {
    const signature = signMacSource(KEYS.privateKey, AUTH_SOURCE);
    expect(signature).toMatch(/^[0-9a-f]+$/);
    expect(signature.length).toBe(512); // 2048-bit signature, hex encoded
    expect(verifyMacSignature(KEYS.publicKey, AUTH_SOURCE, signature)).toBe(true);
  });

  it("accepts an UPPERCASE signature, as the spec allows", () => {
    const signature = signMacSource(KEYS.privateKey, AUTH_SOURCE);
    expect(verifyMacSignature(KEYS.publicKey, AUTH_SOURCE, signature.toUpperCase())).toBe(
      true,
    );
  });

  it("is deterministic for PKCS#1 v1.5, so the same input signs identically", () => {
    expect(signMacSource(KEYS.privateKey, AUTH_SOURCE)).toBe(
      signMacSource(KEYS.privateKey, AUTH_SOURCE),
    );
  });
});

describe("rejection", () => {
  const signature = signMacSource(KEYS.privateKey, AUTH_SOURCE);

  it("rejects a tampered signature", () => {
    const flipped =
      signature.slice(0, -1) + (signature.endsWith("a") ? "b" : "a");
    expect(verifyMacSignature(KEYS.publicKey, AUTH_SOURCE, flipped)).toBe(false);
  });

  it("rejects a signature over DIFFERENT data — one changed amount is enough", () => {
    const tamperedSource = authMacSource({
      AMOUNT: "11.49",
      CURRENCY: "USD",
      TERMINAL: "99999999",
      TRTYPE: "1",
      TIMESTAMP: "20030105153021",
      NONCE: "F2B2DD7E603A7ADA",
      MERCH_URL: "www.sample.com",
    });
    expect(verifyMacSignature(KEYS.publicKey, tamperedSource, signature)).toBe(false);
  });

  it("rejects a signature made by a DIFFERENT key", () => {
    const other = throwawayKeys();
    const otherSig = signMacSource(other.privateKey, AUTH_SOURCE);
    expect(verifyMacSignature(KEYS.publicKey, AUTH_SOURCE, otherSig)).toBe(false);
  });

  it("rejects non-hex, odd-length and empty signatures without throwing", () => {
    for (const bad of ["", "z".repeat(512), signature.slice(0, -1), "0", "  "]) {
      expect(verifyMacSignature(KEYS.publicKey, AUTH_SOURCE, bad)).toBe(false);
    }
    // Buffer.from(…, "hex") truncates silently at the first bad character, so
    // the shape check has to happen BEFORE it.
    expect(isHexSignature("00zz")).toBe(false);
    expect(isHexSignature("00FF")).toBe(true);
    expect(isHexSignature("0")).toBe(false);
  });

  it("rejects an unusable public key without throwing", () => {
    expect(verifyMacSignature("not a pem", AUTH_SOURCE, signature)).toBe(false);
    expect(verifyMacSignature("", AUTH_SOURCE, signature)).toBe(false);
  });

  it("throws a content-free error for an unusable private key", () => {
    // The message must never quote the key or OpenSSL's own text.
    expect(() => signMacSource("not a pem", AUTH_SOURCE)).toThrowError(
      "azericard: unusable private key",
    );
  });
});

describe("the callback field order is what gets verified", () => {
  it("a signature over the callback order does not verify against the auth order", () => {
    const cbSource = callbackMacSource({
      AMOUNT: "11.48",
      TERMINAL: "99999999",
      APPROVAL: "168975",
      RRN: "306276834930",
      INT_REF: "4A29E93C607E33DC",
    });
    const cbSig = signMacSource(KEYS.privateKey, cbSource);
    expect(verifyMacSignature(KEYS.publicKey, cbSource, cbSig)).toBe(true);
    expect(verifyMacSignature(KEYS.publicKey, AUTH_SOURCE, cbSig)).toBe(false);
  });
});

describe("key material handling", () => {
  it("reports the modulus size so a weak key is refused at configuration time", () => {
    expect(rsaModulusBits(KEYS.privateKey, "private")).toBe(2048);
    expect(rsaModulusBits(KEYS.publicKey, "public")).toBe(2048);
    expect(rsaModulusBits("not a pem", "public")).toBeNull();
    expect(MIN_RSA_MODULUS_BITS).toBe(2048);
  });

  it("decodes a base64-transported PEM", () => {
    const b64 = Buffer.from(KEYS.publicKey, "utf8").toString("base64");
    const decoded = decodeKeyMaterial(b64);
    expect(decoded).toContain("-----BEGIN PUBLIC KEY-----");
    expect(rsaModulusBits(decoded as string, "public")).toBe(2048);
  });

  it("accepts a raw PEM too, so a pasted file is not punished", () => {
    expect(decodeKeyMaterial(KEYS.publicKey)).toContain("-----BEGIN PUBLIC KEY-----");
  });

  it("repairs the two newline manglings an env editor produces", () => {
    const escaped = KEYS.publicKey.split("\n").join("\\n");
    const crlf = KEYS.publicKey.split("\n").join("\r\n");
    for (const variant of [escaped, crlf]) {
      const decoded = decodeKeyMaterial(variant);
      expect(decoded).not.toBeNull();
      expect(rsaModulusBits(decoded as string, "public")).toBe(2048);
    }
  });

  it("returns null — never a partial value — for junk", () => {
    expect(decodeKeyMaterial("")).toBeNull();
    expect(decodeKeyMaterial("   ")).toBeNull();
    expect(decodeKeyMaterial("aGVsbG8gd29ybGQ=")).toBeNull(); // base64 of "hello world"
  });
});
