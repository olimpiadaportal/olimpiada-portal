// ES256 JWS parsing and signature verification, exercised with a THROWAWAY
// P-256 keypair generated in this process.
//
// No network, no fixture file, no Apple key: the fixtures are BUILT here, so a
// "known-good" payload is known-good because this file signed it, and a
// "tampered" payload is tampered because this file changed a byte of it.
//
// Certificate-CHAIN validation is not tested here because it is not implemented
// here — it belongs to Apple's `SignedDataVerifier` (see `verifier.ts`). What is
// tested is everything around it that we do own.
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  base64UrlDecode,
  base64UrlEncode,
  decodeJwsUnverified,
  JWS_MAX_BYTES,
  leafCertificatePem,
  parseCompactJws,
  verifyJwsEs256,
} from "../jws";
import { signAppStoreJwt } from "../jwt";

function throwawayEcKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

const KEYS = throwawayEcKeys();
const OTHER_KEYS = throwawayEcKeys();

/** Build a compact JWS the way Apple does: ES256 over `header.payload`, raw R||S. */
function signJws(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKeyPem: string,
): string {
  const h = base64UrlEncode(JSON.stringify(header));
  const p = base64UrlEncode(JSON.stringify(payload));
  const signature = cryptoSign("sha256", Buffer.from(`${h}.${p}`, "ascii"), {
    key: privateKeyPem,
    dsaEncoding: "ieee-p1363",
  });
  return `${h}.${p}.${base64UrlEncode(signature)}`;
}

const HEADER = { alg: "ES256", x5c: ["QUJDRA=="] };
const PAYLOAD = {
  environment: "Production",
  bundleId: "ai.olympiq.app",
  transactionId: "2000000900000001",
};
const GOOD = signJws(HEADER, PAYLOAD, KEYS.privateKey);

describe("known-good", () => {
  it("verifies against the signing key", () => {
    expect(verifyJwsEs256(GOOD, KEYS.publicKey)).toBe(true);
  });

  it("parses into header, signing input and a 64-byte raw signature", () => {
    const parsed = parseCompactJws(GOOD);
    expect(parsed).not.toBeNull();
    expect(parsed!.header.alg).toBe("ES256");
    expect(parsed!.signature.length).toBe(64);
    expect(parsed!.signingInput).toBe(GOOD.split(".").slice(0, 2).join("."));
  });

  it("decodes the payload for routing, clearly marked unverified", () => {
    const decoded = decodeJwsUnverified<{ environment: string }>(GOOD);
    expect(decoded?.payload.environment).toBe("Production");
  });
});

describe("tampered", () => {
  const [goodHeader, goodPayload, goodSignature] = GOOD.split(".");

  it("fails when the payload is re-pointed at another app", () => {
    // The exact attack this module exists to stop: a genuine Apple transaction
    // edited to name a different bundle, or a different amount.
    const decoded = JSON.parse(base64UrlDecode(goodPayload)!.toString("utf8")) as Record<
      string,
      unknown
    >;
    decoded.bundleId = "com.attacker.app";
    const forged = `${goodHeader}.${base64UrlEncode(JSON.stringify(decoded))}.${goodSignature}`;
    expect(forged).not.toBe(GOOD);
    expect(verifyJwsEs256(forged, KEYS.publicKey)).toBe(false);
  });

  it("fails when the header's certificate chain is swapped", () => {
    const forgedHeader = base64UrlEncode(JSON.stringify({ alg: "ES256", x5c: ["WFlaWg=="] }));
    expect(verifyJwsEs256(`${forgedHeader}.${goodPayload}.${goodSignature}`, KEYS.publicKey)).toBe(
      false,
    );
  });

  it("fails when a signature byte is flipped", () => {
    const raw = base64UrlDecode(goodSignature)!;
    raw[0] = raw[0] ^ 0xff;
    expect(
      verifyJwsEs256(`${goodHeader}.${goodPayload}.${base64UrlEncode(raw)}`, KEYS.publicKey),
    ).toBe(false);
  });

  it("fails against a DIFFERENT key, however well-formed the message is", () => {
    expect(verifyJwsEs256(GOOD, OTHER_KEYS.publicKey)).toBe(false);
  });

  it("fails when `alg` is downgraded to none, even with everything else intact", () => {
    const forgedHeader = base64UrlEncode(JSON.stringify({ alg: "none", x5c: ["QUJDRA=="] }));
    expect(verifyJwsEs256(`${forgedHeader}.${goodPayload}.${goodSignature}`, KEYS.publicKey)).toBe(
      false,
    );
  });

  it("fails when a payload signed by an attacker's key is presented", () => {
    const attacker = signJws(HEADER, { ...PAYLOAD, bundleId: "com.attacker.app" }, OTHER_KEYS.privateKey);
    expect(verifyJwsEs256(attacker, KEYS.publicKey)).toBe(false);
    // ... and verifies under the attacker's own key, which is exactly why key
    // trust has to come from the certificate chain and not from the message.
    expect(verifyJwsEs256(attacker, OTHER_KEYS.publicKey)).toBe(true);
  });
});

