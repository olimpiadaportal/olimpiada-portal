// THE THREE PARENT-FACING APPLE IAP ENDPOINTS, pinned at the route layer.
//
// What is asserted here is the ORDER and the ARGUMENTS — the two things that are
// invisible in a click-through and catastrophic when wrong:
//
//   * AUTHORIZE BEFORE THE BODY IS READ. An unauthenticated request must not be
//     able to make these endpoints parse anything at all. The assertion is
//     literal: the request's own `text()` is a spy, and it must never have been
//     called on a rejected request.
//   * THE OWNERSHIP ARGUMENTS ARE ACTUALLY PASSED. `grantAppleEntitlement`
//     refuses a foreign intent only if the route tells it whose intent to
//     demand; a route that forgot `requireParentProfileId` would pass every
//     behavioural test in the library suite and still let one parent restore
//     another family's purchase.
//   * A REFUSAL IS A KEY, NEVER A SENTENCE. Every failure body carries an i18n
//     key the app translates locally; no Postgres text, no Apple text, no
//     internal refusal code ever reaches a client.
//
// The write path itself (idempotency, sandbox, the unique-index conflict) is
// pinned in lib/payments/apple/__tests__/grantEntitlement.test.ts against a fake
// database. It is MOCKED here on purpose: this file is about the routes.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PARENT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const CHILD = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OTHER_CHILD = "9f8c1d2e-1111-4222-8333-444455556666";
const INTENT = "11111111-1111-4111-8111-111111111111";
const SUBJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const PACKAGE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const GRADE = "cccccccc-3333-4333-8333-cccccccccccc";
const MATH_MONTH = "ai.olympiq.app.sub.math.month";
const OLY = "ai.olympiq.app.oly.national";
const TXN = "2000000900000001";

// ---- the seams -------------------------------------------------------------

let bearerParent: { profileId: string; authUserId: string } | null = null;
vi.mock("@/lib/auth/mobileBearer", () => ({
  resolveBearerParent: async () => bearerParent,
}));

let owns = true;
const ownsCalls: [string, string][] = [];
vi.mock("@/lib/auth/subscriptionCore", () => ({
  ownsChildCore: async (parentProfileId: string, studentId: string) => {
    ownsCalls.push([parentProfileId, studentId]);
    return owns;
  },
}));

let rateAllowed = true;
vi.mock("@/lib/rateLimit", () => ({
  rateLimitAllow: () => rateAllowed,
}));

type ProductRow = {
  id: string;
  scope: "subject" | "olympiad_package";
  subjectId: string | null;
  packageId: string | null;
  gradeId: string | null;
  interval: "week" | "month" | "year" | null;
  active: boolean;
};

let product: ProductRow | null = null;
let liveEntitlement: boolean | null = false;
const productLookups: string[] = [];
const grantArgs: Record<string, unknown>[] = [];
const requeryCalls: string[] = [];

let requeryResult: Record<string, unknown> = { ok: false, reason: "not_found" };
let grantResult: Record<string, unknown> = { ok: false, reason: "grant_failed" };

vi.mock("@/lib/payments/apple/grantEntitlement", () => ({
  findIosProduct: async (productId: string) => {
    productLookups.push(productId);
    return product;
  },
  hasLiveEntitlement: async () => liveEntitlement,
  requeryVerifiedTransaction: async (id: string) => {
    requeryCalls.push(id);
    // A successful re-query hands back a transaction TAGGED with the id it was
    // asked about, so a test can make one id in a batch behave differently —
    // restore runs several concurrently and a shared mock could not tell them
    // apart.
    if ((requeryResult as { ok?: boolean }).ok === true) {
      return {
        ok: true,
        transaction: { environment: "Production", source: "requery", requestedId: id },
      };
    }
    return requeryResult;
  },
  grantAppleEntitlement: async (args: Record<string, unknown>) => {
    grantArgs.push(args);
    return typeof grantResult === "function"
      ? (grantResult as (a: Record<string, unknown>) => unknown)(args)
      : grantResult;
  },
}));

