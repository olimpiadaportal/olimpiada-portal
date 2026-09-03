// THE APPLE WRITE PATH, pinned.
//
// Everything here is a property whose violation is SILENT — the code compiles,
// the happy path still works, and the failure shows up as a family charged
// twice, a sandbox Apple ID holding a free year, or one payment granting access
// to two different children. None of it is visible in a click-through.
//
// The fake database below is not a Supabase emulator and does not try to be. It
// implements exactly the four things this module's correctness rests on: the
// catalogue lookup, the intent row, the UNIQUE index on
// `iap_purchase_intents.original_transaction_id`, and the fact that
// `entitlement_grant` is an UPSERT on (source, external_ref). Those are the
// database behaviours the production code delegates its guarantees to, so they
// are the ones a test has to model rather than mock away.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifiedTransaction } from "@/lib/payments/apple/environment";

// `server-only` is a BUILD-TIME marker with no runtime behaviour and no package
// to resolve under Vite. Stubbing it keeps the guard in the production files.
vi.mock("server-only", () => ({}));

const BUNDLE_ID = "ai.olympiq.app";
const PARENT = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const OTHER_PARENT = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const CHILD = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const INTENT = "11111111-1111-4111-8111-111111111111";
const OTHER_INTENT = "22222222-2222-4222-8222-222222222222";
const SUBJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const PACKAGE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const GRADE = "cccccccc-3333-4333-8333-cccccccccccc";
const MATH_MONTH = "ai.olympiq.app.sub.math.month";
const OLY = "ai.olympiq.app.oly.national";
const TXN = "2000000900000001";

vi.mock("@/lib/payments/apple/config", () => ({
  getAppleIapConfig: () => ({
    bundleId: BUNDLE_ID,
    issuerId: "8f3c1d2e-1111-4222-8333-444455556666",
    keyId: "ABCDEFGHIJ",
    appAppleId: 1234567890,
  }),
  // Mirrors the real implementation rather than returning a constant, so the
  // "can be switched off" test below exercises the actual env-var contract
  // instead of a stub that would pass whatever the real one did.
  sandboxGrantsEnabled: () =>
    (process.env.APPLE_IAP_SANDBOX_GRANTS ?? "").trim().toLowerCase() !== "off",
}));

// The rails reach Apple over the network. They are replaced wholesale so this
// suite never loads a key, a certificate or Apple's library.
const railAnswers = {
  Production: null as null | { ok: boolean; blob?: string; status?: number; apiError?: number },
  Sandbox: null as null | { ok: boolean; blob?: string; status?: number; apiError?: number },
};
const verifiedBlobs = new Map<string, VerifiedTransaction>();

function fakeRail(environment: "Production" | "Sandbox") {
  return {
    environment,
    api: {
      getTransactionInfo: async () => {
        const answer = railAnswers[environment];
        if (!answer || !answer.ok) {
          return {
            ok: false as const,
            error: "http_error" as const,
            status: answer?.status ?? 404,
            apiError: answer?.apiError ?? 4040010,
          };
        }
        return {
          ok: true as const,
          data: { environment, signedTransactionInfo: answer.blob ?? "" },
        };
      },
    },
    verifier: {
      environment,
      verifyTransaction: async (blob: string, source: string) => {
        const found = verifiedBlobs.get(blob);
        if (!found) return null;
        return { ...found, environment, source };
      },
    },
  };
}

vi.mock("@/lib/payments/apple/rails", () => ({
  productionRail: () => fakeRail("Production"),
  sandboxRail: () => fakeRail("Sandbox"),
}));

// ---------------------------------------------------------------------------
// The fake database.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

const db: Record<string, Row[]> = {
  iap_products: [],
  iap_purchase_intents: [],
  students: [],
  entitlements: [],
};

let nextId = 1;
const grantCalls: Row[] = [];
const auditRows: { action: string; opts: Record<string, unknown> }[] = [];

