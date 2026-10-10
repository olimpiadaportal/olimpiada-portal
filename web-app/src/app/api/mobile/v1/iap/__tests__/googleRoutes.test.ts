// THE THREE PARENT-FACING GOOGLE PLAY ENDPOINTS, pinned at the route layer —
// the twin of routes.test.ts. What is asserted is the ORDER and the ARGUMENTS:
// authorize before the body is read, pass the ownership arguments to the
// writer, never leak an internal code, and bind a restore to the child Google's
// own record names. The writer is mocked here; it is pinned in
// lib/payments/google/__tests__/grantEntitlement.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PARENT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const CHILD = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const INTENT = "11111111-1111-4111-8111-111111111111";
const SUBJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const GRADE = "cccccccc-3333-4333-8333-cccccccccccc";
const MATH_MONTH = "ai.olympiq.app.sub.math.month";
const TOKEN = "tokentokentoken.AO-J1Oy_ExampleValue-0001";

let bearerParent: { profileId: string; authUserId: string } | null = null;
vi.mock("@/lib/auth/mobileBearer", () => ({ resolveBearerParent: async () => bearerParent }));

let owns = true;
vi.mock("@/lib/auth/subscriptionCore", () => ({ ownsChildCore: async () => owns }));

let rateAllowed = true;
const rateScopes: string[] = [];
vi.mock("@/lib/rateLimit", () => ({
  rateLimitAllow: (scope: string) => (rateScopes.push(scope), rateAllowed),
}));

let configured = true;
vi.mock("@/lib/payments/google/config", () => ({
  getGooglePlayConfig: () => (configured ? { packageName: "ai.olympiq.app", clientEmail: "x@y.co", privateKeyId: null } : null),
}));

let liveEntitlement: boolean | null = false;
vi.mock("@/lib/payments/iap/liveEntitlement", () => ({ hasLiveEntitlement: async () => liveEntitlement }));

type Product = { id: string; scope: "subject" | "olympiad_package"; subjectId: string | null; packageId: string | null; gradeId: string | null; interval: "month" | null; active: boolean };
let product: Product | null = null;
const productLookups: string[] = [];
const requeryCalls: [string, string][] = [];
const grantArgs: Record<string, unknown>[] = [];
let requeryResult: Record<string, unknown> = { ok: true };
let grantResult: Record<string, unknown> | ((a: Record<string, unknown>) => unknown) = {};

vi.mock("@/lib/payments/google/grantEntitlement", () => ({
  findAndroidProduct: async (id: string) => (productLookups.push(id), product),
  requeryPlayPurchase: async (productId: string, token: string) => {
    requeryCalls.push([productId, token]);
    return requeryResult.ok === true
      ? { ok: true, purchase: { source: "requery", productId, purchaseToken: token, purchase: {} } }
      : requeryResult;
  },
  grantGoogleEntitlement: async (args: Record<string, unknown>) => {
    grantArgs.push(args);
    return typeof grantResult === "function" ? grantResult(args) : grantResult;
  },
}));

type Row = Record<string, unknown>;
let paymentsDisabled = false;
const inserts: Row[] = [];
function builder(table: string) {
  let payload: Row = {};
  let inserting = false;
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: Row) => ((inserting = true), (payload = v), b),
    eq: () => b,
    limit: () => b,
    single: async () => {
      if (!inserting) return { data: null, error: { code: "PGRST116" } };
      inserts.push(payload);
      return { data: { id: INTENT, expires_at: "2026-10-17T00:00:00.000Z" }, error: null };
    },
    maybeSingle: async () => (table === "students" ? { data: { grade_id: GRADE }, error: null } : { data: null, error: null }),
  };
  return b as never;
}
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string) => {
      if (fn === "assert_payments_enabled") {
        return paymentsDisabled ? { data: null, error: { code: "23514", hint: "payments_disabled" } } : { data: null, error: null };
      }
      if (fn === "is_free_access_active_for_student") return { data: false, error: null };
      if (fn === "subject_taught_to_grade") return { data: true, error: null };
      return { data: null, error: { code: "42883" } };
    },
  }),
  isServiceRoleConfigured: true,
}));

const { POST: intentPost } = await import("@/app/api/mobile/v1/iap/google/intent/route");
const { POST: redeemPost } = await import("@/app/api/mobile/v1/iap/google/redeem/route");
const { POST: restorePost } = await import("@/app/api/mobile/v1/iap/google/restore/route");

