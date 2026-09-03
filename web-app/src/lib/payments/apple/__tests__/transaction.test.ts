// Turning a verified Apple transaction into a grant — the rules that decide
// whether a payment becomes access.
//
// Every case below is a refusal that would otherwise be a silent wrong grant:
// a notification body believed on its own, a sandbox purchase honoured in
// production, a refunded transaction still granting, an intent id we cannot
// attribute to a child.
import { describe, expect, it } from "vitest";
import {
  isRevoked,
  requireProductionGrant,
  toAppleGrant,
  type AppleGrantKind,
} from "../transaction";
import type {
  AppleEnvironment,
  AppleTransactionPayload,
  TransactionSource,
  VerifiedTransaction,
} from "../environment";

const BUNDLE_ID = "ai.olympiq.app";
const INTENT = "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const PURCHASE_ISO = "2026-08-31T09:15:00.000Z";
const PURCHASE_MS = Date.parse(PURCHASE_ISO);

function payload(overrides: Partial<AppleTransactionPayload> = {}): AppleTransactionPayload {
  return {
    transactionId: "2000000900000001",
    originalTransactionId: "2000000900000001",
    bundleId: BUNDLE_ID,
    productId: "ai.olympiq.sub.math.month",
    purchaseDate: PURCHASE_MS,
    quantity: 1,
    type: "Non-Renewing Subscription",
    appAccountToken: INTENT,
    inAppOwnershipType: "PURCHASED",
    environment: "Production",
    storefront: "AZE",
    ...overrides,
  };
}

function verified<E extends AppleEnvironment>(
  environment: E,
  overrides: Partial<AppleTransactionPayload> = {},
  source: TransactionSource = "requery",
): VerifiedTransaction<E> {
  return { environment, source, payload: payload({ environment, ...overrides }) };
}

function grantOf(
  overrides: Partial<AppleTransactionPayload> = {},
  opts: { kind?: AppleGrantKind; interval?: "week" | "month" | "year" | null } = {},
) {
  return toAppleGrant({
    transaction: verified("Production", overrides),
    expectedBundleId: BUNDLE_ID,
    expectedKind: opts.kind ?? "subscription",
    interval: opts.interval === undefined ? "month" : opts.interval,
  });
}

describe("the happy path", () => {
  it("carries exactly what the entitlement needs", () => {
    const result = grantOf();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grant).toMatchObject({
      environment: "Production",
      kind: "subscription",
      productId: "ai.olympiq.sub.math.month",
      intentId: INTENT,
      transactionId: "2000000900000001",
      originalTransactionId: "2000000900000001",
      inAppOwnershipType: "PURCHASED",
      storefront: "AZE",
    });
    expect(result.grant.purchaseDate.toISOString()).toBe(PURCHASE_ISO);
    // OURS to compute: Apple sends no expiresDate for a non-renewing product.
    expect(result.grant.endsAt!.toISOString()).toBe("2026-09-30T09:15:00.000Z");
  });

  it("computes each interval from the purchase date", () => {
    for (const [interval, expected] of [
      ["week", "2026-09-07T09:15:00.000Z"],
      ["month", "2026-09-30T09:15:00.000Z"],
      ["year", "2027-08-31T09:15:00.000Z"],
    ] as const) {
      const result = grantOf({}, { interval });
      expect(result.ok && result.grant.endsAt!.toISOString()).toBe(expected);
    }
  });

  it("gives a lifetime (olympiad package) purchase no end date at all", () => {
    const result = grantOf({ type: "Non-Consumable" }, { kind: "lifetime", interval: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grant.kind).toBe("lifetime");
    expect(result.grant.endsAt).toBeNull();
  });

  it("lower-cases the intent id, because Apple normalises the token", () => {
    const result = grantOf({ appAccountToken: INTENT.toUpperCase() });
    expect(result.ok && result.grant.intentId).toBe(INTENT);
  });

  it("accepts an absent quantity as one", () => {
    expect(grantOf({ quantity: undefined }).ok).toBe(true);
  });
});