function builder(table: string) {
  let mode: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  const preds: ((r: Row) => boolean)[] = [];

  const rows = () => db[table] ?? (db[table] = []);
  const matching = () => rows().filter((r) => preds.every((p) => p(r)));

  const run = (): { data: Row[]; error: { code: string } | null } => {
    if (mode === "insert") {
      const row: Row = { id: `id-${nextId++}`, ...payload };
      if (table === "iap_purchase_intents") {
        row.consumed_at = row.consumed_at ?? null;
        row.original_transaction_id = row.original_transaction_id ?? null;
        row.expires_at = "2026-09-08T00:00:00.000Z";
      }
      rows().push(row);
      return { data: [row], error: null };
    }
    if (mode === "update") {
      const hits = matching();
      // THE UNIQUE PARTIAL INDEX, modelled: uq_iap_intent_original_txn. Two
      // intents may not claim one transaction, and the production code relies
      // on the DATABASE raising rather than on a check-then-write.
      if (table === "iap_purchase_intents" && "original_transaction_id" in payload) {
        const claimed = payload.original_transaction_id;
        const taken = rows().some(
          (r) => r.original_transaction_id === claimed && !hits.includes(r),
        );
        if (taken) return { data: [], error: { code: "23505" } };
      }
      for (const r of hits) Object.assign(r, payload);
      return { data: hits, error: null };
    }
    return { data: matching(), error: null };
  };

  const b: Record<string, unknown> = {
    select: () => b,
    insert: (v: Row) => ((mode = "insert"), (payload = v), b),
    update: (v: Row) => ((mode = "update"), (payload = v), b),
    eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (preds.push((r) => (r[c] ?? null) === v), b),
    lte: (c: string, v: string) => (preds.push((r) => String(r[c] ?? "") <= v), b),
    gt: (c: string, v: string) => (preds.push((r) => String(r[c] ?? "") > v), b),
    limit: () => b,
    maybeSingle: async () => {
      const { data, error } = run();
      return { data: data[0] ?? null, error };
    },
    single: async () => {
      const { data, error } = run();
      return { data: data[0] ?? null, error: error ?? (data[0] ? null : { code: "PGRST116" }) };
    },
    then: (resolve: (v: { data: Row[]; error: unknown }) => unknown) =>
      Promise.resolve(resolve(run())),
  };
  return b as never;
}

const adminClient = {
  from: (table: string) => builder(table),
  rpc: async (fn: string, args: Row) => {
    if (fn === "entitlement_grant") {
      grantCalls.push(args);
      // THE UPSERT, modelled: entitlement_grant is idempotent on
      // (source, external_ref). This is the whole of "redeemed twice, granted
      // once", and the production code depends on it rather than checking first.
      const key = `${String(args.p_source)}:${String(args.p_external_ref)}`;
      const found = db.entitlements.find((r) => r.key === key);
      if (found) {
        Object.assign(found, { ...args, key });
        return { data: found.id, error: null };
      }
      const row = { id: `ent-${nextId++}`, key, ...args };
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
  writeAuditLog: async (
    _actor: string | null,
    action: string,
    opts: Record<string, unknown>,
  ) => {
    auditRows.push({ action, opts });
  },
}));

const {
  grantAppleEntitlement,
  hasLiveEntitlement,
  requeryVerifiedTransaction,
} = await import("@/lib/payments/apple/grantEntitlement");

// ---------------------------------------------------------------------------

function transaction(over: Record<string, unknown> = {}): VerifiedTransaction {
  const environment = (over.environment as "Production" | "Sandbox") ?? "Production";
  return {
    environment,
    source: "requery",
    payload: {
      transactionId: TXN,
      originalTransactionId: TXN,
      bundleId: BUNDLE_ID,
      productId: MATH_MONTH,
      // 15 Aug 2026, 09:00 UTC.
      purchaseDate: Date.UTC(2026, 7, 15, 9, 0, 0),
      quantity: 1,
      type: "Non-Renewing Subscription",
      appAccountToken: INTENT,
      inAppOwnershipType: "PURCHASED",
      environment,
      storefront: "AZE",
      ...over,
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const key of Object.keys(db)) db[key] = [];
  grantCalls.length = 0;
  auditRows.length = 0;
  railAnswers.Production = null;
  railAnswers.Sandbox = null;
  verifiedBlobs.clear();
  nextId = 1;

  db.iap_products.push({
    id: "prod-math-month",
    platform: "ios",
    product_id: MATH_MONTH,
    scope: "subject",
    subject_id: SUBJECT,
    package_id: null,
    grade_id: null,
    interval: "month",
    active: true,
  });
  db.iap_products.push({
    id: "prod-oly",
    platform: "ios",
    product_id: OLY,
    scope: "olympiad_package",
    subject_id: null,
    package_id: PACKAGE,
    grade_id: null,
    interval: null,
    active: true,
  });
  db.iap_purchase_intents.push({
    id: INTENT,
    owner_parent_profile_id: PARENT,
    student_profile_id: CHILD,
    platform: "ios",
    product_id: MATH_MONTH,
    consumed_at: null,
    original_transaction_id: null,
  });
  db.students.push({ profile_id: CHILD, grade_id: GRADE });
});