// A minimal admin client: only what the ROUTES themselves reach for.
type Row = Record<string, unknown>;
let paymentsDisabled = false;
let packageOnSale = true;
let packageTargetsGrade = true;
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
      return {
        data: { id: INTENT, expires_at: "2026-09-08T00:00:00.000Z" },
        error: null,
      };
    },
    maybeSingle: async () => {
      if (table === "olympiad_packages") {
        return {
          data: { status: "active", sale_starts_at: null, sale_ends_at: null },
          error: null,
        };
      }
      if (table === "students") return { data: { grade_id: GRADE }, error: null };
      return { data: null, error: null };
    },
    then: (resolve: (v: { data: Row[]; error: unknown }) => unknown) => {
      if (table === "olympiad_package_grades") {
        return Promise.resolve(
          resolve({ data: packageTargetsGrade ? [{ grade_id: GRADE }] : [], error: null }),
        );
      }
      return Promise.resolve(resolve({ data: [], error: null }));
    },
  };
  return b as never;
}

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: (table: string) => builder(table),
    rpc: async (fn: string) => {
      if (fn === "assert_payments_enabled") {
        return paymentsDisabled
          ? { data: null, error: { code: "23514", hint: "payments_disabled" } }
          : { data: null, error: null };
      }
      if (fn === "olympiad_package_on_sale") return { data: packageOnSale, error: null };
      return { data: null, error: { code: "42883", hint: null } };
    },
  }),
  isServiceRoleConfigured: true,
}));

const { POST: intentPost } = await import("@/app/api/mobile/v1/iap/apple/intent/route");
const { POST: redeemPost } = await import("@/app/api/mobile/v1/iap/apple/redeem/route");
const { POST: restorePost } = await import("@/app/api/mobile/v1/iap/apple/restore/route");

// ---------------------------------------------------------------------------

/** A request whose body read is observable. */
function req(body: unknown): Request & { text: ReturnType<typeof vi.fn> } {
  const text = vi.fn(async () => JSON.stringify(body));
  return { text, headers: new Headers() } as unknown as Request & {
    text: ReturnType<typeof vi.fn>;
  };
}

async function payload(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const subjectProduct: ProductRow = {
  id: "prod-math-month",
  scope: "subject",
  subjectId: SUBJECT,
  packageId: null,
  gradeId: null,
  interval: "month",
  active: true,
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  bearerParent = { profileId: PARENT, authUserId: "auth-1" };
  owns = true;
  rateAllowed = true;
  paymentsDisabled = false;
  packageOnSale = true;
  packageTargetsGrade = true;
  product = { ...subjectProduct };
  liveEntitlement = false;
  requeryResult = { ok: true, transaction: { environment: "Production", source: "requery" } };
  grantResult = {
    ok: true,
    granted: true,
    environment: "Production",
    entitlementId: "ent-1",
    alreadyGranted: false,
    intentId: INTENT,
    studentProfileId: CHILD,
    scope: "subject",
    productId: MATH_MONTH,
    originalTransactionId: TXN,
    endsAt: "2026-09-15T09:00:00.000Z",
  };
  ownsCalls.length = 0;
  productLookups.length = 0;
  grantArgs.length = 0;
  requeryCalls.length = 0;
  inserts.length = 0;
});

// =============================================================================