function req(body: unknown): Request & { text: ReturnType<typeof vi.fn> } {
  const text = vi.fn(async () => JSON.stringify(body));
  return { text, headers: new Headers() } as unknown as Request & { text: ReturnType<typeof vi.fn> };
}
async function payload(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const granted = {
  ok: true,
  granted: true,
  environment: "Production",
  entitlementId: "ent-1",
  alreadyGranted: false,
  intentId: INTENT,
  studentProfileId: CHILD,
  scope: "subject",
  productId: MATH_MONTH,
  externalRef: "gp:GPA.1",
  endsAt: "2026-11-10T09:00:00.000Z",
  consumed: true,
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  bearerParent = { profileId: PARENT, authUserId: "auth-1" };
  owns = true;
  rateAllowed = true;
  configured = true;
  paymentsDisabled = false;
  liveEntitlement = false;
  product = { id: "p1", scope: "subject", subjectId: SUBJECT, packageId: null, gradeId: null, interval: "month", active: true };
  requeryResult = { ok: true };
  grantResult = granted;
  for (const a of [rateScopes, productLookups, requeryCalls, grantArgs, inserts] as unknown[][]) a.length = 0;
});

describe("authorization happens before the body is read", () => {
  const routes: [string, (r: Request) => Promise<Response>, unknown][] = [
    ["intent", intentPost, { student_profile_id: CHILD, product_id: MATH_MONTH }],
    ["redeem", redeemPost, { intent_id: INTENT, product_id: MATH_MONTH, purchase_token: TOKEN }],
    ["restore", restorePost, { purchases: [{ product_id: MATH_MONTH, purchase_token: TOKEN }] }],
  ];
  for (const [name, handler, body] of routes) {
    it(`${name}: unauthenticated never reaches the body`, async () => {
      bearerParent = null;
      const request = req(body);
      const res = await handler(request);
      expect(res.status).toBe(401);
      expect(request.text).not.toHaveBeenCalled();
    });
    it(`${name}: throttled never reaches the body, under its own gp* scope`, async () => {
      rateAllowed = false;
      const request = req(body);
      const res = await handler(request);
      expect(res.status).toBe(429);
      expect(request.text).not.toHaveBeenCalled();
      expect(rateScopes[0]).toMatch(/^gp(intent|redeem|restore)$/);
    });
  }
});

describe("opening an Android purchase intent", () => {
  const body = { student_profile_id: CHILD, product_id: MATH_MONTH };

  it("opens an ANDROID intent and returns its id (the obfuscated account id)", async () => {
    const res = await intentPost(req(body));
    expect(res.status).toBe(200);
    expect((await payload(res)).data).toEqual({
      intent_id: INTENT,
      product_id: MATH_MONTH,
      student_profile_id: CHILD,
      expires_at: "2026-10-17T00:00:00.000Z",
    });
    expect(inserts[0]).toMatchObject({ owner_parent_profile_id: PARENT, student_profile_id: CHILD, platform: "android", product_id: MATH_MONTH });
  });

  it("refuses to sell anything while the Play API is not configured", async () => {
    configured = false;
    const request = req(body);
    const res = await intentPost(request);
    expect(res.status).toBe(503);
    expect((await payload(res)).error).toBe("iap.err.generic");
    expect(inserts).toHaveLength(0);
  });

  it("refuses an inactive product, another parent's child, a live entitlement, and closed payments", async () => {
    product = { ...product!, active: false };
    expect((await payload(await intentPost(req(body)))).error).toBe("iap.err.unavailable");
    product = { ...product, active: true };
    owns = false;
    expect((await payload(await intentPost(req(body)))).error).toBe("sub.err.notYourChild");
    owns = true;
    liveEntitlement = true;
    expect((await payload(await intentPost(req(body)))).error).toBe("iap.err.alreadyActive");
    liveEntitlement = false;
    paymentsDisabled = true;
    expect((await payload(await intentPost(req(body)))).error).toBe("gate.paymentsOff");
    expect(inserts).toHaveLength(0);
  });
});