describe("a transaction becomes access exactly once", () => {
  it("grants, and grants ONCE when the same transaction is redeemed twice", async () => {
    const first = await grantAppleEntitlement({ transaction: transaction(), via: "redeem" });
    const second = await grantAppleEntitlement({ transaction: transaction(), via: "redeem" });

    expect(first.ok && first.granted).toBe(true);
    expect(second.ok && second.granted).toBe(true);
    // One row, not two. The database's (source, external_ref) upsert is what
    // guarantees it — the second call still ran the whole path.
    expect(db.entitlements).toHaveLength(1);
    expect(grantCalls).toHaveLength(2);
    // ...and the second call knows it was a repeat, which is what support reads.
    expect(first.ok && first.granted && first.alreadyGranted).toBe(false);
    expect(second.ok && second.granted && second.alreadyGranted).toBe(true);
  });

  it("keys the grant on Apple's originalTransactionId, as the schema requires", () => {
    // entitlements.external_ref's own comment names this key; the revoke path
    // finds a refunded purchase by it and nothing else.
    return grantAppleEntitlement({ transaction: transaction(), via: "redeem" }).then(() => {
      expect(grantCalls[0].p_external_ref).toBe(TXN);
      expect(grantCalls[0].p_source).toBe("apple_iap");
    });
  });

  it("computes ends_at from OUR interval, never from the payload", async () => {
    // A non-renewing subscription carries no expiresDate at all; a payload that
    // volunteers one must not be able to buy a longer period than was sold.
    await grantAppleEntitlement({
      transaction: transaction({ expiresDate: Date.UTC(2099, 0, 1) }),
      via: "redeem",
    });
    // 15 Aug 2026 + one calendar month, in UTC.
    expect(grantCalls[0].p_ends_at).toBe(new Date(Date.UTC(2026, 8, 15, 9, 0, 0)).toISOString());
    expect(grantCalls[0].p_starts_at).toBe(new Date(Date.UTC(2026, 7, 15, 9, 0, 0)).toISOString());
  });

  it("stamps the transaction id and the consumption onto the intent", async () => {
    await grantAppleEntitlement({ transaction: transaction(), via: "redeem" });
    const intent = db.iap_purchase_intents[0];
    expect(intent.original_transaction_id).toBe(TXN);
    expect(intent.consumed_at).not.toBeNull();
  });

  it("writes an audit row for the grant", async () => {
    await grantAppleEntitlement({
      transaction: transaction(),
      actorProfileId: PARENT,
      via: "redeem",
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].action).toBe("iap.apple.entitlement_granted");
    expect(auditRows[0].opts.targetTable).toBe("entitlements");
  });
});

