// THE GOOGLE PLAY RAIL (owner decision 2026-10-10: Android sells like iOS).
//
// The purchase SEQUENCE is the one iap-purchase-flow.test.ts proves for Apple —
// intent → buy → redeem → finish, never finish before the server answered.
// This file pins what is DIFFERENT on Play, each a way to lose a family's money
// or block their next purchase:
//
//   1. FINISH = CONSUME, AND ONLY AFTER A GRANT. A consumed Play purchase drops
//      out of getAvailablePurchases(), so consuming one the server did not
//      grant would leave Restore nothing to find.
//   2. A SECOND CONSUME IS HARMLESS. The server consumes after it grants; the
//      device's own consume then fails (ITEM_NOT_OWNED) and must not turn a
//      granted purchase into an error.
//   3. GOOGLE NEEDS THE PRODUCT. Redeem and restore name the product of every
//      purchase token; a token with no product is never sent half-formed.
//   4. THE TOKEN IS THE KEY, NOT THE ORDER ID. purchaseToken is what the server
//      verifies; the order id rides along for audit only.
import { runPurchase } from "../src/features/iap/purchaseFlow";
import { runRestore } from "../src/features/iap/restoreFlow";
import {
  StoreError,
  type IapApi,
  type IapStore,
  type RestoreItem,
  type StorePurchase,
} from "../src/features/iap/types";

// store.ts imports expo-iap at module scope; only its pure parser is used here.
jest.mock("expo-iap", () => ({
  ErrorCode: { AlreadyOwned: "already-owned", UserCancelled: "user-cancelled" },
}));

// The BFF client builds a Supabase client at import; the adapter is tested
// against these fakes instead.
const mockIntent = jest.fn();
const mockRedeem = jest.fn();
const mockRestore = jest.fn();
jest.mock("@/lib/api", () => ({
  bffIapIntent: jest.fn(),
  bffIapRedeem: jest.fn(),
  bffIapRestore: jest.fn(),
  bffGoogleIapIntent: (...a: unknown[]) => mockIntent(...a),
  bffGoogleIapRedeem: (...a: unknown[]) => mockRedeem(...a),
  bffGoogleIapRestore: (...a: unknown[]) => mockRestore(...a),
}));

const PRODUCT = "ai.olympiq.app.sub.math.month";
const STUDENT = "11111111-1111-4111-8111-111111111111";
const INTENT = "22222222-2222-4222-8222-222222222222";
const TOKEN = "play-purchase-token-abc";

function playPurchase(overrides: Partial<StorePurchase> = {}): StorePurchase {
  return {
    transactionId: TOKEN,
    productId: PRODUCT,
    appAccountToken: INTENT,
    purchaseState: "purchased",
    orderId: "GPA.1234-5678",
    raw: { purchaseToken: TOKEN },
    ...overrides,
  };
}

function googleHarness(opts: {
  buy?: () => Promise<StorePurchase>;
  redeem?: IapApi["redeem"];
  finish?: () => Promise<void>;
  items?: () => Promise<RestoreItem[]>;
  restore?: IapApi["restore"];
} = {}) {
  const calls: string[] = [];
  const redeemContexts: unknown[] = [];
  const restoreArgs: unknown[] = [];
  const store: IapStore = {
    finishOnlyWhenGranted: true,
    connect: async () => {},
    fetchProducts: async () => [],
    buy: async ({ appAccountToken }) => {
      calls.push(`buy:${appAccountToken}`);
      return opts.buy ? opts.buy() : playPurchase();
    },
    finish: async () => {
      calls.push("finish");
      if (opts.finish) await opts.finish();
    },
    sync: async () => {
      calls.push("sync");
    },
    transactionIds: async () => {
      calls.push("transactionIds");
      return [];
    },
    restorableItems: async () => {
      calls.push("restorableItems");
      return opts.items ? opts.items() : [];
    },
  };
  const api: IapApi = {
    openIntent: async () => {
      calls.push("intent");
      return { ok: true, data: { intent_id: INTENT } };
    },
    redeem: async (intentId, transactionId, context) => {
      calls.push(`redeem:${intentId}:${transactionId}`);
      redeemContexts.push(context);
      if (opts.redeem) return opts.redeem(intentId, transactionId, context);
      return { ok: true, data: { granted: true, already: false, ends_at: null } };
    },
    restore: async (ids, items) => {
      calls.push(`restore:${ids.join("|")}`);
      restoreArgs.push(items);
      if (opts.restore) return opts.restore(ids, items);
      return { ok: true, data: { checked: ids.length, granted: ids.length } };
    },
  };
  return { calls, store, api, redeemContexts, restoreArgs };
}