describe("redeeming a Play purchase", () => {
  const body = { intent_id: INTENT, product_id: MATH_MONTH, purchase_token: TOKEN, order_id: "ignored" };

  it("asks Google about the posted product and token instead of believing them", async () => {
    await redeemPost(req(body));
    expect(requeryCalls).toEqual([[MATH_MONTH, TOKEN]]);
  });

  it("demands that the purchase name THIS intent and THIS parent", async () => {
    await redeemPost(req(body));
    expect(grantArgs[0]).toMatchObject({ expectedIntentId: INTENT, requireParentProfileId: PARENT, via: "redeem" });
  });

  it("answers the Apple-shaped success, plus whether the server consumed", async () => {
    const res = await redeemPost(req(body));
    expect((await payload(res)).data).toEqual({
      granted: true,
      already: false,
      student_profile_id: CHILD,
      product_id: MATH_MONTH,
      scope: "subject",
      ends_at: "2026-11-10T09:00:00.000Z",
      consumed: true,
    });
  });

  it("answers a PENDING purchase as a success that granted nothing", async () => {
    grantResult = { ok: true, granted: false, reason: "pending", intentId: INTENT, studentProfileId: CHILD, productId: MATH_MONTH };
    const res = await redeemPost(req(body));
    expect(res.status).toBe(200);
    expect((await payload(res)).data).toEqual({
      granted: false,
      pending: true,
      message: "iap.msg.pending",
      student_profile_id: CHILD,
      product_id: MATH_MONTH,
    });
  });

  it("maps refusals to keys and never leaks the code", async () => {
    for (const [reason, key] of [
      ["intent_mismatch", "iap.err.mismatch"],
      ["product_mismatch", "iap.err.mismatch"],
      ["unknown_intent", "iap.err.notFound"],
      ["intent_not_yours", "iap.err.notFound"],
      ["revoked", "iap.err.revoked"],
      ["account_id_missing", "iap.err.notVerifiedPlay"],
    ] as const) {
      grantResult = { ok: false, reason, retryable: false };
      const out = await payload(await redeemPost(req(body)));
      expect(out.error).toBe(key);
      // The key and nothing else: the internal code never travels.
      expect(Object.keys(out).sort()).toEqual(["error", "retryable"]);
      if (!key.includes(reason)) expect(JSON.stringify(out)).not.toContain(reason);
    }
  });

  it("says so, retryably, when Google could not be reached — and writes nothing", async () => {
    requeryResult = { ok: false, reason: "unavailable" };
    const res = await redeemPost(req(body));
    expect(res.status).toBe(503);
    expect((await payload(res)).retryable).toBe(true);
    expect(grantArgs).toHaveLength(0);
  });

  it("rejects a malformed token or product without calling Google", async () => {
    await redeemPost(req({ ...body, purchase_token: "has space" }));
    await redeemPost(req({ ...body, product_id: "../etc/passwd" }));
    expect(requeryCalls).toHaveLength(0);
  });
});

describe("restoring Play purchases", () => {
  it("binds every purchase to the child ITS OWN record names, never to one the caller picks", async () => {
    await restorePost(req({ purchases: [{ product_id: MATH_MONTH, purchase_token: TOKEN }], intent_id: INTENT, student_profile_id: CHILD }));
    expect(grantArgs[0]).toMatchObject({ requireParentProfileId: PARENT, via: "restore" });
    expect(grantArgs[0]!.expectedIntentId).toBeUndefined();
  });

  it("keeps the good ones when one is refused", async () => {
    const BAD = "badbadbadbad.AO-J1Oy_ExampleValue-0002";
    grantResult = (a) =>
      (a.purchase as { purchaseToken: string }).purchaseToken === BAD ? { ok: false, reason: "revoked", retryable: false } : granted;
    const res = await restorePost(req({ purchases: [{ product_id: MATH_MONTH, purchase_token: TOKEN }, { product_id: MATH_MONTH, purchase_token: BAD }] }));
    const data = (await payload(res)).data as { checked: number; granted: number; results: Row[] };
    expect(data.checked).toBe(2);
    expect(data.granted).toBe(1);
    expect(data.results.map((r) => r.status).sort()).toEqual(["granted", "refused"]);
    expect(JSON.stringify(data)).not.toContain("revoked");
  });

  it("dedupes, drops junk and caps the work one request can cause", async () => {
    const purchases = Array.from({ length: 40 }, (_, i) => ({ product_id: MATH_MONTH, purchase_token: `${TOKEN}${i}` }));
    await restorePost(req({ purchases: [...purchases, ...purchases, { product_id: "x", purchase_token: "y" }] }));
    expect(requeryCalls.length).toBe(25);
  });

  it("treats an empty device as a success", async () => {
    const res = await restorePost(req({ purchases: [] }));
    expect((await payload(res)).data).toEqual({ checked: 0, granted: 0, results: [] });
  });
});