describe("the intent is the only thing that knows which child", () => {
  it("refuses a transaction whose appAccountToken is not the named intent", async () => {
    // One genuine transaction must not be aimable at another request. Without
    // this, a parent with two children could point one payment at whichever
    // intent they liked.
    const result = await grantAppleEntitlement({
      transaction: transaction(),
      expectedIntentId: OTHER_INTENT,
      via: "redeem",
    });
    expect(result).toEqual({ ok: false, reason: "intent_mismatch", retryable: false });
    expect(db.entitlements).toHaveLength(0);
  });

  it("accepts the named intent in any letter case (Apple normalises the token)", async () => {
    const result = await grantAppleEntitlement({
      transaction: transaction(),
      expectedIntentId: INTENT.toUpperCase(),
      via: "redeem",
    });
    expect(result.ok && result.granted).toBe(true);
  });

  it("refuses an intent that belongs to another parent", async () => {
    const result = await grantAppleEntitlement({
      transaction: transaction(),
      requireParentProfileId: OTHER_PARENT,
      via: "restore",
    });
    expect(result).toEqual({ ok: false, reason: "intent_not_yours", retryable: false });
    expect(db.entitlements).toHaveLength(0);
  });

  it("refuses a transaction naming an intent that does not exist", async () => {
    const result = await grantAppleEntitlement({
      transaction: transaction({ appAccountToken: OTHER_INTENT }),
      via: "notification",
    });
    expect(result).toEqual({ ok: false, reason: "unknown_intent", retryable: false });
  });

  it("refuses when the child on the intent is gone rather than guessing one", async () => {
    db.iap_purchase_intents[0].student_profile_id = null;
    const result = await grantAppleEntitlement({ transaction: transaction(), via: "redeem" });
    expect(result).toEqual({ ok: false, reason: "child_missing", retryable: false });
  });

  it("refuses when a SECOND intent has already claimed the transaction", async () => {
    // One payment, two children, is the failure the unique partial index exists
    // to make unrepresentable. The database raises; this path must not swallow
    // it and grant anyway, because entitlement_grant's upsert would MOVE the
    // existing entitlement onto the other child.
    db.iap_purchase_intents.push({
      id: OTHER_INTENT,
      owner_parent_profile_id: PARENT,
      student_profile_id: CHILD,
      platform: "ios",
      product_id: MATH_MONTH,
      consumed_at: "2026-08-15T09:00:00.000Z",
      original_transaction_id: TXN,
    });
    const result = await grantAppleEntitlement({ transaction: transaction(), via: "redeem" });
    expect(result).toEqual({ ok: false, reason: "transaction_claimed", retryable: false });
    expect(db.entitlements).toHaveLength(0);
  });
});

describe("what was sold is read from our catalogue, never from Apple", () => {
  it("refuses a product this platform does not sell", async () => {
    const result = await grantAppleEntitlement({
      transaction: transaction({ productId: "ai.olympiq.app.sub.chess.year" }),
      via: "redeem",
    });
    expect(result).toEqual({ ok: false, reason: "unknown_product", retryable: false });
  });

  it("still grants a product that has been RETIRED since the tap", async () => {
    // Apple already took the money. Refusing here would keep it and deliver
    // nothing; `active` gates SELLING, not honouring.
    db.iap_products[0].active = false;
    const result = await grantAppleEntitlement({ transaction: transaction(), via: "redeem" });
    expect(result.ok && result.granted).toBe(true);
  });

  it("refuses a payload whose product TYPE contradicts our row", async () => {
    // An auto-renewable product where the catalogue says non-renewing means App
    // Store Connect drifted from the owner's decision, and the expiry we would
    // compute is a fiction.
    const result = await grantAppleEntitlement({
      transaction: transaction({ type: "Auto-Renewable Subscription" }),
      via: "redeem",
    });
    expect(result).toEqual({ ok: false, reason: "product_type_unexpected", retryable: false });
  });

  it("grants a package as LIFETIME, with the child's grade", async () => {
    db.iap_purchase_intents[0].product_id = OLY;
    const result = await grantAppleEntitlement({
      transaction: transaction({ productId: OLY, type: "Non-Consumable" }),
      via: "redeem",
    });
    expect(result.ok && result.granted).toBe(true);
    expect(grantCalls[0].p_scope).toBe("olympiad_package");
    expect(grantCalls[0].p_package_id).toBe(PACKAGE);
    expect(grantCalls[0].p_grade_id).toBe(GRADE);
    // ck_entitlement_lifetime: a package grant never expires.
    expect(grantCalls[0].p_ends_at).toBeNull();
  });

  it("grants what APPLE says was bought when the intent named something else", async () => {
    // The intent was opened for a month and the completed purchase is a year.
    // Refusing would keep the money and deliver nothing; the intent's job is to
    // name the CHILD, not to second-guess what the store charged for.
    db.iap_products.push({
      id: "prod-math-year",
      platform: "ios",
      product_id: "ai.olympiq.app.sub.math.year",
      scope: "subject",
      subject_id: SUBJECT,
      package_id: null,
      grade_id: null,
      interval: "year",
      active: true,
    });
    const result = await grantAppleEntitlement({
      transaction: transaction({ productId: "ai.olympiq.app.sub.math.year" }),
      via: "redeem",
    });
    expect(result.ok && result.granted).toBe(true);
    // A year, computed from OUR row for the product Apple actually charged for.
    expect(grantCalls[0].p_ends_at).toBe(new Date(Date.UTC(2027, 7, 15, 9, 0, 0)).toISOString());
  });

  it("refuses another app's purchase", async () => {
    const result = await grantAppleEntitlement({
      transaction: transaction({ bundleId: "com.someone.else" }),
      via: "notification",
    });
    expect(result).toEqual({ ok: false, reason: "bundle_id_mismatch", retryable: false });
  });

  it("refuses a refunded transaction", async () => {
    const result = await grantAppleEntitlement({
      transaction: transaction({ revocationDate: Date.UTC(2026, 7, 20) }),
      via: "notification",
    });
    expect(result).toEqual({ ok: false, reason: "revoked", retryable: false });
    expect(db.entitlements).toHaveLength(0);
  });
});

