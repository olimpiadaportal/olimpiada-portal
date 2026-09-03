// The App Store Server API bearer token, signed with a THROWAWAY P-256 key
// generated in this process. The real in-app-purchase key must never appear in
// a test, a fixture, a snapshot or a log line, and nothing here reads an
// environment variable.
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  APP_STORE_JWT_AUDIENCE,
  APP_STORE_JWT_DEFAULT_LIFETIME_SECONDS,
  APP_STORE_JWT_MAX_LIFETIME_SECONDS,
  loadEs256PrivateKey,
  signAppStoreJwt,
} from "../jwt";
import { base64UrlDecode, verifyJwsEs256 } from "../jws";

function ecKeys(namedCurve = "prime256v1") {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

const KEYS = ecKeys();
const CLAIMS = {
  issuerId: "57246542-96fe-1a63-e053-0824d011072a",
  keyId: "ABCDEFGHIJ",
  bundleId: "ai.olympiq.app",
} as const;

/** Fixed clock so `iat`/`exp` are assertions rather than approximations. */
const NOW_MS = Date.parse("2026-08-31T12:00:00.000Z");

function decodeSegment(token: string, index: 0 | 1): Record<string, unknown> {
  const raw = base64UrlDecode(token.split(".")[index])!;
  return JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
}

describe("the claims Apple requires", () => {
  const token = signAppStoreJwt(KEYS.privateKey, CLAIMS, { nowMs: NOW_MS });

  it("puts alg, kid and typ in the header", () => {
    expect(decodeSegment(token, 0)).toEqual({ alg: "ES256", kid: "ABCDEFGHIJ", typ: "JWT" });
  });

  it("puts iss, iat, exp, aud and bid in the payload", () => {
    const iat = Math.floor(NOW_MS / 1000);
    expect(decodeSegment(token, 1)).toEqual({
      iss: CLAIMS.issuerId,
      iat,
      exp: iat + APP_STORE_JWT_DEFAULT_LIFETIME_SECONDS,
      aud: APP_STORE_JWT_AUDIENCE,
      bid: CLAIMS.bundleId,
    });
  });

  it("audiences to appstoreconnect-v1, which is constant for every environment", () => {
    expect(APP_STORE_JWT_AUDIENCE).toBe("appstoreconnect-v1");
  });

  it("verifies under the signing key and not under another", () => {
    expect(verifyJwsEs256(token, KEYS.publicKey)).toBe(true);
    expect(verifyJwsEs256(token, ecKeys().publicKey)).toBe(false);
  });

  it("signs raw R||S, not DER — a DER token is silently rejected by Apple", () => {
    const signature = base64UrlDecode(token.split(".")[2])!;
    expect(signature.length).toBe(64);
  });
});

describe("lifetime", () => {
  it("honours an explicit lifetime", () => {
    const token = signAppStoreJwt(KEYS.privateKey, CLAIMS, { nowMs: NOW_MS, lifetimeSeconds: 60 });
    const payload = decodeSegment(token, 1);
    expect((payload.exp as number) - (payload.iat as number)).toBe(60);
  });

  it("refuses to exceed Apple's 20-minute cap", () => {
    expect(APP_STORE_JWT_MAX_LIFETIME_SECONDS).toBe(1200);
    expect(() =>
      signAppStoreJwt(KEYS.privateKey, CLAIMS, {
        lifetimeSeconds: APP_STORE_JWT_MAX_LIFETIME_SECONDS + 1,
      }),
    ).toThrow();
  });

  it("refuses a zero, negative or fractional lifetime", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => signAppStoreJwt(KEYS.privateKey, CLAIMS, { lifetimeSeconds: bad })).toThrow();
    }
  });
});

describe("the key must be the right kind of key", () => {
  it("accepts a P-256 key", () => {
    expect(loadEs256PrivateKey(KEYS.privateKey).asymmetricKeyType).toBe("ec");
  });

  it("refuses an EC key on the wrong curve", () => {
    // Signs happily, produces a token Apple answers with a bare 401.
    expect(() => loadEs256PrivateKey(ecKeys("secp384r1").privateKey)).toThrow();
  });

  it("refuses an RSA key from the same App Store Connect page", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    expect(() => loadEs256PrivateKey(privateKey)).toThrow();
  });

  it("refuses garbage", () => {
    for (const bad of ["", "not a key", "-----BEGIN PRIVATE KEY-----\nzz\n-----END PRIVATE KEY-----"]) {
      expect(() => loadEs256PrivateKey(bad)).toThrow();
    }
  });
});

describe("the private key never leaves this module", () => {
  const token = signAppStoreJwt(KEYS.privateKey, CLAIMS, { nowMs: NOW_MS });

  it("does not appear in the token", () => {
    // The whole PEM, and every base64 line of it independently — a partial leak
    // of a P-256 key is still a leak.
    expect(token).not.toContain(KEYS.privateKey);
    for (const line of KEYS.privateKey.split("\n")) {
      if (line.length > 16 && !line.startsWith("-----")) expect(token).not.toContain(line);
    }
  });

  it("does not appear in any thrown error", () => {
    for (const bad of [1.5, -1, APP_STORE_JWT_MAX_LIFETIME_SECONDS + 1]) {
      let caught: unknown;
      try {
        signAppStoreJwt(KEYS.privateKey, CLAIMS, { lifetimeSeconds: bad });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      const text = `${(caught as Error).message}\n${(caught as Error).stack ?? ""}`;
      expect(text).not.toContain("BEGIN PRIVATE KEY");
      for (const line of KEYS.privateKey.split("\n")) {
        if (line.length > 16 && !line.startsWith("-----")) expect(text).not.toContain(line);
      }
    }
  });

  it("throws a content-free error when the key itself is unusable", () => {
    let caught: unknown;
    try {
      signAppStoreJwt("-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----", CLAIMS);
    } catch (error) {
      caught = error;
    }
    // Never the OpenSSL text, which can quote key bytes.
    expect((caught as Error).message).toBe("apple: unusable in-app-purchase private key");
  });
});