describe("authorization happens before the body is read", () => {
  const routes: [string, (r: Request) => Promise<Response>, unknown][] = [
    ["intent", intentPost, { student_profile_id: CHILD, product_id: MATH_MONTH }],
    ["redeem", redeemPost, { intent_id: INTENT, transaction_id: TXN }],
    ["restore", restorePost, { transaction_ids: [TXN] }],
  ];

  for (const [name, handler, body] of routes) {
    it(`${name}: an unauthenticated request never reaches the body`, async () => {
      bearerParent = null;
      const request = req(body);
      const res = await handler(request);
      expect(res.status).toBe(401);
      expect(await payload(res)).toEqual({ error: "parent.err.invalid", retryable: false });
      // THE ASSERTION THAT MATTERS: nothing was parsed.
      expect(request.text).not.toHaveBeenCalled();
    });

    it(`${name}: a throttled request never reaches the body either`, async () => {
      rateAllowed = false;
      const request = req(body);
      const res = await handler(request);
      expect(res.status).toBe(429);
      expect((await payload(res)).error).toBe("parent.err.tooMany");
      expect(request.text).not.toHaveBeenCalled();
    });

    it(`${name}: answers no-store`, async () => {
      const res = await handler(req(body));
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  }
});

// =============================================================================

describe("opening a purchase intent", () => {
  const body = { student_profile_id: CHILD, product_id: MATH_MONTH };

  it("opens one and returns its id — the appAccountToken", async () => {
    const res = await intentPost(req(body));
    expect(res.status).toBe(200);
    const out = await payload(res);
    expect(out.ok).toBe(true);
    expect((out.data as Row).intent_id).toBe(INTENT);
    expect(inserts[0]).toMatchObject({
      owner_parent_profile_id: PARENT,
      student_profile_id: CHILD,
      platform: "ios",
      product_id: MATH_MONTH,
    });
  });

  it("never lets a parent name another parent's child", async () => {
    owns = false;
    const res = await intentPost(req({ ...body, student_profile_id: OTHER_CHILD }));
    expect(res.status).toBe(403);
    expect((await payload(res)).error).toBe("sub.err.notYourChild");
    expect(inserts).toHaveLength(0);
  });

  it("re-verifies ownership against the BEARER parent, not a posted one", async () => {
    await intentPost(req({ ...body, owner_parent_profile_id: "spoofed" }));
    expect(ownsCalls[0]).toEqual([PARENT, CHILD]);
  });

  it("refuses an INACTIVE product", async () => {
    // Decision (4) of migration 164: a subject with no live iOS product is
    // neither purchasable nor accessible on iOS.
    product = { ...subjectProduct, active: false };
    const res = await intentPost(req(body));
    expect(res.status).toBe(400);
    expect((await payload(res)).error).toBe("iap.err.unavailable");
    expect(inserts).toHaveLength(0);
  });

  it("refuses an UNKNOWN product rather than defaulting to something", async () => {
    product = null;
    const res = await intentPost(req({ ...body, product_id: "ai.olympiq.app.sub.chess.year" }));
    expect(res.status).toBe(400);
    expect((await payload(res)).error).toBe("iap.err.unavailable");
    expect(inserts).toHaveLength(0);
  });

  it("refuses a child who ALREADY holds a live entitlement, with its own key", async () => {
    // The only moment double-billing can be prevented: once StoreKit has taken
    // the money, the refund belongs to Apple. A parent who bought on the web
    // must not be charged again here.
    liveEntitlement = true;
    const res = await intentPost(req(body));
    expect(res.status).toBe(409);
    expect((await payload(res)).error).toBe("iap.err.alreadyActive");
    expect(inserts).toHaveLength(0);
  });

  it("refuses when the entitlement question cannot be answered at all", async () => {
    // Fail CLOSED. A failed sale is recoverable; a second charge is not.
    liveEntitlement = null;
    const res = await intentPost(req(body));
    expect(res.status).toBe(500);
    expect((await payload(res)).error).toBe("iap.err.generic");
    expect(inserts).toHaveLength(0);
  });

  it("closes with the other rails when payments are switched off", async () => {
    paymentsDisabled = true;
    const res = await intentPost(req(body));
    expect(res.status).toBe(409);
    expect((await payload(res)).error).toBe("gate.paymentsOff");
    // ...and it stopped there: no catalogue read, no row.
    expect(productLookups).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("checks ownership BEFORE the payment gate, and the gate before the product", async () => {
    // Order is the property: an unauthorized caller must not learn whether
    // payments are on, and neither must learn what is in the catalogue.
    owns = false;
    paymentsDisabled = true;
    const res = await intentPost(req(body));
    expect((await payload(res)).error).toBe("sub.err.notYourChild");
    expect(productLookups).toHaveLength(0);
  });

  it("rejects a malformed child id without touching the catalogue", async () => {
    const res = await intentPost(req({ student_profile_id: "not-a-uuid", product_id: MATH_MONTH }));
    expect(res.status).toBe(400);
    expect(productLookups).toHaveLength(0);
  });

  it("rejects an over-long product id", async () => {
    const res = await intentPost(req({ student_profile_id: CHILD, product_id: "x".repeat(400) }));
    expect(res.status).toBe(400);
    expect((await payload(res)).error).toBe("iap.err.unavailable");
    expect(productLookups).toHaveLength(0);
  });

  it("refuses a package that is off sale", async () => {
    product = {
      id: "prod-oly",
      scope: "olympiad_package",
      subjectId: null,
      packageId: PACKAGE,
      gradeId: null,
      interval: null,
      active: true,
    };
    packageOnSale = false;
    const res = await intentPost(req({ student_profile_id: CHILD, product_id: OLY }));
    expect(res.status).toBe(409);
    expect((await payload(res)).error).toBe("iap.err.unavailable");
    expect(inserts).toHaveLength(0);
  });

  it("refuses a package that does not target this child's grade", async () => {
    product = {
      id: "prod-oly",
      scope: "olympiad_package",
      subjectId: null,
      packageId: PACKAGE,
      gradeId: null,
      interval: null,
      active: true,
    };
    packageTargetsGrade = false;
    const res = await intentPost(req({ student_profile_id: CHILD, product_id: OLY }));
    expect(res.status).toBe(409);
    expect(inserts).toHaveLength(0);
  });
});

// =============================================================================

describe("redeeming a completed purchase", () => {
  const body = { intent_id: INTENT, transaction_id: TXN };

  it("asks Apple about the posted id instead of believing it", async () => {
    await redeemPost(req(body));
    expect(requeryCalls).toEqual([TXN]);
  });

  it("demands that the transaction name THIS intent and THIS parent", async () => {
    // Both arguments, on every call. Dropping either one is invisible until a
    // parent redeems a transaction that belongs to a different request.
    await redeemPost(req(body));
    expect(grantArgs[0]).toMatchObject({
      expectedIntentId: INTENT,
      requireParentProfileId: PARENT,
      via: "redeem",
    });
  });

  it("refuses a transaction whose appAccountToken is not the named intent", async () => {
    grantResult = { ok: false, reason: "intent_mismatch" };
    const res = await redeemPost(req(body));
    expect(res.status).toBe(400);
    expect((await payload(res)).error).toBe("iap.err.mismatch");
  });

  it("gives one message for an unknown intent and for someone else's", async () => {
    // Telling the two apart would turn this into an oracle for intent ids.
    grantResult = { ok: false, reason: "unknown_intent" };
    const unknown = (await payload(await redeemPost(req(body)))).error;
    grantResult = { ok: false, reason: "intent_not_yours" };
    const foreign = (await payload(await redeemPost(req(body)))).error;
    expect(unknown).toBe("iap.err.notFound");
    expect(foreign).toBe("iap.err.notFound");
  });

  it("returns the same success twice, and reports the repeat", async () => {
    // The route is called twice for one purchase all the time — a retry, or the
    // notification landing first. Neither may look like a failure.
    let calls = 0;
    grantResult = (() => {
      calls += 1;
      return {
        ok: true,
        granted: true,
        environment: "Production",
        entitlementId: "ent-1",
        alreadyGranted: calls > 1,
        intentId: INTENT,
        studentProfileId: CHILD,
        scope: "subject",
        productId: MATH_MONTH,
        originalTransactionId: TXN,
        endsAt: "2026-09-15T09:00:00.000Z",
      };
    }) as unknown as Record<string, unknown>;

    const first = await payload(await redeemPost(req(body)));
    const second = await payload(await redeemPost(req(body)));
    expect((first.data as Row).granted).toBe(true);
    expect((first.data as Row).already).toBe(false);
    expect((second.data as Row).granted).toBe(true);
    expect((second.data as Row).already).toBe(true);
  });

  it("answers a SANDBOX purchase as a success that granted nothing", async () => {
    grantResult = {
      ok: true,
      granted: false,
      environment: "Sandbox",
      intentId: INTENT,
      studentProfileId: CHILD,
      productId: MATH_MONTH,
      originalTransactionId: TXN,
    };
    const res = await redeemPost(req(body));
    expect(res.status).toBe(200);
    const data = (await payload(res)).data as Row;
    expect(data.granted).toBe(false);
    expect(data.message).toBe("iap.msg.recorded");
  });

  it("says so, retryably, when Apple could not be reached", async () => {
    requeryResult = { ok: false, reason: "unavailable" };
    const res = await redeemPost(req(body));
    expect(res.status).toBe(503);
    const out = await payload(res);
    expect(out.error).toBe("iap.err.generic");
    expect(out.retryable).toBe(true);
    // Nothing was written on the strength of a client string.
    expect(grantArgs).toHaveLength(0);
  });

  it("rejects a malformed transaction id without calling Apple", async () => {
    const res = await redeemPost(req({ intent_id: INTENT, transaction_id: "not a txn id!" }));
    expect(res.status).toBe(400);
    expect(requeryCalls).toHaveLength(0);
  });

  it("rejects a malformed intent id without calling Apple", async () => {
    const res = await redeemPost(req({ intent_id: "nope", transaction_id: TXN }));
    expect(res.status).toBe(400);
    expect((await payload(res)).error).toBe("iap.err.notFound");
    expect(requeryCalls).toHaveLength(0);
  });
});

// =============================================================================

describe("restoring purchases", () => {
  it("re-grants what the device knows about, and is safe to call twice", async () => {
    const first = await payload(await restorePost(req({ transaction_ids: [TXN] })));
    const second = await payload(await restorePost(req({ transaction_ids: [TXN] })));
    expect((first.data as Row).granted).toBe(1);
    expect(second).toEqual(first);
  });

  it("always demands that each transaction be THIS parent's", async () => {
    // The one thing standing between a restore and another family's purchase.
    await restorePost(req({ transaction_ids: [TXN] }));
    expect(grantArgs[0]).toMatchObject({ requireParentProfileId: PARENT, via: "restore" });
  });

  it("never names an expected intent — that is the whole point of a restore", async () => {
    await restorePost(req({ transaction_ids: [TXN] }));
    expect(grantArgs[0].expectedIntentId).toBeUndefined();
  });

  it("treats an empty device history as a success, not a failure", async () => {
    const res = await restorePost(req({ transaction_ids: [] }));
    expect(res.status).toBe(200);
    expect((await payload(res)).data).toEqual({ checked: 0, granted: 0, results: [] });
    expect(requeryCalls).toHaveLength(0);
  });

  it("keeps the good ones when one id is refused", async () => {
    // A device that has one refunded purchase in its history must still get the
    // other seven back. Partial success is a success.
    const BAD = "2000000900000002";
    requeryCalls.length = 0;
    grantResult = ((args: { transaction: { requestedId: string } }) => {
      return args.transaction.requestedId === BAD
        ? { ok: false, reason: "revoked" }
        : {
            ok: true,
            granted: true,
            environment: "Production",
            entitlementId: "ent-1",
            alreadyGranted: false,
            intentId: INTENT,
            studentProfileId: CHILD,
            scope: "subject",
            productId: MATH_MONTH,
            originalTransactionId: TXN,
            endsAt: null,
          };
    }) as unknown as Record<string, unknown>;

    const res = await restorePost(req({ transaction_ids: [TXN, BAD] }));
    const data = (await payload(res)).data as {
      checked: number;
      granted: number;
      results: Row[];
    };
    expect(data.checked).toBe(2);
    expect(data.granted).toBe(1);
    expect(data.results.map((r) => r.status).sort()).toEqual(["granted", "refused"]);
  });

  it("leaks no internal refusal code to the client", async () => {
    grantResult = { ok: false, reason: "bundle_id_mismatch" };
    const res = await restorePost(req({ transaction_ids: [TXN] }));
    const body = JSON.stringify(await payload(res));
    expect(body).not.toContain("bundle_id_mismatch");
    expect(body).toContain("refused");
  });

  it("dedupes and caps the work one request can cause", async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `20000009000000${String(i).padStart(2, "0")}`);
    await restorePost(req({ transaction_ids: [...ids, ...ids] }));
    expect(requeryCalls.length).toBeLessThanOrEqual(25);
  });

  it("ignores ids that could never be stored", async () => {
    await restorePost(req({ transaction_ids: ["", "x".repeat(200), "has space", TXN] }));
    expect(requeryCalls).toEqual([TXN]);
  });
});