describe("a refusal says whether asking again could change it", () => {
  it("marks only OUR OWN faults retryable", async () => {
    // The notification consumer answers Apple non-2xx to ask for redelivery,
    // and Apple keeps trying for three days. Saying "retry" to a settled
    // decision buys three days of pointless traffic; saying "accepted" to a
    // transient fault throws the notification away forever.
    const settled = await grantAppleEntitlement({
      transaction: transaction({ revocationDate: Date.UTC(2026, 7, 20) }),
      via: "notification",
    });
    expect(settled.ok === false && settled.retryable).toBe(false);

    // A grant write that failed is ours, and is worth another delivery.
    const brokenAdmin = vi
      .spyOn(adminClient, "rpc")
      .mockResolvedValue({ data: null, error: { code: "40001", hint: null } });
    const transient = await grantAppleEntitlement({
      transaction: transaction(),
      via: "notification",
    });
    expect(transient).toEqual({ ok: false, reason: "grant_failed", retryable: true });
    brokenAdmin.mockRestore();
  });
});

describe("sandbox grants, because App Review buys in sandbox", () => {
  // THIS SUITE REPLACED ONE THAT PINNED THE OPPOSITE, and the reversal is the
  // point. It used to assert "returns a non-grant and writes NOTHING for a
  // sandbox purchase" — which sounded prudent and was in fact a rejection
  // waiting to happen: Apple's reviewer signs a SANDBOX Apple ID into the
  // PRODUCTION build, so refusing sandbox means they pay, receive nothing, and
  // reject the app for a purchase that does not work.
  //
  // The hazard the old test was really guarding — id collision against a global
  // unique index — is now handled by namespacing instead of refusal.

  it("grants access for a sandbox purchase", async () => {
    const result = await grantAppleEntitlement({
      transaction: transaction({ environment: "Sandbox" }),
      via: "redeem",
    });
    expect(result.ok && result.granted === true).toBe(true);
    expect(db.entitlements).toHaveLength(1);
  });

  it("reports the environment honestly rather than claiming Production", async () => {
    // A log, a route response and a support query must all be able to tell an
    // App Review purchase apart from a paying customer's.
    const result = await grantAppleEntitlement({
      transaction: transaction({ environment: "Sandbox" }),
      via: "redeem",
    });
    expect(result.ok && result.granted && result.environment).toBe("Sandbox");
  });

  it("namespaces the transaction id so it cannot block the production one", async () => {
    await grantAppleEntitlement({
      transaction: transaction({ environment: "Sandbox" }),
      via: "redeem",
    });
    const claimed = db.iap_purchase_intents[0].original_transaction_id as string;
    expect(claimed.startsWith("sbx:")).toBe(true);
    expect(claimed).not.toBe(TXN);
  });

  it("can be switched off, and then writes nothing at all", async () => {
    // The escape hatch for after go-live, when the reviewer no longer needs it.
    const previous = process.env.APPLE_IAP_SANDBOX_GRANTS;
    process.env.APPLE_IAP_SANDBOX_GRANTS = "off";
    try {
      const result = await grantAppleEntitlement({
        transaction: transaction({ environment: "Sandbox" }),
        via: "redeem",
      });
      expect(result.ok && result.granted === false).toBe(true);
      expect(db.entitlements).toHaveLength(0);
      expect(db.iap_purchase_intents[0].original_transaction_id).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.APPLE_IAP_SANDBOX_GRANTS;
      else process.env.APPLE_IAP_SANDBOX_GRANTS = previous;
    }
  });
});

