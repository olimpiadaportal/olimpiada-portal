// The RTDN endpoint's shell: CLOSED unless configured, and the push is
// authenticated BEFORE the body is read.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let rateAllowed = true;
vi.mock("@/lib/rateLimit", () => ({ rateLimitAllow: () => rateAllowed }));
// The default wiring reaches the database and Google; every test passes its own.
vi.mock("@/app/api/payments/google/_lib/wire", () => ({ buildGoogleNotificationDeps: () => null }));

const { serveGoogleNotification } = await import("@/app/api/payments/google/_lib/notificationRoute");
type Shell = Parameters<typeof serveGoogleNotification>[1] & object;

const AUTH = { audience: "https://olympiq.ai/api/payments/google/notifications", serviceAccountEmail: "push@p.iam.gserviceaccount.com" };

function req(headers: Record<string, string> = { authorization: "Bearer good.token.sig" }) {
  const text = vi.fn(async () => "{}");
  return { request: { text, headers: new Headers(headers) } as unknown as Request, text };
}

let handled = 0;
const verifiedTokens: string[] = [];
function shell(over: Partial<NonNullable<Shell>> = {}): NonNullable<Shell> {
  return {
    authConfig: () => AUTH,
    verifyToken: async (token) =>
      (verifiedTokens.push(token), token === "good.token.sig" ? { ok: true, claims: {} } : { ok: false, reason: "signature" }),
    buildDeps: () => ({}) as never,
    handle: async () => (handled++, { status: 200, outcome: "granted" }),
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  rateAllowed = true;
  handled = 0;
  verifiedTokens.length = 0;
});

describe("the RTDN push endpoint", () => {
  it("is CLOSED (503) while the push audience / account are unset — and reads nothing", async () => {
    const { request, text } = req();
    const res = await serveGoogleNotification(request, shell({ authConfig: () => null }));
    expect(res.status).toBe(503);
    expect(text).not.toHaveBeenCalled();
    expect(verifiedTokens).toHaveLength(0);
    expect(handled).toBe(0);
  });

  it("refuses a push with no bearer token before reading the body", async () => {
    const { request, text } = req({});
    const res = await serveGoogleNotification(request, shell());
    expect(res.status).toBe(401);
    expect(text).not.toHaveBeenCalled();
  });

  it("refuses a token that does not verify before reading the body", async () => {
    const { request, text } = req({ authorization: "Bearer forged.token.sig" });
    const res = await serveGoogleNotification(request, shell());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
    expect(text).not.toHaveBeenCalled();
    expect(handled).toBe(0);
  });

  it("answers 503 for an authenticated push while the Play API is unconfigured", async () => {
    const { request } = req();
    const res = await serveGoogleNotification(request, shell({ buildDeps: () => null }));
    expect(res.status).toBe(503);
    expect(handled).toBe(0);
  });

  it("hands an authenticated push to the core and says nothing about the outcome", async () => {
    const { request } = req();
    const res = await serveGoogleNotification(request, shell());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(handled).toBe(1);
  });

  it("is rate limited before anything else", async () => {
    rateAllowed = false;
    const { request, text } = req();
    const res = await serveGoogleNotification(request, shell());
    expect(res.status).toBe(429);
    expect(text).not.toHaveBeenCalled();
  });
});
