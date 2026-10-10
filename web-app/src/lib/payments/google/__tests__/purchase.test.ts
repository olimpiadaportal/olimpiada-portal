// THE GOOGLE GRANT DECISION, pinned — the pure half of the Play rail.
import { describe, expect, it } from "vitest";
import {
  GOOGLE_REF_PREFIX,
  GOOGLE_TEST_REF_PREFIX,
  candidateRefsForVoided,
  googleExternalRef,
  purchaseTokenDigest,
  toGoogleGrant,
  type ProductPurchase,
  type VerifiedPlayPurchase,
} from "@/lib/payments/google/purchase";

const INTENT = "11111111-1111-4111-8111-111111111111";
const MATH_MONTH = "ai.olympiq.app.sub.math.month";
const TOKEN = "abcdefghijklmnop.AO-J1OyExampleTokenValue_123";
const ORDER = "GPA.3345-6789-0123-45678";
// 31 Jan 2026, 10:00 UTC — the month-clamping case.
const PURCHASED_AT = Date.UTC(2026, 0, 31, 10, 0, 0);

function verified(over: Partial<ProductPurchase> = {}, source: "requery" | "notification" = "requery"): VerifiedPlayPurchase {
  return {
    source,
    productId: MATH_MONTH,
    purchaseToken: TOKEN,
    purchase: {
      purchaseTimeMillis: String(PURCHASED_AT),
      purchaseState: 0,
      consumptionState: 0,
      acknowledgementState: 0,
      orderId: ORDER,
      obfuscatedExternalAccountId: INTENT,
      quantity: 1,
      ...over,
    },
  };
}

const sub = { expectedKind: "subscription" as const, interval: "month" as const };

describe("the decision", () => {
  it("grants a purchased product for one calendar month, clamped like Postgres", () => {
    const d = toGoogleGrant({ purchase: verified(), ...sub });
    expect(d.ok && d.state === "purchased").toBe(true);
    if (!d.ok || d.state !== "purchased") return;
    expect(d.grant.intentId).toBe(INTENT);
    expect(d.grant.endsAt?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(d.grant.externalRef).toBe(`${GOOGLE_REF_PREFIX}${ORDER}`);
    expect(d.grant.test).toBe(false);
  });

  it("grants a week as exactly seven days and a year as twelve months", () => {
    const w = toGoogleGrant({ purchase: verified(), expectedKind: "subscription", interval: "week" });
    const y = toGoogleGrant({ purchase: verified(), expectedKind: "subscription", interval: "year" });
    expect(w.ok && w.state === "purchased" && w.grant.endsAt?.toISOString()).toBe("2026-02-07T10:00:00.000Z");
    expect(y.ok && y.state === "purchased" && y.grant.endsAt?.toISOString()).toBe("2027-01-31T10:00:00.000Z");
  });

  it("grants a package for life", () => {
    const d = toGoogleGrant({
      purchase: { ...verified(), productId: "ai.olympiq.app.oly.aimo" },
      expectedKind: "lifetime",
      interval: null,
    });
    expect(d.ok && d.state === "purchased" && d.grant.endsAt).toBeNull();
  });

  it("refuses anything that was not re-queried", () => {
    expect(toGoogleGrant({ purchase: verified({}, "notification"), ...sub })).toEqual({
      ok: false,
      reason: "not_requeried",
    });
  });

  it("records a PENDING purchase and never grants it", () => {
    expect(toGoogleGrant({ purchase: verified({ purchaseState: 2 }), ...sub })).toEqual({
      ok: true,
      state: "pending",
      intentId: INTENT,
    });
  });

  it("refuses a canceled (refunded) purchase", () => {
    expect(toGoogleGrant({ purchase: verified({ purchaseState: 1 }), ...sub })).toEqual({
      ok: false,
      reason: "canceled",
    });
  });

  it("refuses a purchase with no intent, or a malformed one", () => {
    expect(toGoogleGrant({ purchase: verified({ obfuscatedExternalAccountId: undefined }), ...sub })).toEqual({
      ok: false,
      reason: "account_id_missing",
    });
    expect(toGoogleGrant({ purchase: verified({ obfuscatedExternalAccountId: "child-7" }), ...sub })).toEqual({
      ok: false,
      reason: "account_id_malformed",
    });
  });

  it("refuses multi-quantity and implausible dates", () => {
    expect(toGoogleGrant({ purchase: verified({ quantity: 3 }), ...sub }).ok).toBe(false);
    expect(toGoogleGrant({ purchase: verified({ purchaseTimeMillis: "1700" }), ...sub })).toEqual({
      ok: false,
      reason: "purchase_date_out_of_range",
    });
  });

  it("takes the interval from OUR catalogue, never the payload", () => {
    expect(toGoogleGrant({ purchase: verified(), expectedKind: "subscription", interval: null })).toEqual({
      ok: false,
      reason: "interval_missing",
    });
    expect(toGoogleGrant({ purchase: verified(), expectedKind: "lifetime", interval: "month" })).toEqual({
      ok: false,
      reason: "interval_unexpected",
    });
  });

  it("namespaces a license-tester purchase", () => {
    const d = toGoogleGrant({ purchase: verified({ purchaseType: 0 }), ...sub });
    expect(d.ok && d.state === "purchased" && d.grant.externalRef).toBe(`${GOOGLE_TEST_REF_PREFIX}${ORDER}`);
  });

  it("keys on a token digest when Google returned no orderId, never on the token", () => {
    const d = toGoogleGrant({ purchase: verified({ orderId: undefined }), ...sub });
    expect(d.ok && d.state === "purchased").toBe(true);
    if (!d.ok || d.state !== "purchased") return;
    expect(d.grant.externalRef).toBe(`gp:tok:${purchaseTokenDigest(TOKEN)}`);
    expect(d.grant.externalRef).not.toContain(TOKEN);
    expect(d.grant.externalRef.length).toBeLessThanOrEqual(100);
  });
});

describe("refs", () => {
  it("fit the database's 100-character bound", () => {
    const longest = googleExternalRef({ orderId: "G".repeat(80), purchaseToken: TOKEN, test: true });
    expect(longest.length).toBeLessThanOrEqual(100);
  });

  it("a void names every ref the purchase could have been granted under", () => {
    const refs = candidateRefsForVoided({ orderId: ORDER, purchaseToken: TOKEN });
    expect(refs).toEqual([
      `gp:${ORDER}`,
      `gp:test:${ORDER}`,
      `gp:tok:${purchaseTokenDigest(TOKEN)}`,
      `gp:test:tok:${purchaseTokenDigest(TOKEN)}`,
    ]);
    // Whatever the grant decided is among them.
    const d = toGoogleGrant({ purchase: verified(), ...sub });
    expect(d.ok && d.state === "purchased" && refs.includes(d.grant.externalRef)).toBe(true);
  });
});