describe("only a re-queried transaction can become access", () => {
  it("refuses a notification body outright, however valid its signature", async () => {
    const fromNotification = { ...transaction(), source: "notification" as const };
    const result = await grantAppleEntitlement({
      transaction: fromNotification,
      via: "notification",
    });
    expect(result).toEqual({ ok: false, reason: "not_requeried", retryable: false });
    // It must not even reach the catalogue.
    expect(grantCalls).toHaveLength(0);
  });

  it("asks PRODUCTION first and falls back to sandbox only on not-found", async () => {
    railAnswers.Production = { ok: false, status: 404, apiError: 4040010 };
    railAnswers.Sandbox = { ok: true, blob: "sandbox-blob" };
    verifiedBlobs.set("sandbox-blob", transaction({ environment: "Sandbox" }));

    const result = await requeryVerifiedTransaction(TXN);
    expect(result.ok).toBe(true);
    expect(result.ok && result.transaction.environment).toBe("Sandbox");
    expect(result.ok && result.transaction.source).toBe("requery");
  });

  it("does NOT ask sandbox when production merely failed", async () => {
    // A 500 or a network fault is not "no such transaction here". Treating it
    // as one would ask a sandbox Apple ID to adjudicate a real purchase.
    railAnswers.Production = { ok: false, status: 500, apiError: 5000000 };
    railAnswers.Sandbox = { ok: true, blob: "sandbox-blob" };
    verifiedBlobs.set("sandbox-blob", transaction({ environment: "Sandbox" }));

    const result = await requeryVerifiedTransaction(TXN);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports not_found when neither host knows the id", async () => {
    railAnswers.Production = { ok: false, status: 404, apiError: 4040010 };
    railAnswers.Sandbox = { ok: false, status: 404, apiError: 4040010 };
    const result = await requeryVerifiedTransaction("9999999999");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("the double-billing probe", () => {
  it("sees a live subject grant from ANY source", async () => {
    db.entitlements.push({
      id: "e1",
      student_profile_id: CHILD,
      scope: "subject",
      subject_id: SUBJECT,
      revoked_at: null,
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2099-01-01T00:00:00.000Z",
    });
    await expect(
      hasLiveEntitlement({
        studentProfileId: CHILD,
        scope: "subject",
        subjectId: SUBJECT,
        packageId: null,
      }),
    ).resolves.toBe(true);
  });

  it("ignores an EXPIRED grant", async () => {
    db.entitlements.push({
      id: "e2",
      student_profile_id: CHILD,
      scope: "subject",
      subject_id: SUBJECT,
      revoked_at: null,
      starts_at: "2020-01-01T00:00:00.000Z",
      ends_at: "2020-02-01T00:00:00.000Z",
    });
    await expect(
      hasLiveEntitlement({
        studentProfileId: CHILD,
        scope: "subject",
        subjectId: SUBJECT,
        packageId: null,
      }),
    ).resolves.toBe(false);
  });

  it("ignores a REVOKED grant — a refund frees the subject to be bought again", async () => {
    db.entitlements.push({
      id: "e3",
      student_profile_id: CHILD,
      scope: "subject",
      subject_id: SUBJECT,
      revoked_at: "2026-08-01T00:00:00.000Z",
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2099-01-01T00:00:00.000Z",
    });
    await expect(
      hasLiveEntitlement({
        studentProfileId: CHILD,
        scope: "subject",
        subjectId: SUBJECT,
        packageId: null,
      }),
    ).resolves.toBe(false);
  });

  it("treats a LIFETIME package grant as live (ends_at is always null there)", async () => {
    db.entitlements.push({
      id: "e4",
      student_profile_id: CHILD,
      scope: "olympiad_package",
      package_id: PACKAGE,
      revoked_at: null,
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: null,
    });
    await expect(
      hasLiveEntitlement({
        studentProfileId: CHILD,
        scope: "olympiad_package",
        subjectId: null,
        packageId: PACKAGE,
      }),
    ).resolves.toBe(true);
  });

  it("does not confuse one child's grant with another's", async () => {
    db.entitlements.push({
      id: "e5",
      student_profile_id: "9f8c1d2e-1111-4222-8333-444455556666",
      scope: "subject",
      subject_id: SUBJECT,
      revoked_at: null,
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2099-01-01T00:00:00.000Z",
    });
    await expect(
      hasLiveEntitlement({
        studentProfileId: CHILD,
        scope: "subject",
        subjectId: SUBJECT,
        packageId: null,
      }),
    ).resolves.toBe(false);
  });
});
