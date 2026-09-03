// THE RECONCILE ROUTE'S DOOR.
//
// This endpoint grants and revokes access on nobody's behalf but a scheduler's,
// so the only thing standing between it and the internet is a shared secret. The
// two properties below are the ones whose absence is silent:
//
//   * CLOSED WHEN THE KEY IS UNSET. The dangerous failure is "unconfigured
//     therefore open" — a deployment that forgot the variable would expose a
//     sweep that talks to Apple and writes entitlements.
//   * A WRONG KEY IS REFUSED, with a comparison that does not leak its length by
//     timing.
//
// The route's secrets are read into module-level constants, so each case resets
// the module registry and imports it afresh with the environment it wants.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws on import by design; the route reaches it through wire.ts.
vi.mock("server-only", () => ({}));

// The wiring pulls in the App Store library, a signing key reader and the
// service-role client. None of that is what these tests are about, and a route
// guard must be provable without any of it.
const buildReconcileDeps = vi.fn(() => null);
vi.mock("../_lib/wire", () => ({
  buildReconcileDeps: () => buildReconcileDeps(),
  buildNotificationDeps: () => ({}),
  sandboxGrantsEnabled: () => false,
}));

const KEY = "a-long-reconcile-key-value";

async function loadRoute(env: { key?: string; cron?: string }) {
  vi.resetModules();
  if (env.key === undefined) delete process.env.PAYMENTS_RECONCILE_KEY;
  else process.env.PAYMENTS_RECONCILE_KEY = env.key;
  if (env.cron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = env.cron;
  return import("../reconcile/route");
}

function post(headers: Record<string, string> = {}): Request {
  return new Request("https://olympiq.ai/api/payments/apple/reconcile", {
    method: "POST",
    headers,
  });
}

function get(headers: Record<string, string> = {}): Request {
  return new Request("https://olympiq.ai/api/payments/apple/reconcile", {
    method: "GET",
    headers,
  });
}

const originalKey = process.env.PAYMENTS_RECONCILE_KEY;
const originalCron = process.env.CRON_SECRET;

beforeEach(() => {
  buildReconcileDeps.mockClear();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.PAYMENTS_RECONCILE_KEY;
  else process.env.PAYMENTS_RECONCILE_KEY = originalKey;
  if (originalCron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCron;
});

describe("POST /api/payments/apple/reconcile", () => {
  it("is CLOSED when PAYMENTS_RECONCILE_KEY is unset", async () => {
    const route = await loadRoute({});
    // Not merely "no key supplied" — an unset secret must refuse a caller who
    // supplies the empty string, or unconfigured would mean open.
    const attempts: Record<string, string>[] = [
      {},
      { "x-reconcile-key": "" },
      { "x-reconcile-key": "anything" },
    ];
    for (const headers of attempts) {
      const response = await route.POST(post(headers));
      expect(response.status).toBe(401);
    }
    expect(buildReconcileDeps).not.toHaveBeenCalled();
  });

  it("refuses a wrong key", async () => {
    const route = await loadRoute({ key: KEY });
    for (const supplied of ["", "wrong", `${KEY}x`, KEY.slice(0, -1), KEY.toUpperCase()]) {
      const response = await route.POST(post({ "x-reconcile-key": supplied }));
      expect(response.status).toBe(401);
    }
    expect(buildReconcileDeps).not.toHaveBeenCalled();
  });

  it("runs the sweep for the right key", async () => {
    const route = await loadRoute({ key: KEY });
    const response = await route.POST(post({ "x-reconcile-key": KEY }));

    expect(response.status).toBe(200);
    expect(buildReconcileDeps).toHaveBeenCalledTimes(1);
    // Not configured for Apple IAP: the sweep reports that it did nothing rather
    // than asking Apple questions it cannot sign.
    await expect(response.json()).resolves.toEqual({
      candidates: 0,
      queried: 0,
      granted: 0,
      revoked: 0,
      unresolved: 0,
      unattributable: 0,
    });
  });

  it("never puts an identifier in the response body", async () => {
    const route = await loadRoute({ key: KEY });
    const body = await (await route.POST(post({ "x-reconcile-key": KEY }))).text();
    // Counts only. This endpoint answers on a schedule forever, and a
    // transaction id in its body is a detail that has no business leaving the
    // server.
    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(Object.values(JSON.parse(body)).every((v) => typeof v === "number")).toBe(true);
  });
});

describe("GET /api/payments/apple/reconcile (Vercel Cron)", () => {
  it("is CLOSED when CRON_SECRET is unset", async () => {
    const route = await loadRoute({ key: KEY });
    const attempts: Record<string, string>[] = [
      {},
      { authorization: "Bearer " },
      { authorization: "Bearer x" },
    ];
    for (const headers of attempts) {
      expect((await route.GET(get(headers))).status).toBe(401);
    }
    expect(buildReconcileDeps).not.toHaveBeenCalled();
  });

  it("refuses a wrong bearer and accepts the right one", async () => {
    const route = await loadRoute({ key: KEY, cron: "cron-secret-value" });
    expect((await route.GET(get({ authorization: "Bearer nope" }))).status).toBe(401);
    // The scheme is part of the comparison: a bare secret is not a bearer token.
    expect((await route.GET(get({ authorization: "cron-secret-value" }))).status).toBe(401);
    expect(
      (await route.GET(get({ authorization: "Bearer cron-secret-value" }))).status,
    ).toBe(200);
  });

  it("does not accept the reconcile key on the cron door, or the reverse", async () => {
    // Two doors, two secrets. Neither may be a spare for the other.
    const route = await loadRoute({ key: KEY, cron: "cron-secret-value" });
    expect((await route.GET(get({ authorization: `Bearer ${KEY}` }))).status).toBe(401);
    expect(
      (await route.POST(post({ "x-reconcile-key": "cron-secret-value" }))).status,
    ).toBe(401);
  });
});