describe("malformed input is refused rather than interpreted", () => {
  it("rejects the wrong number of segments", () => {
    for (const bad of ["", "a", "a.b", "a.b.c.d"]) {
      expect(parseCompactJws(bad)).toBeNull();
      expect(verifyJwsEs256(bad, KEYS.publicKey)).toBe(false);
    }
  });

  it("rejects non-base64url characters instead of silently truncating", () => {
    // Buffer.from(…, "base64url") stops at the first invalid character, which
    // would turn "not base64 at all" into "a short buffer that simply fails" —
    // the same outcome today, a lie in any future log line.
    expect(base64UrlDecode("abc!def")).toBeNull();
    expect(base64UrlDecode("has spaces")).toBeNull();
    expect(base64UrlDecode("")).toBeNull();
  });

  it("rejects a DER signature, the default Node produces if you forget ieee-p1363", () => {
    const h = base64UrlEncode(JSON.stringify({ alg: "ES256" }));
    const p = base64UrlEncode(JSON.stringify({ ok: true }));
    const der = cryptoSign("sha256", Buffer.from(`${h}.${p}`, "ascii"), KEYS.privateKey);
    expect(der.length).not.toBe(64);
    expect(parseCompactJws(`${h}.${p}.${base64UrlEncode(der)}`)).toBeNull();
  });

  it("rejects a payload that is not JSON", () => {
    const h = base64UrlEncode(JSON.stringify({ alg: "ES256" }));
    const p = base64UrlEncode("not json at all");
    expect(parseCompactJws(`${h}.${p}.${base64UrlEncode(Buffer.alloc(64))}`)).toBeNull();
  });

  it("refuses anything over the size cap without decoding it", () => {
    const huge = `${"a".repeat(JWS_MAX_BYTES + 1)}.b.c`;
    expect(parseCompactJws(huge)).toBeNull();
    expect(decodeJwsUnverified(huge)).toBeNull();
  });

  it("survives values that are not strings at all", () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(parseCompactJws(bad as unknown as string)).toBeNull();
      expect(verifyJwsEs256(bad as unknown as string, KEYS.publicKey)).toBe(false);
    }
  });

  it("survives a public key that is not a key", () => {
    expect(verifyJwsEs256(GOOD, "-----BEGIN PUBLIC KEY-----\nnope\n-----END PUBLIC KEY-----")).toBe(
      false,
    );
  });
});

describe("leaf certificate extraction", () => {
  it("wraps x5c[0] as PEM at 64 columns", () => {
    const der = Buffer.alloc(120, 7).toString("base64");
    const pem = leafCertificatePem({ x5c: [der] });
    expect(pem).not.toBeNull();
    expect(pem!.startsWith("-----BEGIN CERTIFICATE-----\n")).toBe(true);
    expect(pem!.trimEnd().endsWith("-----END CERTIFICATE-----")).toBe(true);
    for (const line of pem!.split("\n").slice(1, -2)) {
      expect(line.length).toBeLessThanOrEqual(64);
    }
  });

  it("returns null for a missing, empty or non-base64 chain", () => {
    expect(leafCertificatePem({})).toBeNull();
    expect(leafCertificatePem({ x5c: [] })).toBeNull();
    expect(leafCertificatePem({ x5c: "not-an-array" })).toBeNull();
    expect(leafCertificatePem({ x5c: [""] })).toBeNull();
    expect(leafCertificatePem({ x5c: ["not base64 !!"] })).toBeNull();
    expect(leafCertificatePem({ x5c: [123] })).toBeNull();
  });

  it("caps the certificate size", () => {
    expect(leafCertificatePem({ x5c: ["A".repeat(9000)] })).toBeNull();
  });
});

describe("the JWT this repo mints is itself a valid JWS", () => {
  it("round-trips through the verifier, proving both use raw R||S", () => {
    const token = signAppStoreJwt(KEYS.privateKey, {
      issuerId: "57246542-96fe-1a63-e053-0824d011072a",
      keyId: "ABCDEFGHIJ",
      bundleId: "ai.olympiq.app",
    });
    expect(verifyJwsEs256(token, KEYS.publicKey)).toBe(true);
    expect(verifyJwsEs256(token, OTHER_KEYS.publicKey)).toBe(false);
  });
});
