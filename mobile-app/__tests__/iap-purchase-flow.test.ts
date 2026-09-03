// THE APPLE PURCHASE SEQUENCE, proved without a device.
//
// WHY THIS FILE EXISTS. The owner may not be able to test this rail before Apple
// reviews it, so every claim the flow makes has to be checkable from source. The
// two claims that money depends on:
//
//   1. THE ORDER. intent → buy → redeem → finish. Swapping any pair loses
//      something unrecoverable: without the intent first there is no
//      appAccountToken and no way to know which CHILD a purchase was for; with
//      finish before redeem, an app that dies in between throws away the last
//      local copy of a payment nobody recorded.
//   2. FINISH ONLY ON AN ACKNOWLEDGED TRANSACTION. Every redeem failure — a
//      timeout, a refusal, a thrown error — must leave the transaction
//      UNFINISHED so Restore, the App Store Server Notification and the
//      reconcile sweep can each still settle it.
//
// The flows import nothing from expo-iap, react or react-native, which is what
// makes this a plain unit test with a fake store rather than a device run.
import { runPurchase } from "../src/features/iap/purchaseFlow";
import { runRestore } from "../src/features/iap/restoreFlow";
import { StoreError, type IapApi, type IapStore, type StorePurchase } from "../src/features/iap/types";

const PRODUCT = "ai.olympiq.app.sub.math.month";
const STUDENT = "11111111-1111-4111-8111-111111111111";
const INTENT = "22222222-2222-4222-8222-222222222222";

function purchased(overrides: Partial<StorePurchase> = {}): StorePurchase {
  return {
    transactionId: "TX-1",
    productId: PRODUCT,
    appAccountToken: INTENT,
    purchaseState: "purchased",
    raw: { transactionId: "TX-1" },
    ...overrides,
  };
}

type Harness = {
  calls: string[];
  store: IapStore;
  api: IapApi;
};

/** A fake store + BFF that records the exact call order. */
function harness(opts: {
  buy?: () => Promise<StorePurchase>;
  openIntent?: IapApi["openIntent"];
  redeem?: IapApi["redeem"];
  restore?: IapApi["restore"];
  transactionIds?: () => Promise<string[]>;
  sync?: () => Promise<void>;
  finish?: () => Promise<void>;
} = {}): Harness {
  const calls: string[] = [];
  const store: IapStore = {
    connect: async () => {
      calls.push("connect");
    },
    fetchProducts: async () => [],
    buy: async ({ appAccountToken }) => {
      calls.push(`buy:${appAccountToken}`);
      return opts.buy ? await opts.buy() : purchased();
    },
    finish: async () => {
      calls.push("finish");
      if (opts.finish) await opts.finish();
    },
    sync: async () => {
      calls.push("sync");
      if (opts.sync) await opts.sync();
    },
    transactionIds: async () => {
      calls.push("transactionIds");
      return opts.transactionIds ? await opts.transactionIds() : [];
    },
  };
  const api: IapApi = {
    openIntent: async (studentProfileId, productId) => {
      calls.push(`intent:${studentProfileId}:${productId}`);
      if (opts.openIntent) return opts.openIntent(studentProfileId, productId);
      return { ok: true, data: { intent_id: INTENT } };
    },
    redeem: async (intentId, transactionId) => {
      calls.push(`redeem:${intentId}:${transactionId}`);
      if (opts.redeem) return opts.redeem(intentId, transactionId);
      return { ok: true, data: { granted: true, already: false, ends_at: "2026-10-01T00:00:00Z" } };
    },
    restore: async (ids) => {
      calls.push(`restore:${ids.join("|")}`);
      if (opts.restore) return opts.restore(ids);
      return { ok: true, data: { checked: ids.length, granted: 0 } };
    },
  };
  return { calls, store, api };
}

function run(h: Harness, onStep?: (s: string) => void) {
  return runPurchase({
    store: h.store,
    api: h.api,
    productId: PRODUCT,
    studentProfileId: STUDENT,
    onStep: onStep as never,
  });
}