describe("a notification body is a ping, never an authority", () => {
  it("refuses anything that was not re-queried", () => {
    for (const source of ["notification", "client"] as const) {
      const result = toAppleGrant({
        transaction: verified("Production", {}, source),
        expectedBundleId: BUNDLE_ID,
        expectedKind: "subscription",
        interval: "month",
      });
      expect(result).toEqual({ ok: false, reason: "not_requeried" });
    }
  });

  it("refuses it FIRST, before any other check could accidentally pass it", () => {
    // Same payload, same everything: only the source differs. If this ordering
    // ever changes, a valid notification becomes a grant.
    const asNotification = toAppleGrant({
      transaction: verified("Production", {}, "notification"),
      expectedBundleId: BUNDLE_ID,
      expectedKind: "subscription",
      interval: "month",
    });
    expect(asNotification.ok).toBe(false);
    expect(grantOf().ok).toBe(true);
  });
});

describe("sandbox never becomes production access", () => {
  it("produces a sandbox grant from sandbox data", () => {
    const result = toAppleGrant({
      transaction: verified("Sandbox"),
      expectedBundleId: BUNDLE_ID,
      expectedKind: "subscription",
      interval: "month",
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.grant.environment).toBe("Sandbox");
  });

  it("refuses that grant at the one door into real access", () => {
    const result = toAppleGrant({
      transaction: verified("Sandbox"),
      expectedBundleId: BUNDLE_ID,
      expectedKind: "subscription",
      interval: "month",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requireProductionGrant(result.grant)).toBeNull();
  });

  it("lets a production grant through the same door", () => {
    const result = grantOf();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requireProductionGrant(result.grant)).toBe(result.grant);
  });

  it("refuses a payload whose own environment disagrees with the rail", () => {
    // A sandbox JWS routed to the production verifier by our own code. The chain
    // check catches it first; this is the second lock on the same door.
    const mismatched: VerifiedTransaction<"Production"> = {
      environment: "Production",
      source: "requery",
      payload: payload({ environment: "Sandbox" }),
    };
    expect(
      toAppleGrant({
        transaction: mismatched,
        expectedBundleId: BUNDLE_ID,
        expectedKind: "subscription",
        interval: "month",
      }),
    ).toEqual({ ok: false, reason: "environment_mismatch" });
  });

  it("refuses a payload with no environment claim at all", () => {
    expect(grantOf({ environment: undefined })).toEqual({
      ok: false,
      reason: "environment_mismatch",
    });
  });
});

describe("a refund revokes, it does not grant", () => {
  it("refuses a transaction carrying a revocation date", () => {
    expect(grantOf({ revocationDate: Date.parse("2026-09-02T00:00:00.000Z") })).toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  it("reports revocation on its own, for the REFUND notification path", () => {
    expect(isRevoked(payload())).toBe(false);
    expect(isRevoked(payload({ revocationDate: 1 }))).toBe(true);
    expect(isRevoked(payload({ revocationDate: Number.NaN }))).toBe(false);
  });
});

describe("the intent id — without it a payment cannot find a child", () => {
  it("refuses an absent token", () => {
    expect(grantOf({ appAccountToken: undefined })).toEqual({
      ok: false,
      reason: "app_account_token_missing",
    });
  });

  it("refuses an empty token", () => {
    expect(grantOf({ appAccountToken: "" })).toEqual({
      ok: false,
      reason: "app_account_token_missing",
    });
  });

  it("refuses a malformed token rather than guessing an owner", () => {
    for (const bad of [
      "not-a-uuid",
      "3f1b2c4d5e6f4a7b8c9d0e1f2a3b4c5d",
      `${INTENT}-extra`,
      INTENT.slice(0, -1),
      "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5z",
      " " + INTENT,
    ]) {
      expect(grantOf({ appAccountToken: bad })).toEqual({
        ok: false,
        reason: "app_account_token_malformed",
      });
    }
  });

  it("refuses a non-string token", () => {
    expect(grantOf({ appAccountToken: 12345 as unknown as string })).toEqual({
      ok: false,
      reason: "app_account_token_malformed",
    });
  });
});

describe("everything else that must be present and sane", () => {
  it("refuses another app's bundle id", () => {
    expect(grantOf({ bundleId: "com.attacker.app" })).toEqual({
      ok: false,
      reason: "bundle_id_mismatch",
    });
    expect(grantOf({ bundleId: undefined })).toEqual({ ok: false, reason: "bundle_id_mismatch" });
  });

  it("refuses a product type our catalog did not expect", () => {
    // Auto-renewable would mean App Store Connect drifted from the owner's
    // decision, and the expiry we compute would be a fiction.
    expect(grantOf({ type: "Auto-Renewable Subscription" })).toEqual({
      ok: false,
      reason: "product_type_unexpected",
    });
    expect(grantOf({ type: "Consumable" })).toEqual({
      ok: false,
      reason: "product_type_unexpected",
    });
    expect(grantOf({ type: undefined })).toEqual({
      ok: false,
      reason: "product_type_unexpected",
    });
  });

  it("refuses a lifetime product that is not a non-consumable", () => {
    expect(
      grantOf({ type: "Non-Renewing Subscription" }, { kind: "lifetime", interval: null }),
    ).toEqual({ ok: false, reason: "product_type_unexpected" });
  });

  it("refuses a malformed product id before it reaches a catalog lookup", () => {
    for (const bad of ["", ".leading-dot", "has space", "a".repeat(201), "semi;colon"]) {
      expect(grantOf({ productId: bad }).ok).toBe(false);
    }
  });

  it("refuses malformed transaction ids", () => {
    expect(grantOf({ transactionId: "" })).toEqual({
      ok: false,
      reason: "transaction_id_malformed",
    });
    expect(grantOf({ originalTransactionId: "has space" })).toEqual({
      ok: false,
      reason: "original_transaction_id_malformed",
    });
  });

  it("refuses a purchase date outside the sanity window", () => {
    for (const bad of [undefined, 0, -1, 1_788_000_000, Number.NaN, 1.5]) {
      expect(grantOf({ purchaseDate: bad as number })).toEqual({
        ok: false,
        reason: "purchase_date_out_of_range",
      });
    }
  });

  it("refuses a quantity nobody decided the meaning of", () => {
    for (const q of [0, 2, 3, -1]) {
      expect(grantOf({ quantity: q })).toEqual({ ok: false, reason: "quantity_unexpected" });
    }
  });
});

describe("catalog mistakes are refused, not interpreted", () => {
  it("refuses a subscription with no interval", () => {
    expect(grantOf({}, { interval: null })).toEqual({ ok: false, reason: "interval_missing" });
  });

  it("refuses a lifetime product carrying an interval", () => {
    expect(grantOf({ type: "Non-Consumable" }, { kind: "lifetime", interval: "year" })).toEqual({
      ok: false,
      reason: "interval_unexpected",
    });
  });

  it("refuses an interval string that is not one of ours", () => {
    expect(
      grantOf({}, { interval: "decade" as unknown as "month" }),
    ).toEqual({ ok: false, reason: "expiry_uncomputable" });
  });
});

describe("the result is always a value", () => {
  it("never throws, whatever the payload contains", () => {
    const hostile: AppleTransactionPayload = {
      transactionId: undefined,
      bundleId: undefined,
      productId: undefined,
      purchaseDate: undefined,
      type: undefined,
      appAccountToken: undefined,
      environment: undefined,
    };
    expect(() =>
      toAppleGrant({
        transaction: { environment: "Production", source: "requery", payload: hostile },
        expectedBundleId: BUNDLE_ID,
        expectedKind: "subscription",
        interval: "month",
      }),
    ).not.toThrow();
  });
});