const run = (h: ReturnType<typeof googleHarness>) =>
  runPurchase({ store: h.store, api: h.api, productId: PRODUCT, studentProfileId: STUDENT });

describe("the Play purchase sequence", () => {
  it("redeems the purchase TOKEN with the product and order id, then consumes", async () => {
    const h = googleHarness();
    const outcome = await run(h);
    expect(h.calls).toEqual(["intent", `buy:${INTENT}`, `redeem:${INTENT}:${TOKEN}`, "finish"]);
    expect(h.redeemContexts).toEqual([{ productId: PRODUCT, orderId: "GPA.1234-5678" }]);
    expect(outcome.status).toBe("granted");
  });

  it("sends a null order id rather than inventing one", async () => {
    const h = googleHarness({ buy: async () => playPurchase({ orderId: null }) });
    await run(h);
    expect(h.redeemContexts).toEqual([{ productId: PRODUCT, orderId: null }]);
  });

  it("does NOT consume a purchase the server acknowledged without granting", async () => {
    // Apple finishes this case (a sandbox purchase); Play must not, or the
    // purchase vanishes from the list Restore reads.
    const h = googleHarness({
      redeem: async () => ({ ok: true, data: { granted: false, message: "iap.msg.recorded" } }),
    });
    const outcome = await run(h);
    expect(h.calls.includes("finish")).toBe(false);
    expect(outcome).toEqual({ status: "recorded", messageKey: "iap.msg.recorded" });
  });

  it("does NOT consume when the redeem fails, and calls it pending", async () => {
    const h = googleHarness({
      redeem: async () => ({ ok: false, error: "iap.err.generic", retryable: true }),
    });
    const outcome = await run(h);
    expect(h.calls.includes("finish")).toBe(false);
    expect(outcome).toEqual({ status: "pending", detailKey: null });
  });

  it("keeps a grant a grant when the device's second consume is refused", async () => {
    // The server consumed first; Play answers the device ITEM_NOT_OWNED.
    const h = googleHarness({
      finish: async () => {
        throw new Error("item-not-owned");
      },
    });
    const outcome = await run(h);
    expect(outcome.status).toBe("granted");
  });

  it("treats a PENDING Play payment as deferred: no redeem, no consume", async () => {
    // Cash / bank-transfer payment methods: no money has moved yet. Google's
    // real-time notification settles it on the server when it completes.
    const h = googleHarness({ buy: async () => playPurchase({ purchaseState: "pending" }) });
    const outcome = await run(h);
    expect(h.calls).toEqual(["intent", `buy:${INTENT}`]);
    expect(outcome).toEqual({ status: "deferred" });
  });

  it("answers Play's ALREADY_OWNED with its own sentence, charging nothing", async () => {
    const h = googleHarness({
      buy: async () => {
        throw new StoreError("alreadyOwned");
      },
    });
    const outcome = await run(h);
    expect(h.calls).toEqual(["intent", `buy:${INTENT}`]);
    expect(outcome).toEqual({ status: "failed", messageKey: "mob.iap.err.alreadyOwned" });
  });
});

describe("Play restore", () => {
  it("sends every token WITH its product, deduplicated", async () => {
    const h = googleHarness({
      items: async () => [
        { transactionId: "t1", productId: PRODUCT },
        { transactionId: "t1", productId: PRODUCT },
        { transactionId: "t2", productId: "ai.olympiq.app.sub.math.year" },
        { transactionId: "", productId: PRODUCT },
      ],
    });
    const outcome = await runRestore({ store: h.store, api: h.api });
    expect(h.calls).toContain("restore:t1|t2");
    expect(h.restoreArgs).toEqual([
      [
        { transactionId: "t1", productId: PRODUCT },
        { transactionId: "t2", productId: "ai.olympiq.app.sub.math.year" },
      ],
    ]);
    expect(outcome).toEqual({ status: "restored", granted: 2 });
    // Restore never consumes: the server does, after it grants.
    expect(h.calls.includes("finish")).toBe(false);
  });

  it("answers calmly when Play holds nothing unconsumed", async () => {
    const h = googleHarness({ items: async () => [] });
    expect(await runRestore({ store: h.store, api: h.api })).toEqual({ status: "nothing" });
    expect(h.calls.some((c) => c.startsWith("restore:"))).toBe(false);
  });
});

