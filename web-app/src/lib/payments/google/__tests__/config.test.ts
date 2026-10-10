// The Google Play configuration: accepts the key as raw JSON or base64, fails
// CLOSED with the variable's NAME (never its value) when unset or malformed.
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  describeGooglePlayConfigProblems,
  describeRtdnConfigProblems,
  getGooglePlayConfig,
  getRtdnAuthConfig,
  parseServiceAccountJson,
  resetGooglePlayConfigCacheForTests,
  testGrantsEnabled,
} = await import("@/lib/payments/google/config");

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY_JSON = JSON.stringify({
  type: "service_account",
  project_id: "olympiq-play",
  private_key_id: "0123456789abcdef",
  private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  client_email: "play-api@olympiq-play.iam.gserviceaccount.com",
  token_uri: "https://evil.example/token",
});

const VARS = [
  "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  "GOOGLE_PLAY_PACKAGE_NAME",
  "GOOGLE_PLAY_RTDN_AUDIENCE",
  "GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT",
  "GOOGLE_PLAY_TEST_GRANTS",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const v of VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
  resetGooglePlayConfigCacheForTests();
});
afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
  resetGooglePlayConfigCacheForTests();
});

describe("the service account key", () => {
  it("parses raw JSON and base64 of it identically", () => {
    const raw = parseServiceAccountJson(KEY_JSON);
    const b64 = parseServiceAccountJson(Buffer.from(KEY_JSON).toString("base64"));
    expect(raw?.clientEmail).toBe("play-api@olympiq-play.iam.gserviceaccount.com");
    expect(raw?.privateKeyId).toBe("0123456789abcdef");
    expect(b64).toEqual(raw);
  });

  it("refuses something that is not a service-account key", () => {
    expect(parseServiceAccountJson("{}")).toBeNull();
    expect(parseServiceAccountJson(JSON.stringify({ ...JSON.parse(KEY_JSON), type: "authorized_user" }))).toBeNull();
    expect(parseServiceAccountJson(JSON.stringify({ ...JSON.parse(KEY_JSON), private_key: "nope" }))).toBeNull();
    expect(parseServiceAccountJson("not json at all")).toBeNull();
  });
});

describe("failing closed, by name", () => {
  it("names the missing variable and never a value", () => {
    expect(describeGooglePlayConfigProblems()).toEqual(["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing"]);
    expect(getGooglePlayConfig()).toBeNull();
  });

  it("reports a malformed key by name only", () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account","private_key":"SECRET-BYTES"}';
    const problems = describeGooglePlayConfigProblems();
    expect(problems).toEqual(["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON malformed"]);
    expect(JSON.stringify(problems)).not.toContain("SECRET");
  });

  it("is usable with a key, defaulting the package name", () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = KEY_JSON;
    expect(getGooglePlayConfig()).toEqual({
      packageName: "ai.olympiq.app",
      clientEmail: "play-api@olympiq-play.iam.gserviceaccount.com",
      privateKeyId: "0123456789abcdef",
    });
  });

  it("closes the RTDN endpoint unless BOTH push variables are set", () => {
    expect(describeRtdnConfigProblems()).toEqual([
      "GOOGLE_PLAY_RTDN_AUDIENCE missing",
      "GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT missing",
    ]);
    expect(getRtdnAuthConfig()).toBeNull();
    process.env.GOOGLE_PLAY_RTDN_AUDIENCE = "https://olympiq.ai/api/payments/google/notifications";
    expect(getRtdnAuthConfig()).toBeNull();
    process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT = "RTDN-Push@olympiq-play.iam.gserviceaccount.com";
    expect(getRtdnAuthConfig()).toEqual({
      audience: "https://olympiq.ai/api/payments/google/notifications",
      serviceAccountEmail: "rtdn-push@olympiq-play.iam.gserviceaccount.com",
    });
  });

  it("grants test purchases unless switched off", () => {
    expect(testGrantsEnabled()).toBe(true);
    process.env.GOOGLE_PLAY_TEST_GRANTS = "off";
    expect(testGrantsEnabled()).toBe(false);
  });
});
