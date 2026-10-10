// THE GOOGLE PLAY WRITE PATH, pinned — the twin of the Apple writer's suite.
//
// The fake database models exactly what the production code delegates its
// guarantees to: the catalogue lookup, the intent row, the UNIQUE index on
// iap_purchase_intents.original_transaction_id, and entitlement_grant being an
// UPSERT on (source, external_ref). Google is replaced by the client module;
// every call to it and every grant RPC is written to one ordered event log, so
// "consume only after the grant" is asserted as an ORDER, not a count.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductPurchase, VerifiedPlayPurchase } from "@/lib/payments/google/purchase";

vi.mock("server-only", () => ({}));

const PARENT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const OTHER_PARENT = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const CHILD = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const INTENT = "11111111-1111-4111-8111-111111111111";
const OTHER_INTENT = "22222222-2222-4222-8222-222222222222";
const SUBJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const PACKAGE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const GRADE = "cccccccc-3333-4333-8333-cccccccccccc";
const MATH_MONTH = "ai.olympiq.app.sub.math.month";
const MATH_YEAR = "ai.olympiq.app.sub.math.year";
const OLY = "ai.olympiq.app.oly.aimo";
const TOKEN = "tokentokentoken.AO-J1Oy_ExampleValue-0001";
const ORDER = "GPA.3345-6789-0123-45678";

let testGrants = true;
vi.mock("@/lib/payments/google/config", () => ({
  getGooglePlayConfig: () => ({ packageName: "ai.olympiq.app", clientEmail: "x@y.iam.gserviceaccount.com", privateKeyId: null }),
  testGrantsEnabled: () => testGrants,
}));

const events: string[] = [];
let consumeOk = true;
let getAnswer: { ok: boolean; data?: ProductPurchase; status?: number; error?: string } = { ok: false };
vi.mock("@/lib/payments/google/client", () => ({
  getProductPurchase: async () => {
    events.push("google.get");
    return getAnswer.ok
      ? { ok: true, data: getAnswer.data }
      : { ok: false, error: getAnswer.error ?? "http_error", status: getAnswer.status ?? 500 };
  },
  consumeProductPurchase: async () => {
    events.push("google.consume");
    return consumeOk ? { ok: true, data: null } : { ok: false, error: "http_error", status: 500 };
  },
  acknowledgeProductPurchase: async () => {
    events.push("google.acknowledge");
    return { ok: true, data: null };
  },
}));

// ---------------------------------------------------------------- fake database
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {
  iap_products: [],
  iap_purchase_intents: [],
  parent_student_links: [],
  students: [],
  entitlements: [],
};
let nextId = 1;
let grantFails = false;
const auditRows: { action: string; opts: Record<string, unknown> }[] = [];

function builder(table: string) {
  let mode: "select" | "update" = "select";
  let payload: Row = {};
  const preds: ((r: Row) => boolean)[] = [];
  const rows = () => db[table] ?? (db[table] = []);
  const matching = () => rows().filter((r) => preds.every((p) => p(r)));
  const run = (): { data: Row[]; error: { code: string } | null } => {
    if (mode === "update") {
      const hits = matching();
      if (table === "iap_purchase_intents" && "original_transaction_id" in payload) {
        const claimed = payload.original_transaction_id;
        if (rows().some((r) => r.original_transaction_id === claimed && !hits.includes(r))) {
          return { data: [], error: { code: "23505" } };
        }
      }
      for (const r of hits) Object.assign(r, payload);
      return { data: hits, error: null };
    }
    return { data: matching(), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    update: (v: Row) => ((mode = "update"), (payload = v), b),
    eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (preds.push((r) => (r[c] ?? null) === v), b),
    not: (c: string, _op: string, v: unknown) => (preds.push((r) => (r[c] ?? null) !== v), b),
    limit: () => b,
    maybeSingle: async () => {
      const { data, error } = run();
      return { data: data[0] ?? null, error };
    },
    then: (resolve: (v: { data: Row[]; error: unknown }) => unknown) => Promise.resolve(resolve(run())),
  };
  return b as never;
}

const adminClient = {
  from: (table: string) => builder(table),
  rpc: async (fn: string, args: Row) => {
    if (fn === "entitlement_grant") {
      events.push("db.entitlement_grant");
      if (grantFails) return { data: null, error: { code: "XX000", hint: "boom" } };
      const key = `${String(args.p_source)}:${String(args.p_external_ref)}`;
      const found = db.entitlements.find((r) => r.key === key);
      if (found) {
        Object.assign(found, { ...args, key });
        return { data: found.id, error: null };
      }
      const row = {
        id: `ent-${nextId++}`,
        key,
        ...args,
        source: args.p_source,
        external_ref: args.p_external_ref,
        revoked_at: null,
      };
      db.entitlements.push(row);
      return { data: row.id, error: null };
    }
    return { data: null, error: { code: "42883", hint: null } };
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => adminClient,
  isServiceRoleConfigured: true,
}));
vi.mock("@/lib/audit", () => ({
  writeAuditLog: async (_a: string | null, action: string, opts: Record<string, unknown>) => {
    auditRows.push({ action, opts });
  },
}));