describe("the purchase sequence runs in the only safe order", () => {
  it("goes intent → buy → redeem → finish", async () => {
    const h = harness();
    const steps: string[] = [];
    const outcome = await run(h, (s) => steps.push(s));
    expect(steps).toEqual(["intent", "buy", "redeem", "finish"]);
    expect(outcome).toEqual({
      status: "granted",
      already: false,
      endsAt: "2026-10-01T00:00:00Z",
    });
  });

  it("opens the intent BEFORE the store sheet, and hands its id to StoreKit", async () => {
    // The intent id IS the appAccountToken. If the sheet opened first there
    // would be nothing to attach, and the transaction could never be tied to a
    // child.
    const h = harness();
    await run(h);
    expect(h.calls).toEqual([
      `intent:${STUDENT}:${PRODUCT}`,
      `buy:${INTENT}`,
      `redeem:${INTENT}:TX-1`,
      "finish",
    ]);
  });

  it("redeems BEFORE it finishes", async () => {
    const h = harness();
    await run(h);
    expect(h.calls.indexOf(`redeem:${INTENT}:TX-1`) < h.calls.indexOf("finish")).toBe(true);
  });

  it("never opens the sheet when the intent is refused", async () => {
    const h = harness({
      openIntent: async () => ({ ok: false, error: "iap.err.alreadyActive", retryable: false }),
    });
    const outcome = await run(h);
    expect(h.calls).toEqual([`intent:${STUDENT}:${PRODUCT}`]);
    expect(outcome).toEqual({ status: "failed", messageKey: "iap.err.alreadyActive" });
  });
});

describe("the platform kill switch refuses without announcing itself", () => {
  // `gate.paymentsOff` — "Payments are temporarily paused. New subscriptions
  // and purchases are unavailable right now." — is the exact string Apple
  // rejected the 2026-08-26 submission over (2.1.0 App Completeness). The
  // refusal must still happen; the sentence must not reach a store binary.
  it("still refuses, and no sheet opens", async () => {
    const h = harness({
      openIntent: async () => ({ ok: false, error: "gate.paymentsOff", retryable: true }),
    });
    const outcome = await run(h);
    expect(h.calls).toEqual([`intent:${STUDENT}:${PRODUCT}`]);
    expect(outcome).toEqual({ status: "failed", messageKey: "iap.err.unavailable" });
  });

  it("does not leak the payment-state sentence out of restore either", async () => {
    const h = harness({
      transactionIds: async () => ["TX-1"],
      restore: async () => ({ ok: false, error: "gate.paymentsOff", retryable: true }),
    });
    const outcome = await runRestore({ store: h.store, api: h.api });
    expect(outcome).toEqual({ status: "failed", messageKey: "iap.err.unavailable" });
  });
});

describe("a cancelled purchase is not an error", () => {
  it("produces the cancelled outcome and no message", async () => {
    const h = harness({
      buy: async () => {
        throw new StoreError("cancelled");
      },
    });
    const outcome = await run(h);
    expect(outcome).toEqual({ status: "cancelled" });
  });

  it("neither redeems nor finishes", async () => {
    const h = harness({
      buy: async () => {
        throw new StoreError("cancelled");
      },
    });
    await run(h);
    expect(h.calls).toEqual([`intent:${STUDENT}:${PRODUCT}`, `buy:${INTENT}`]);
  });
});

describe("a failed redeem NEVER finishes the transaction", () => {
  // This is the single most important guarantee in the rail: the money is gone
  // and the device still holds the only local record of it.
  it("leaves a retryable failure unfinished and calls it pending", async () => {
    const h = harness({
      redeem: async () => ({ ok: false, error: "mob.err.network", retryable: true }),
    });
    const outcome = await run(h);
    expect(h.calls.includes("finish")).toBe(false);
    expect(outcome).toEqual({ status: "pending", detailKey: null });
  });

  it("leaves a SETTLED refusal unfinished too, and quotes the server", async () => {
    // "This payment was refunded" will never grant — and it is still not
    // finished, because a finished transaction cannot be restored or swept.
    const h = harness({
      redeem: async () => ({ ok: false, error: "iap.err.revoked", retryable: false }),
    });
    const outcome = await run(h);
    expect(h.calls.includes("finish")).toBe(false);
    expect(outcome).toEqual({ status: "pending", detailKey: "iap.err.revoked" });
  });

  it("leaves a thrown redeem unfinished", async () => {
    const h = harness({
      redeem: async () => {
        throw new Error("socket hung up");
      },
    });
    const outcome = await run(h);
    expect(h.calls.includes("finish")).toBe(false);
    expect(outcome).toEqual({ status: "pending", detailKey: null });
  });

  it("never reports a failure once money has moved", async () => {
    // `failed` is reserved for the branches where nothing was charged. After a
    // successful buy the flow may only answer granted / recorded / pending.
    const h = harness({
      redeem: async () => ({ ok: false, error: "iap.err.generic", retryable: true }),
    });
    const outcome = await run(h);
    expect(outcome.status).toBe("pending");
  });
});