describe("the Google BFF adapter", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { googleIapApi } = require("../src/features/iap/api") as typeof import("../src/features/iap/api");

  beforeEach(() => {
    mockIntent.mockReset();
    mockRedeem.mockReset();
    mockRestore.mockReset();
  });

  it("opens the intent on the Google route and returns its id", async () => {
    mockIntent.mockResolvedValue({ ok: true, data: { intent_id: INTENT } });
    const res = await googleIapApi.openIntent(STUDENT, PRODUCT);
    expect(mockIntent).toHaveBeenCalledWith(STUDENT, PRODUCT);
    expect(res).toEqual({ ok: true, data: { intent_id: INTENT } });
  });

  it("redeems with intent, product, token and order id", async () => {
    mockRedeem.mockResolvedValue({ ok: true, data: { granted: true, already: true, ends_at: "2026-11-10T00:00:00Z" } });
    const res = await googleIapApi.redeem(INTENT, TOKEN, { productId: PRODUCT, orderId: "GPA.1" });
    expect(mockRedeem).toHaveBeenCalledWith(INTENT, PRODUCT, TOKEN, "GPA.1");
    expect(res).toEqual({
      ok: true,
      data: { granted: true, already: true, message: undefined, ends_at: "2026-11-10T00:00:00Z" },
    });
  });

  it("never calls redeem without a product — the purchase stays for Restore", async () => {
    const res = await googleIapApi.redeem(INTENT, TOKEN);
    expect(mockRedeem).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: false, error: "iap.err.generic", retryable: true });
  });

  it("passes the server's refusal key through untouched", async () => {
    mockRedeem.mockResolvedValue({ ok: false, error: "iap.err.alreadyUsed", retryable: false });
    const res = await googleIapApi.redeem(INTENT, TOKEN, { productId: PRODUCT, orderId: null });
    expect(res).toEqual({ ok: false, error: "iap.err.alreadyUsed", retryable: false });
  });

  it("restores {product_id, purchase_token} pairs and drops tokens with no product", async () => {
    mockRestore.mockResolvedValue({ ok: true, data: { checked: 1, granted: 1, results: [] } });
    const res = await googleIapApi.restore(["t1", "t2"], [
      { transactionId: "t1", productId: PRODUCT },
      { transactionId: "t2", productId: null },
    ]);
    expect(mockRestore).toHaveBeenCalledWith([{ product_id: PRODUCT, purchase_token: "t1" }]);
    expect(res).toEqual({ ok: true, data: { checked: 1, granted: 1 } });
  });

  it("makes no call at all when nothing restorable names a product", async () => {
    const res = await googleIapApi.restore(["t2"], [{ transactionId: "t2", productId: null }]);
    expect(mockRestore).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, data: { checked: 0, granted: 0 } });
  });
});

describe("reading a Play purchase payload", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toGooglePurchase } = require("../src/features/iap/store") as typeof import("../src/features/iap/store");

  it("uses the purchase TOKEN as the verification id and the intent as the binding", () => {
    const p = toGooglePurchase({
      productId: PRODUCT,
      purchaseToken: TOKEN,
      transactionId: "GPA.42",
      obfuscatedAccountIdAndroid: INTENT,
      purchaseState: "purchased",
    });
    expect(p).toMatchObject({
      transactionId: TOKEN,
      productId: PRODUCT,
      appAccountToken: INTENT,
      purchaseState: "purchased",
      orderId: "GPA.42",
    });
  });

  it("never mistakes the token for an order id", () => {
    const p = toGooglePurchase({ productId: PRODUCT, purchaseToken: TOKEN, id: TOKEN });
    expect(p?.orderId).toBeNull();
  });

  it("degrades an unknown state and missing fields instead of throwing", () => {
    const p = toGooglePurchase({ purchaseState: 2 });
    expect(p).toMatchObject({ transactionId: "", productId: "", appAccountToken: null, purchaseState: "unknown" });
    expect(toGooglePurchase(null)).toBeNull();
    expect(toGooglePurchase("x")).toBeNull();
  });
});