const { grantGoogleEntitlement, requeryPlayPurchase, findAndroidProduct } = await import(
  "@/lib/payments/google/grantEntitlement"
);

// ---------------------------------------------------------------------------

function purchase(over: Partial<ProductPurchase> = {}, productId = MATH_MONTH): VerifiedPlayPurchase {
  return {
    source: "requery",
    productId,
    purchaseToken: TOKEN,
    purchase: {
      purchaseTimeMillis: String(Date.UTC(2026, 9, 10, 9, 0, 0)),
      purchaseState: 0,
      consumptionState: 0,
      acknowledgementState: 0,
      orderId: ORDER,
      obfuscatedExternalAccountId: INTENT,
      quantity: 1,
      purchaseType: 1,
      ...over,
    },
  };
}

function intent(over: Row = {}): Row {
  return {
    id: INTENT,
    owner_parent_profile_id: PARENT,
    student_profile_id: CHILD,
    platform: "android",
    product_id: MATH_MONTH,
    consumed_at: null,
    original_transaction_id: null,
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const k of Object.keys(db)) db[k] = [];
  events.length = 0;
  auditRows.length = 0;
  nextId = 1;
  consumeOk = true;
  grantFails = false;
  testGrants = true;
  getAnswer = { ok: false };
  db.iap_products.push(
    { id: "p1", platform: "android", product_id: MATH_MONTH, scope: "subject", subject_id: SUBJECT, package_id: null, grade_id: null, interval: "month", active: true },
    { id: "p2", platform: "android", product_id: MATH_YEAR, scope: "subject", subject_id: SUBJECT, package_id: null, grade_id: null, interval: "year", active: true },
    { id: "p3", platform: "android", product_id: OLY, scope: "olympiad_package", subject_id: null, package_id: PACKAGE, grade_id: null, interval: null, active: true },
    // The iOS twin must never be what an android lookup finds.
    { id: "p4", platform: "ios", product_id: MATH_MONTH, scope: "subject", subject_id: "ios-subject", package_id: null, grade_id: null, interval: "week", active: true },
  );
  db.iap_purchase_intents.push(intent());
  db.students.push({ profile_id: CHILD, grade_id: GRADE });
});

