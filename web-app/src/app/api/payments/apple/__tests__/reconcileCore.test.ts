// THE MISSED-NOTIFICATION SWEEP, exercised without Apple and without a database.
//
// What these tests protect: the sweep must GRANT what Apple confirms, REVOKE
// what Apple says was refunded (a dropped REFUND notification is the expensive
// direction of a lost message), and CHANGE NOTHING when it cannot get an answer.
// The last one is the easiest to break by "helpfully" treating an unreachable
// API as an empty result.
import { describe, expect, it, vi } from "vitest";
import type { AppleTransactionPayload } from "@/lib/payments/apple";
import { reconcileAppleIntents, type ReconcileDeps } from "../_lib/reconcileCore";

const BUNDLE_ID = "ai.olympiq.app";
const INTENT_ID = "6c4a6f0e-3a1b-4f5c-9b2d-7e8f0a1b2c3d";
const TXN_ID = "2000000912345678";
const PRODUCT_ID = "ai.olympiq.app.sub.math.month";
const PURCHASE_DATE = Date.UTC(2026, 7, 15, 9, 30, 0);

function payload(overrides: Partial<AppleTransactionPayload> = {}): AppleTransactionPayload {
  return {
    transactionId: TXN_ID,
    originalTransactionId: TXN_ID,
    bundleId: BUNDLE_ID,
    productId: PRODUCT_ID,
    purchaseDate: PURCHASE_DATE,
    quantity: 1,
    type: "Non-Renewing Subscription",
    appAccountToken: INTENT_ID,
    inAppOwnershipType: "PURCHASED",
    environment: "Production",
    ...overrides,
  };
}

function deps(options: {
  candidates?: { intentId: string; productId: string; originalTransactionId: string }[];
  requeryOk?: boolean;
  requeried?: AppleTransactionPayload;
  /** What the shared writer answers. Defaults to a production grant. */
  writeResult?: unknown;
  unattributable?: number;
} = {}) {
  const calls = {
    getTransactionInfo: vi.fn(async () =>
      options.requeryOk === false
        ? { ok: false as const }
        : { ok: true as const, signedTransactionInfo: "signed.requeried" },
    ),
    verifyTransaction: vi.fn(async (_s: string, source: string) => ({
      environment: "Production" as const,
      source,
      payload: options.requeried ?? payload(),
    })),
    revoke: vi.fn(async () => true),
    // `grantAppleEntitlement` — the same function the notification consumer and
    // the redeem route call. It owns everything about WHAT was bought, so the
    // sweep is driven by what that one function answered.
    write: vi.fn(async () =>
      options.writeResult ?? {
        ok: true,
        granted: true,
        environment: "Production",
        entitlementId: "ent-1",
        alreadyGranted: false,
        intentId: INTENT_ID,
        studentProfileId: "student-1",
        scope: "subject",
        productId: PRODUCT_ID,
        originalTransactionId: TXN_ID,
        endsAt: null,
      },
    ),
    listCandidates: vi.fn(async () =>
      options.candidates ?? [
        { intentId: INTENT_ID, productId: PRODUCT_ID, originalTransactionId: TXN_ID },
      ],
    ),
    countUnattributable: vi.fn(async () => options.unattributable ?? 0),
  };
  return {
    calls,
    deps: { ...calls } as unknown as ReconcileDeps,
  };
}

describe("reconcileAppleIntents", () => {
  it("grants a purchase whose notification never arrived", async () => {
    const h = deps();
    const summary = await reconcileAppleIntents(h.deps);

    expect(summary.candidates).toBe(1);
    expect(summary.queried).toBe(1);
    expect(summary.granted).toBe(1);
    expect(summary.unresolved).toBe(0);
    // Verified as a RE-QUERY, which is the only source `toAppleGrant` accepts.
    expect(h.calls.verifyTransaction).toHaveBeenCalledWith("signed.requeried", "requery");
    expect(h.calls.write).toHaveBeenCalledTimes(1);
  });

  it("revokes a purchase Apple reports as refunded", async () => {
    // The dropped-REFUND case: money back, access still live, and no message
    // ever told us. This pass is the only thing that notices.
    const h = deps({ requeried: payload({ revocationDate: PURCHASE_DATE + 86_400_000 }) });
    const summary = await reconcileAppleIntents(h.deps);

    expect(summary.revoked).toBe(1);
    expect(summary.granted).toBe(0);
    expect(h.calls.revoke).toHaveBeenCalledWith(TXN_ID, "apple_refund_reconcile");
    expect(h.calls.write).not.toHaveBeenCalled();
  });

  it("changes nothing when Apple cannot be reached", async () => {
    const h = deps({ requeryOk: false });
    const summary = await reconcileAppleIntents(h.deps);

    expect(summary.queried).toBe(0);
    expect(summary.granted).toBe(0);
    expect(summary.revoked).toBe(0);
    expect(summary.unresolved).toBe(1);
    expect(h.calls.write).not.toHaveBeenCalled();
    expect(h.calls.revoke).not.toHaveBeenCalled();
  });

  it("leaves a purchase the writer refuses unresolved, so the next pass sees it again", async () => {
    // An unknown product, a deleted child, a payload that disagrees with our
    // catalogue: all "still not delivered", and the intent stays unconsumed.
    for (const reason of ["unknown_product", "child_missing", "product_type_unexpected"]) {
      const h = deps({ writeResult: { ok: false, reason } });
      const summary = await reconcileAppleIntents(h.deps);

      expect(summary.unresolved).toBe(1);
      expect(summary.granted).toBe(0);
    }
  });

  it("does not count a verified SANDBOX transaction as granted", async () => {
    // Unreachable on the production rail this sweep uses, and pinned anyway: the
    // writer answering `granted: false` must never be read as a success.
    const h = deps({
      writeResult: {
        ok: true,
        granted: false,
        environment: "Sandbox",
        intentId: INTENT_ID,
        studentProfileId: "student-1",
        productId: PRODUCT_ID,
        originalTransactionId: TXN_ID,
      },
    });
    const summary = await reconcileAppleIntents(h.deps);

    expect(summary.granted).toBe(0);
    expect(summary.unresolved).toBe(1);
  });

  it("reports intents it can never ask about instead of hiding them", async () => {
    // The App Store Server API is addressed by transaction id; there is no
    // endpoint that takes an appAccountToken. Making that backlog a number is
    // the difference between a known limitation and a silent one.
    const h = deps({ candidates: [], unattributable: 7 });
    const summary = await reconcileAppleIntents(h.deps);

    expect(summary.candidates).toBe(0);
    expect(summary.unattributable).toBe(7);
  });

  it("honours the batch bound it is given", async () => {
    const h = deps();
    await reconcileAppleIntents(h.deps, 5);
    expect(h.calls.listCandidates).toHaveBeenCalledWith(5);
  });
});
