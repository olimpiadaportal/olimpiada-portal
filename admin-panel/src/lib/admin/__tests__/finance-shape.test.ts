// The finance view's two-axis vocabulary.
//
// Every test here defends against ONE way that reading `payments` alone gives a
// support agent a confidently wrong answer. They are not about formatting.
import { describe, expect, it } from "vitest";
import {
  PAYLOAD_ALLOWLIST,
  classifySearch,
  deliveryState,
  deliveryTone,
  isMoneyTakenNothingDelivered,
  moneyState,
  moneyTone,
  parseEventId,
  projectPayload,
} from "@/lib/admin/finance-shape";
import { formatMoney } from "@/lib/formatMoney";

describe("money state comes from payments.status, never from a note", () => {
  it("reports refunded from the column", () => {
    expect(moneyState({ kind: "subscription", paymentStatus: "refunded" })).toBe("refunded");
  });

  it("does NOT infer refunded from a reversal note", () => {
    // The review queue once read the note instead and told operators it was
    // holding money that had already been returned — and the obvious response
    // to that, granting access by hand, gives the product away free.
    expect(moneyState({ kind: "subscription", paymentStatus: "succeeded" })).toBe("succeeded");
  });

  it("distinguishes 'no payment row' from 'failed'", () => {
    // A comped subscription has no payment row at all. Calling that "failed"
    // would send an agent chasing a charge that never existed.
    expect(moneyState({ kind: "subscription", paymentStatus: null })).toBe("no_payment_row");
    expect(moneyState({ kind: "subscription", paymentStatus: "failed" })).toBe("failed");
  });

  it("marks a protocol test as not a customer charge", () => {
    // It carries a real amount and must never enter a revenue reading.
    expect(moneyState({ kind: "protocol_test", paymentStatus: "succeeded" })).toBe(
      "not_a_charge",
    );
  });
});

describe("delivery state is a SEPARATE axis", () => {
  const base = {
    kind: "subscription",
    intentKind: "plan_start",
    redeemedAt: null as string | null,
    redemptionStatus: null as string | null,
    redemptionNote: null as string | null,
  };

  it("paid but never redeemed is NOT delivered", () => {
    expect(deliveryState(base)).toBe("not_delivered");
  });

  it("applied with no note is delivered", () => {
    expect(
      deliveryState({ ...base, redeemedAt: "2026-08-26T10:00:00Z", redemptionStatus: "applied" }),
    ).toBe("delivered");
  });

  it("applied WITH a note is flagged, not simply delivered", () => {
    expect(
      deliveryState({
        ...base,
        redeemedAt: "2026-08-26T10:00:00Z",
        redemptionStatus: "applied",
        redemptionNote: "partial",
      }),
    ).toBe("delivered_then_flagged");
  });

  it("needs_review is held, not delivered", () => {
    expect(
      deliveryState({
        ...base,
        redeemedAt: "2026-08-26T10:00:00Z",
        redemptionStatus: "needs_review",
      }),
    ).toBe("held_for_review");
  });

  it("a reversal note reads as revoked", () => {
    expect(
      deliveryState({
        ...base,
        redeemedAt: "2026-08-26T10:00:00Z",
        redemptionStatus: "applied",
        redemptionNote: "reversed:live_test",
      }),
    ).toBe("revoked");
  });

  it("an intent-less order is not applicable, never 'not delivered'", () => {
    // A protocol test can never deliver anything; calling it undelivered would
    // park it in the attention list forever.
    expect(deliveryState({ ...base, kind: "protocol_test", intentKind: null })).toBe(
      "not_applicable",
    );
  });
});

describe("money taken, nothing delivered", () => {
  // THE STATE THIS VIEW EXISTS FOR. listCheckoutReviews filters
  // `redeemed_at is not null`, so this never reaches the review queue.
  const now = Date.parse("2026-08-26T12:00:00Z");

  it("flags a succeeded-but-undelivered order past the grace window", () => {
    expect(
      isMoneyTakenNothingDelivered({
        money: "succeeded",
        delivery: "not_delivered",
        paidAt: "2026-08-26T11:00:00Z",
        now,
      }),
    ).toBe(true);
  });

  it("does NOT flag a checkout that is merely mid-flight", () => {
    expect(
      isMoneyTakenNothingDelivered({
        money: "succeeded",
        delivery: "not_delivered",
        paidAt: "2026-08-26T11:59:00Z",
        now,
      }),
    ).toBe(false);
  });

  it("never flags an order whose money did not land", () => {
    for (const money of ["pending", "failed", "canceled", "no_payment_row"] as const) {
      expect(
        isMoneyTakenNothingDelivered({ money, delivery: "not_delivered", paidAt: null, now }),
      ).toBe(false);
    }
  });

  it("never flags a delivered order", () => {
    expect(
      isMoneyTakenNothingDelivered({ money: "succeeded", delivery: "delivered", now }),
    ).toBe(false);
  });
});