describe("granting a verified purchase", () => {
  it("grants the child the intent names, from OUR catalogue row", async () => {
    const r = await grantGoogleEntitlement({ purchase: purchase(), expectedIntentId: INTENT, requireParentProfileId: PARENT, via: "redeem" });
    expect(r).toMatchObject({ ok: true, granted: true, studentProfileId: CHILD, scope: "subject", externalRef: `gp:${ORDER}`, consumed: true });
    expect(db.entitlements).toHaveLength(1);
    expect(db.entitlements[0]).toMatchObject({
      p_source: "google_play",
      p_subject_id: SUBJECT,
      p_ends_at: "2026-11-10T09:00:00.000Z",
    });
    expect(db.iap_purchase_intents[0]).toMatchObject({ original_transaction_id: `gp:${ORDER}` });
    expect(db.iap_purchase_intents[0]!.consumed_at).not.toBeNull();
    expect(auditRows[0]?.action).toBe("iap.google.entitlement_granted");
    expect(JSON.stringify(auditRows)).not.toContain(TOKEN);
  });

  it("consumes on Google strictly AFTER the grant", async () => {
    await grantGoogleEntitlement({ purchase: purchase(), via: "redeem", requireParentProfileId: PARENT });
    expect(events).toEqual(["db.entitlement_grant", "google.consume"]);
  });

  it("never consumes when the grant failed", async () => {
    grantFails = true;
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "redeem", requireParentProfileId: PARENT });
    expect(r).toMatchObject({ ok: false, reason: "grant_failed", retryable: true });
    expect(events).not.toContain("google.consume");
    expect(db.iap_purchase_intents[0]!.consumed_at).toBeNull();
  });

  it("acknowledges when consume fails, so Google does not refund a delivered purchase", async () => {
    consumeOk = false;
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "redeem", requireParentProfileId: PARENT });
    expect(r).toMatchObject({ ok: true, granted: true, consumed: false });
    expect(events).toEqual(["db.entitlement_grant", "google.consume", "google.acknowledge"]);
  });

  it("does not consume a purchase Google already shows consumed", async () => {
    const r = await grantGoogleEntitlement({ purchase: purchase({ consumptionState: 1 }), via: "redeem", requireParentProfileId: PARENT });
    expect(r).toMatchObject({ ok: true, granted: true, consumed: true });
    expect(events).toEqual(["db.entitlement_grant"]);
  });

  it("is idempotent: a second redeem grants nothing new and reports the repeat", async () => {
    const first = await grantGoogleEntitlement({ purchase: purchase(), via: "redeem", requireParentProfileId: PARENT });
    const second = await grantGoogleEntitlement({ purchase: purchase({ consumptionState: 1 }), via: "redeem", requireParentProfileId: PARENT });
    expect(first).toMatchObject({ granted: true, alreadyGranted: false });
    expect(second).toMatchObject({ granted: true, alreadyGranted: true });
    expect(db.entitlements).toHaveLength(1);
  });

  it("records a PENDING purchase and grants nothing, consumes nothing", async () => {
    const r = await grantGoogleEntitlement({ purchase: purchase({ purchaseState: 2 }), via: "redeem", requireParentProfileId: PARENT });
    expect(r).toEqual({ ok: true, granted: false, reason: "pending", intentId: INTENT, studentProfileId: CHILD, productId: MATH_MONTH });
    expect(db.entitlements).toHaveLength(0);
    expect(events).toEqual([]);
  });

  it("refuses a purchase whose obfuscated account id is not the named intent", async () => {
    const r = await grantGoogleEntitlement({ purchase: purchase({ obfuscatedExternalAccountId: OTHER_INTENT }), expectedIntentId: INTENT, requireParentProfileId: PARENT, via: "redeem" });
    expect(r).toMatchObject({ ok: false, reason: "intent_mismatch", retryable: false });
    expect(db.entitlements).toHaveLength(0);
  });

  it("refuses a purchase of a DIFFERENT product than the intent was opened for", async () => {
    const r = await grantGoogleEntitlement({ purchase: purchase({}, MATH_YEAR), via: "redeem", requireParentProfileId: PARENT });
    expect(r).toMatchObject({ ok: false, reason: "product_mismatch" });
    expect(db.entitlements).toHaveLength(0);
    // Unconsumed, so Google refunds it automatically.
    expect(events).not.toContain("google.consume");
  });

  it("refuses an iOS intent id reused on Android", async () => {
    db.iap_purchase_intents[0]!.platform = "ios";
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "redeem", requireParentProfileId: PARENT });
    expect(r).toMatchObject({ ok: false, reason: "intent_mismatch" });
  });

  it("refuses a stranger, with the same code an unknown intent gets", async () => {
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "restore", requireParentProfileId: OTHER_PARENT });
    expect(r).toMatchObject({ ok: false, reason: "intent_not_yours" });
    expect(db.entitlements).toHaveLength(0);
  });

  it("lets a co-parent with an active link restore the family's purchase", async () => {
    db.parent_student_links.push({ id: "l1", parent_profile_id: OTHER_PARENT, student_profile_id: CHILD, status: "active" });
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "restore", requireParentProfileId: OTHER_PARENT });
    expect(r).toMatchObject({ ok: true, granted: true, studentProfileId: CHILD });
  });

  it("refuses an intent that does not exist", async () => {
    db.iap_purchase_intents.length = 0;
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "notification" });
    expect(r).toMatchObject({ ok: false, reason: "unknown_intent", retryable: false });
  });

  it("refuses an unknown product rather than guessing", async () => {
    db.iap_products = db.iap_products.filter((p) => p.platform !== "android" || p.product_id !== MATH_MONTH);
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "notification" });
    expect(r).toMatchObject({ ok: false, reason: "unknown_product" });
  });

  it("still grants a product deactivated AFTER the purchase", async () => {
    db.iap_products[0]!.active = false;
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "notification" });
    expect(r).toMatchObject({ ok: true, granted: true });
  });

  it("never re-grants a purchase whose grant was revoked (a refund)", async () => {
    db.entitlements.push({ id: "ent-old", source: "google_play", external_ref: `gp:${ORDER}`, revoked_at: "2026-10-11T00:00:00Z" });
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "restore", requireParentProfileId: PARENT });
    expect(r).toMatchObject({ ok: false, reason: "revoked", retryable: false });
    expect(events).not.toContain("db.entitlement_grant");
  });

  it("refuses one payment reaching two children", async () => {
    db.iap_purchase_intents.push(intent({ id: OTHER_INTENT, original_transaction_id: `gp:${ORDER}` }));
    const r = await grantGoogleEntitlement({ purchase: purchase(), via: "redeem", requireParentProfileId: PARENT });
    expect(r).toMatchObject({ ok: false, reason: "transaction_claimed" });
  });

  it("grants a package for life to the child's grade", async () => {
    db.iap_purchase_intents[0]!.product_id = OLY;
    const r = await grantGoogleEntitlement({ purchase: purchase({}, OLY), via: "redeem", requireParentProfileId: PARENT });
    expect(r).toMatchObject({ ok: true, granted: true, scope: "olympiad_package", endsAt: null });
    expect(db.entitlements[0]).toMatchObject({ p_package_id: PACKAGE, p_grade_id: GRADE, p_ends_at: null });
  });

  it("grants a license-tester purchase under a namespaced ref, and can be switched off", async () => {
    const r = await grantGoogleEntitlement({ purchase: purchase({ purchaseType: 0 }), via: "redeem", requireParentProfileId: PARENT });
    expect(r).toMatchObject({ ok: true, granted: true, environment: "Test", externalRef: `gp:test:${ORDER}` });

    db.entitlements.length = 0;
    db.iap_purchase_intents[0] = intent();
    events.length = 0;
    testGrants = false;
    const off = await grantGoogleEntitlement({ purchase: purchase({ purchaseType: 0 }), via: "redeem", requireParentProfileId: PARENT });
    expect(off).toMatchObject({ ok: true, granted: false, reason: "test_disabled" });
    expect(db.entitlements).toHaveLength(0);
  });

  it("refuses anything not re-queried, before touching the database", async () => {
    const r = await grantGoogleEntitlement({ purchase: { ...purchase(), source: "notification" }, via: "notification" });
    expect(r).toMatchObject({ ok: false, reason: "not_requeried" });
  });
});

