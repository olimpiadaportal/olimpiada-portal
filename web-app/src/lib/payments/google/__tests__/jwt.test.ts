// The two JWTs of the Google rail, pinned: the service-account assertion we SIGN
// (RS256, the claims Google's token endpoint requires) and the Pub/Sub OIDC
// token we VERIFY (RS256 against Google's key, issuer, OUR audience, OUR
// service account, the validity window). Throwaway keys generated here; the
// real key never has to exist for the suite to run.
import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ANDROID_PUBLISHER_SCOPE,
  GOOGLE_OAUTH_TOKEN_URL,
  base64UrlDecode,
  base64UrlEncode,
  publicKeyFromJwk,
  signServiceAccountJwt,
  verifyGoogleOidcToken,
} from "@/lib/payments/google/jwt";

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);

function decode(segment: string): Record<string, unknown> {
  return JSON.parse(base64UrlDecode(segment)!.toString("utf8")) as Record<string, unknown>;
}

describe("the service-account assertion", () => {
  const token = signServiceAccountJwt(
    PEM,
    { clientEmail: "play@olympiq.iam.gserviceaccount.com", privateKeyId: "abc123", scope: ANDROID_PUBLISHER_SCOPE },
    { nowMs: NOW },
  );
  const [h, p, s] = token.split(".") as [string, string, string];

  it("is RS256 and names the key id", () => {
    expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT", kid: "abc123" });
  });

  it("carries exactly the claims Google's token endpoint requires", () => {
    const iat = Math.floor(NOW / 1000);
    expect(decode(p)).toEqual({
      iss: "play@olympiq.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat,
      exp: iat + 3600,
    });
  });

  it("is pinned to Google's token endpoint", () => {
    expect(GOOGLE_OAUTH_TOKEN_URL).toBe("https://oauth2.googleapis.com/token");
  });

  it("verifies with the matching public key (PKCS#1 v1.5, SHA-256)", () => {
    const ok = cryptoVerify("sha256", Buffer.from(`${h}.${p}`, "ascii"), rsa.publicKey, base64UrlDecode(s)!);
    expect(ok).toBe(true);
  });

  it("omits kid when the key file has none", () => {
    const t = signServiceAccountJwt(PEM, { clientEmail: "a@b.co", privateKeyId: null, scope: "x" }, { nowMs: NOW });
    expect(decode(t.split(".")[0]!)).toEqual({ alg: "RS256", typ: "JWT" });
  });

  it("refuses a lifetime Google would reject", () => {
    expect(() =>
      signServiceAccountJwt(PEM, { clientEmail: "a@b.co", privateKeyId: null, scope: "x" }, { lifetimeSeconds: 3601 }),
    ).toThrow();
  });

  it("refuses a non-RSA key without quoting it", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const ecPem = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => signServiceAccountJwt(ecPem, { clientEmail: "a@b.co", privateKeyId: null, scope: "x" })).toThrow(
      "google: service-account key is not an RSA key",
    );
  });
});

// ---------------------------------------------------------------------------

const AUD = "https://olympiq.ai/api/payments/google/notifications";
const EMAIL = "rtdn-push@olympiq.iam.gserviceaccount.com";
const KID = "google-key-1";

function oidc(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: KID, typ: "JWT" },
  key = rsa.privateKey,
): string {
  const input = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  return `${input}.${base64UrlEncode(cryptoSign("sha256", Buffer.from(input, "ascii"), key))}`;
}

const iat = Math.floor(NOW / 1000);
const good = {
  iss: "https://accounts.google.com",
  aud: AUD,
  email: EMAIL,
  email_verified: true,
  iat,
  exp: iat + 3600,
  sub: "1234567890",
};
const resolver = async (kid: string) => (kid === KID ? rsa.publicKey : null);
const expectation = { audience: AUD, email: EMAIL, nowMs: NOW };

describe("verifying the Pub/Sub push token", () => {
  it("accepts a genuine token", async () => {
    const r = await verifyGoogleOidcToken(oidc(good), expectation, resolver);
    expect(r.ok).toBe(true);
  });

  it("accepts the short issuer spelling Google also uses", async () => {
    const r = await verifyGoogleOidcToken(oidc({ ...good, iss: "accounts.google.com" }), expectation, resolver);
    expect(r.ok).toBe(true);
  });

  const refusals: [string, string, () => string][] = [
    ["another audience", "audience", () => oidc({ ...good, aud: "https://evil.example/" })],
    ["another service account", "email", () => oidc({ ...good, email: "someone@else.iam.gserviceaccount.com" })],
    ["an unverified email", "email", () => oidc({ ...good, email_verified: false })],
    ["another issuer", "issuer", () => oidc({ ...good, iss: "https://evil.example" })],
    ["an expired token", "expired", () => oidc({ ...good, iat: iat - 7200, exp: iat - 3600 })],
    ["a token from the future", "not_yet_valid", () => oidc({ ...good, iat: iat + 3600, exp: iat + 7200 })],
    ["alg none", "alg", () => oidc(good, { alg: "none", kid: KID })],
    ["alg HS256", "alg", () => oidc(good, { alg: "HS256", kid: KID })],
    ["an unknown key id", "unknown_kid", () => oidc(good, { alg: "RS256", kid: "nope" })],
    [
      "a signature by another key",
      "signature",
      () => oidc(good, undefined, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey),
    ],
    ["garbage", "malformed", () => "not.a.jwt.at.all"],
  ];

  for (const [name, reason, make] of refusals) {
    it(`refuses ${name}`, async () => {
      const r = await verifyGoogleOidcToken(make(), expectation, resolver);
      expect(r).toEqual({ ok: false, reason });
    });
  }

  it("refuses a body whose claims were edited after signing", async () => {
    const [h, , s] = oidc(good).split(".");
    const forged = `${h}.${base64UrlEncode(JSON.stringify({ ...good, aud: AUD }))}x.${s}`;
    const r = await verifyGoogleOidcToken(forged, expectation, resolver);
    expect(r.ok).toBe(false);
  });

  it("builds a verifying key from a JWKS entry and refuses a non-RSA one", () => {
    const jwk = rsa.publicKey.export({ format: "jwk" });
    expect(publicKeyFromJwk({ ...jwk, kid: KID, alg: "RS256", use: "sig" })).not.toBeNull();
    expect(publicKeyFromJwk({ kty: "EC", crv: "P-256", x: "a", y: "b" })).toBeNull();
    expect(publicKeyFromJwk({ ...jwk, alg: "HS256" })).toBeNull();
  });
});