describe("payload rendering is an ALLOWLIST", () => {
  it("never emits P_SIGN or NONCE", () => {
    // Zero support value; stored only so a disputed callback stays
    // re-verifiable. A screenshot must not carry them.
    expect(PAYLOAD_ALLOWLIST).not.toContain("P_SIGN");
    expect(PAYLOAD_ALLOWLIST).not.toContain("NONCE");
    const out = projectPayload({
      callback: { RC: "00", P_SIGN: "deadbeef", NONCE: "abc123", RRN: "623780367803" },
    });
    const labels = out.map((f) => f.label);
    expect(labels).toContain("RC");
    expect(labels).toContain("RRN");
    expect(labels).not.toContain("P_SIGN");
    expect(labels).not.toContain("NONCE");
  });

  it("drops anything the bank adds that we did not allow", () => {
    // Fails CLOSED: nothing in the database constrains this column's shape, and
    // the four TypeScript layers that keep card data out of it live in web-app,
    // which this deployment does not inherit.
    const out = projectPayload({ callback: { PAN: "4169**********23", CARD: "x" } });
    expect(out).toEqual([]);
  });

  it("never emits a nested object dump", () => {
    const out = projectPayload({ callback: { RC: { nested: true } } });
    expect(out).toEqual([]);
  });

  it("reads the sweep's status_query block as well as a callback", () => {
    // A payment settled by the reconcile sweep has callback: null and carries
    // its outcome in status_query instead.
    const out = projectPayload({ callback: null, status_query: { outcome: "approved" } });
    expect(out.map((f) => f.label)).toContain("outcome");
  });
});

describe("event ids", () => {
  it("tells a verified callback from a sweep rescue", () => {
    // THE DISTINCTION THAT MATTERS: only a recon: row with no cb: sibling means
    // the signed callback never verified — which is what a wrong MPI public key
    // looks like from the outside. payments.status says "succeeded" either way.
    expect(parseEventId("cb:20260825281545")).toEqual({ kind: "cb", order: "20260825281545" });
    expect(parseEventId("recon:20260825281545").kind).toBe("recon");
  });

  it("parses the note chain, whose id carries a hash after the order", () => {
    expect(parseEventId("note:20260825281545:9f8a").order).toBe("20260825281545");
  });

  it("degrades to unknown rather than guessing", () => {
    expect(parseEventId("something-else").kind).toBe("unknown");
    expect(parseEventId(null).kind).toBe("unknown");
  });
});

describe("search shapes", () => {
  it("treats an 8-digit term as BOTH a child id and an order", () => {
    // It is genuinely both, so the page offers the order beside the family
    // results rather than choosing for the agent.
    expect(classifySearch("65196056")).toEqual(["child", "order"]);
  });

  it("treats a longer digit string as an order only", () => {
    expect(classifySearch("20260825281545")).toEqual(["order"]);
  });

  it("treats an email as text", () => {
    expect(classifySearch("parent@example.com")).toEqual(["text"]);
  });
});

describe("money formatting", () => {
  it("distinguishes NO figure from a ZERO figure", () => {
    // "—" means we hold no amount; "0.00 AZN" means we hold one and it is zero.
    // A comped grant is the second. Four inline copies had disagreed on this.
    expect(formatMoney(null, "AZN", "en")).toBe("—");
    expect(formatMoney(0, "AZN", "en")).toBe("0.00 AZN");
  });

  it("never renders the manat sign", () => {
    // CLAUDE.md forbids ₼ on store-adjacent surfaces; the code is unambiguous
    // and screenshots safely.
    expect(formatMoney(9, "AZN", "az")).not.toContain("₼");
    expect(formatMoney(9, "AZN", "az")).toContain("AZN");
  });

  it("keeps a foreign currency as itself", () => {
    expect(formatMoney(5, "USD", "en")).toContain("USD");
  });

  it("survives a non-finite amount", () => {
    expect(formatMoney(Number.NaN, "AZN", "en")).toBe("—");
  });
});

describe("pill tones", () => {
  it("treats absence as muted, not as alarm", () => {
    expect(moneyTone("no_payment_row")).toBe("pill-muted");
    expect(moneyTone("not_a_charge")).toBe("pill-muted");
    expect(deliveryTone("not_applicable")).toBe("pill-muted");
  });

  it("treats undelivered as a warning", () => {
    expect(deliveryTone("not_delivered")).toBe("pill-warn");
  });
});