describe("asking Google", () => {
  it("tags Google's answer as a re-query", async () => {
    getAnswer = { ok: true, data: { purchaseState: 0 } };
    const r = await requeryPlayPurchase(MATH_MONTH, TOKEN);
    expect(r).toMatchObject({ ok: true, purchase: { source: "requery", productId: MATH_MONTH, purchaseToken: TOKEN } });
  });

  it("reads Google's 400/404/410 as 'no such purchase', and other failures as retryable", async () => {
    getAnswer = { ok: false, error: "http_error", status: 404 };
    expect(await requeryPlayPurchase(MATH_MONTH, TOKEN)).toEqual({ ok: false, reason: "not_found" });
    getAnswer = { ok: false, error: "http_error", status: 503 };
    expect(await requeryPlayPurchase(MATH_MONTH, TOKEN)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("never calls Google with a malformed product id or token", async () => {
    expect(await requeryPlayPurchase("../../etc", TOKEN)).toEqual({ ok: false, reason: "malformed" });
    expect(await requeryPlayPurchase(MATH_MONTH, "a b")).toEqual({ ok: false, reason: "malformed" });
    expect(events).toEqual([]);
  });

  it("looks up the ANDROID row, never the iOS twin", async () => {
    const row = await findAndroidProduct(MATH_MONTH);
    expect(row).toMatchObject({ id: "p1", subjectId: SUBJECT, interval: "month" });
  });
});