describe("the store's other answers", () => {
  it("treats a buy timeout as pending, not as a failure", async () => {
    // We stopped waiting; we do NOT know whether a charge happened. Telling a
    // charged family it failed is the one lie this module exists to prevent.
    const h = harness({
      buy: async () => {
        throw new StoreError("timeout");
      },
    });
    const outcome = await run(h);
    expect(outcome).toEqual({ status: "pending", detailKey: null });
  });

  it("reports a restricted device with its own sentence", async () => {
    const h = harness({
      buy: async () => {
        throw new StoreError("notAllowed");
      },
    });
    const outcome = await run(h);
    expect(outcome).toEqual({ status: "failed", messageKey: "mob.iap.err.notAllowed" });
  });

  it("treats an Ask-to-Buy transaction as deferred and does not finish it", async () => {
    const h = harness({ buy: async () => purchased({ purchaseState: "pending" }) });
    const outcome = await run(h);
    expect(h.calls.includes("finish")).toBe(false);
    expect(outcome).toEqual({ status: "deferred" });
  });

  it("does not redeem a transaction that carries no id", async () => {
    const h = harness({ buy: async () => purchased({ transactionId: "" }) });
    const outcome = await run(h);
    expect(h.calls).toEqual([`intent:${STUDENT}:${PRODUCT}`, `buy:${INTENT}`]);
    expect(outcome).toEqual({ status: "pending", detailKey: null });
  });

  it("finishes a SANDBOX purchase the server acknowledged but did not grant", async () => {
    // App Review buys in sandbox against this same deployment, so this is the
    // path a reviewer takes. The server answered ok, so the transaction is
    // settled and StoreKit may stop replaying it.
    const h = harness({
      redeem: async () => ({ ok: true, data: { granted: false, message: "iap.msg.recorded" } }),
    });
    const outcome = await run(h);
    expect(h.calls.includes("finish")).toBe(true);
    expect(outcome).toEqual({ status: "recorded", messageKey: "iap.msg.recorded" });
  });

  it("keeps a granted purchase granted even when finishing throws", async () => {
    const h = harness({
      finish: async () => {
        throw new Error("finish exploded");
      },
    });
    const outcome = await run(h);
    expect(outcome.status).toBe("granted");
  });
});

describe("restore", () => {
  it("answers calmly when the device has nothing, without a round trip", async () => {
    const h = harness({ transactionIds: async () => [] });
    const outcome = await runRestore({ store: h.store, api: h.api });
    expect(outcome).toEqual({ status: "nothing" });
    expect(h.calls.some((c) => c.startsWith("restore:"))).toBe(false);
  });

  it("still restores when the Apple ID sync prompt is dismissed", async () => {
    const h = harness({
      sync: async () => {
        throw new Error("user dismissed the password prompt");
      },
      transactionIds: async () => ["TX-9"],
      restore: async () => ({ ok: true, data: { checked: 1, granted: 1 } }),
    });
    const outcome = await runRestore({ store: h.store, api: h.api });
    expect(outcome).toEqual({ status: "restored", granted: 1 });
  });

  it("deduplicates the ids it sends", async () => {
    const h = harness({ transactionIds: async () => ["TX-1", "TX-1", "", "TX-2"] });
    await runRestore({ store: h.store, api: h.api });
    expect(h.calls.includes("restore:TX-1|TX-2")).toBe(true);
  });

  it("reports nothing rather than success when the server granted none", async () => {
    const h = harness({
      transactionIds: async () => ["TX-1"],
      restore: async () => ({ ok: true, data: { checked: 1, granted: 0 } }),
    });
    const outcome = await runRestore({ store: h.store, api: h.api });
    expect(outcome).toEqual({ status: "nothing" });
  });

  it("shows the server's own sentence when the call is refused", async () => {
    const h = harness({
      transactionIds: async () => ["TX-1"],
      restore: async () => ({ ok: false, error: "parent.err.tooMany", retryable: false }),
    });
    const outcome = await runRestore({ store: h.store, api: h.api });
    expect(outcome).toEqual({ status: "failed", messageKey: "parent.err.tooMany" });
  });

  it("survives a StoreKit that cannot be reached at all", async () => {
    const h = harness({
      transactionIds: async () => {
        throw new StoreError("unavailable");
      },
    });
    const outcome = await runRestore({ store: h.store, api: h.api });
    expect(outcome).toEqual({ status: "failed", messageKey: "mob.iap.err.unavailable" });
  });
});
