// The TRTYPE 90 answer is the ONLY thing the platform believes about whether an
// order was paid, so `reconcileStatus` is deliberately strict and conjunctive.
// These tests pin that strictness: every way of being "almost right" must come
// out as NOT approved.
import { describe, expect, it } from "vitest";
import {
  parseStatusResponse,
  reconcileStatus,
  settledOutcome,
  type StatusExpectation,
} from "../statusResponse";
import { outcomeFromCodes, paymentStatusFor, GATEWAY_ACTIONS } from "../codes";

const EXPECTED: StatusExpectation = {
  order: "20260819000042",
  terminal: "17205223",
  amount: "3.00",
  currency: "AZN",
};

const APPROVED_JSON = JSON.stringify({
  ACTION: "0",
  RC: "00",
  ORDER: "20260819000042",
  TERMINAL: "17205223",
  AMOUNT: "3.00",
  CURRENCY: "AZN",
  APPROVAL: "168975",
  RRN: "306276834930",
  INT_REF: "4A29E93C607E33DC",
});

describe("parsing", () => {
  it("reads JSON", () => {
    const parsed = parseStatusResponse(APPROVED_JSON);
    expect(parsed.format).toBe("json");
    expect(parsed.fields.ACTION).toBe("0");
    expect(parsed.fields.INT_REF).toBe("4A29E93C607E33DC");
  });

  it("reads a form-encoded body", () => {
    const parsed = parseStatusResponse(
      "ACTION=0&RC=00&ORDER=20260819000042&AMOUNT=3.00&INT_REF=4A29E93C607E33DC",
    );
    expect(parsed.format).toBe("form");
    expect(parsed.fields.ORDER).toBe("20260819000042");
  });

  it("reads a flat XML body", () => {
    const parsed = parseStatusResponse(
      "<response><ACTION>0</ACTION><ORDER>20260819000042</ORDER><AMOUNT>3.00</AMOUNT></response>",
    );
    expect(parsed.format).toBe("xml");
    expect(parsed.fields.ACTION).toBe("0");
  });

  it("maps the prose names §8.2 uses instead of naming the JSON keys", () => {
    const parsed = parseStatusResponse(
      JSON.stringify({
        "Response code": "00",
        "Merchant order id": "20260819000042",
        "Transaction amount": "3.00",
        "Banks approval code": "168975",
        "Transaction RRN": "306276834930",
      }),
    );
    expect(parsed.fields.RC).toBe("00");
    expect(parsed.fields.ORDER).toBe("20260819000042");
    expect(parsed.fields.AMOUNT).toBe("3.00");
    expect(parsed.fields.APPROVAL).toBe("168975");
    expect(parsed.fields.RRN).toBe("306276834930");
  });

  it("counts what it could not map instead of guessing", () => {
    const parsed = parseStatusResponse(JSON.stringify({ ACTION: "0", WHATEVER: "x", ALSO: "y" }));
    expect(parsed.fields.ACTION).toBe("0");
    expect(parsed.unrecognisedCount).toBe(2);
  });

  it("never lets card data through the parser", () => {
    const parsed = parseStatusResponse(
      JSON.stringify({ ACTION: "0", CARD: "411111******1111", "Card number": "4111" }),
    );
    expect(JSON.stringify(parsed.fields)).not.toContain("411111");
    expect(JSON.stringify(parsed.fields)).not.toContain("4111");
  });

  it("returns an empty bag rather than throwing on junk", () => {
    for (const junk of ["", "   ", "{not json", "<<<", "\u0000"]) {
      expect(() => parseStatusResponse(junk)).not.toThrow();
    }
    expect(parseStatusResponse("").format).toBe("none");
  });
});

describe("reconciliation — approval requires EVERYTHING to line up", () => {
  it("approves a clean, matching, ACTION=0 response", () => {
    const r = reconcileStatus(parseStatusResponse(APPROVED_JSON), EXPECTED);
    expect(r.approved).toBe(true);
    expect(r.outcome).toBe("approved");
    expect(r.mismatches).toEqual([]);
    expect(r.rrn).toBe("306276834930");
  });

  it("accepts the gateway echoing '3' where we sent '3.00'", () => {
    const body = APPROVED_JSON.replace('"3.00"', '"3"');
    expect(reconcileStatus(parseStatusResponse(body), EXPECTED).approved).toBe(true);
  });

  it("refuses when the response is about a DIFFERENT order", () => {
    const body = APPROVED_JSON.replace("20260819000042", "20260819000043");
    const r = reconcileStatus(parseStatusResponse(body), EXPECTED);
    expect(r.approved).toBe(false);
    expect(r.mismatches).toContain("order_mismatch");
  });

  // REPLACES an earlier test that required the response to echo ORDER. The live
  // TEST gateway settled that: its status reply carries no order field at all
  // (terminal, actionCode, responseCode, statusMsg, card, amount, currency,
  // tranDate, rrn, intRef, nonce, signature, timestamp), so the old rule could
  // never pass and nothing could ever settle. The binding now comes from the
  // QUERY — we POST ORDER=<ours> — and from everything else still having to
  // agree. These tests pin that the loosening went no further than that.
  it("accepts a reply that simply does not echo the order", () => {
    const r = reconcileStatus(
      parseStatusResponse(
        JSON.stringify({
          actionCode: "0",
          responseCode: "00",
          amount: "3.00",
          terminal: EXPECTED.terminal,
          currency: "944",
        }),
      ),
      EXPECTED,
    );
    expect(r.mismatches).toEqual([]);
    expect(r.approved).toBe(true);
  });

  it("still refuses a reply that echoes a DIFFERENT order", () => {
    const r = reconcileStatus(
      parseStatusResponse(
        JSON.stringify({ ACTION: "0", RC: "00", AMOUNT: "3.00", ORDER: "20260101000001" }),
      ),
      EXPECTED,
    );
    expect(r.approved).toBe(false);
    expect(r.mismatches).toContain("order_mismatch");
  });

  it("still requires the amount, even with no order to check", () => {
    const r = reconcileStatus(
      parseStatusResponse(JSON.stringify({ actionCode: "0", responseCode: "00", amount: "9.99" })),
      EXPECTED,
    );
    expect(r.approved).toBe(false);
    expect(r.mismatches).toContain("amount_mismatch");
  });

  it("reads actionCode, so the outcome is not inferred from RC alone", () => {
    // ACTIONCODE was missing from the alias table, which is why the live reply
    // came back with action: null.
    const r = reconcileStatus(
      parseStatusResponse(JSON.stringify({ actionCode: "2", responseCode: "51", amount: "3.00" })),
      EXPECTED,
    );
    expect(r.action).toBe("2");
    expect(r.outcome).toBe("declined");
  });

  it("refuses on a different amount, terminal or currency", () => {
    for (const [from, to, mismatch] of [
      ["3.00", "4.00", "amount_mismatch"],
      ["17205223", "99999999", "terminal_mismatch"],
      ["AZN", "USD", "currency_mismatch"],
    ] as const) {
      const r = reconcileStatus(parseStatusResponse(APPROVED_JSON.replace(from, to)), EXPECTED);
      expect(r.approved).toBe(false);
      expect(r.mismatches).toContain(mismatch);
    }
  });

  it("refuses an unreadable response — 'we could not tell' is never 'yes'", () => {
    const r = reconcileStatus(parseStatusResponse(""), EXPECTED);
    expect(r.approved).toBe(false);
    expect(r.mismatches).toContain("no_response");
    expect(r.outcome).toBe("unknown");
  });

  it("refuses a declined transaction even when every field matches", () => {
    const body = APPROVED_JSON.replace('"ACTION":"0"', '"ACTION":"2"');
    const r = reconcileStatus(parseStatusResponse(body), EXPECTED);
    expect(r.approved).toBe(false);
    expect(r.outcome).toBe("declined");
  });
});

describe("what the ledger is allowed to record", () => {
  it("records 'approved' only when the reconciliation was clean", () => {
    const clean = reconcileStatus(parseStatusResponse(APPROVED_JSON), EXPECTED);
    expect(settledOutcome(clean)).toBe("approved");
  });

  it("collapses ACTION=0-about-someone-else's-order to 'unknown', never 'approved'", () => {
    // The bug this function exists to prevent: `approved ? "approved" : outcome`
    // passes "approved" straight through here, because outcomeFromCodes said so.
    // That would write `succeeded` into payments for money we cannot show is
    // ours.
    const wrongOrder = reconcileStatus(
      parseStatusResponse(APPROVED_JSON.replace("20260819000042", "20260819000043")),
      EXPECTED,
    );
    expect(wrongOrder.outcome).toBe("approved");
    expect(wrongOrder.approved).toBe(false);
    expect(settledOutcome(wrongOrder)).toBe("unknown");

    const wrongAmount = reconcileStatus(
      parseStatusResponse(APPROVED_JSON.replace("3.00", "300.00")),
      EXPECTED,
    );
    expect(settledOutcome(wrongAmount)).toBe("unknown");
  });

  it("passes a genuine decline or failure through unchanged", () => {
    const declined = reconcileStatus(
      parseStatusResponse(APPROVED_JSON.replace('"ACTION":"0"', '"ACTION":"2"')),
      EXPECTED,
    );
    expect(settledOutcome(declined)).toBe("declined");
    const errored = reconcileStatus(
      parseStatusResponse(APPROVED_JSON.replace('"ACTION":"0"', '"ACTION":"3"')),
      EXPECTED,
    );
    expect(settledOutcome(errored)).toBe("failed");
  });
});

describe("ACTION / RC semantics", () => {
  it("maps the documented ACTION codes", () => {
    expect(outcomeFromCodes(GATEWAY_ACTIONS.SUCCESS, "00")).toBe("approved");
    expect(outcomeFromCodes(GATEWAY_ACTIONS.DECLINED, null)).toBe("declined");
    expect(outcomeFromCodes(GATEWAY_ACTIONS.ERROR, null)).toBe("failed");
    // A duplicate is the gateway saying it already has this one — never a
    // second payment, and never a second ledger row.
    expect(outcomeFromCodes(GATEWAY_ACTIONS.DUPLICATE, null)).toBe("pending");
    for (const retry of [
      GATEWAY_ACTIONS.RETRY_REFUSED,
      GATEWAY_ACTIONS.RETRY_AUTH_ERROR,
      GATEWAY_ACTIONS.RETRY_NO_RESPONSE,
    ]) {
      expect(outcomeFromCodes(retry, null)).toBe("pending");
    }
    expect(outcomeFromCodes("42", null)).toBe("unknown");
    expect(outcomeFromCodes(null, null)).toBe("unknown");
  });

  it("lets a non-'00' RC override an ACTION=0 rather than resolving in the payer's favour", () => {
    expect(outcomeFromCodes("0", "05")).toBe("declined");
    // A blank RC is permitted by the spec and does not veto ACTION=0.
    expect(outcomeFromCodes("0", "")).toBe("approved");
  });

  it("maps outcomes onto the payment_status enum", () => {
    expect(paymentStatusFor("approved")).toBe("succeeded");
    expect(paymentStatusFor("declined")).toBe("failed");
    expect(paymentStatusFor("failed")).toBe("failed");
    expect(paymentStatusFor("pending")).toBe("pending");
    expect(paymentStatusFor("unknown")).toBe("pending");
  });
});

describe("a verdict is only as good as the evidence behind it", () => {
  function reconcile(overrides: Record<string, string>) {
    return reconcileStatus(
      parseStatusResponse(
        JSON.stringify({
          ORDER: EXPECTED.order,
          TERMINAL: EXPECTED.terminal,
          AMOUNT: EXPECTED.amount,
          CURRENCY: EXPECTED.currency,
          ACTION: "0",
          RC: "00",
          ...overrides,
        }),
      ),
      EXPECTED,
    );
  }

  it("does not record a terminal failure on a mismatched answer", () => {
    // THIS WAS ASYMMETRIC, AND THE ASYMMETRY LOST MONEY. `approved` collapsed
    // to "unknown" when the answer described a different order, amount or
    // terminal — but "declined"/"failed" passed straight through on exactly the
    // same mismatches. `failed` is terminal in the ledger, so once written, a
    // later cleanly reconciled "approved" for that order is discarded and a
    // charged payment reads as failed forever.
    const r = reconcile({ ACTION: "2", RC: "05", ORDER: "20260819999999" });
    expect(r.mismatches.length, "precondition: answer is about another order").toBeGreaterThan(0);
    expect(r.approved).toBe(false);
    expect(settledOutcome(r), "untrustworthy evidence must not close a payment").toBe("unknown");
  });

  it("still records a clean decline", () => {
    const r = reconcile({ ACTION: "2", RC: "05" });
    expect(r.mismatches).toEqual([]);
    expect(settledOutcome(r)).toBe("declined");
  });

  it("still records a clean approval", () => {
    const r = reconcile({});
    expect(r.approved).toBe(true);
    expect(settledOutcome(r)).toBe("approved");
  });
});

describe("the answer must name the transaction the signed callback named", () => {
  // THE HOLE THIS CLOSES. Dropping the ORDER echo left "we queried by our order"
  // as the only binding — an ASSUMPTION about the gateway's keying that the live
  // run never tested, because we only ever queried orders the terminal really
  // had. RRN and INT_REF are covered by the callback MAC (ORDER is not), so
  // they are the one transaction identity an attacker cannot choose.
  //
  // Concretely: two parents, same 3.00 AZN subject, same terminal. P1 is
  // DECLINED, P2 is APPROVED. If P1's status query is answered with P2's
  // transaction, every remaining field agrees — and P1 gets credited a payment
  // they never made while P2's real payment is permanently blocked by the
  // reference claim.
  const CALLBACK_REFS = { rrn: "623279219080", intRef: "3433B1032B15CE76" };

  function reply(over: Record<string, string> = {}) {
    return parseStatusResponse(
      JSON.stringify({
        terminal: EXPECTED.terminal,
        actionCode: "0",
        responseCode: "00",
        amount: EXPECTED.amount,
        currency: "944",
        rrn: CALLBACK_REFS.rrn,
        intRef: CALLBACK_REFS.intRef,
        ...over,
      }),
    );
  }

  it("refuses an answer about a different transaction", () => {
    const r = reconcileStatus(reply({ rrn: "999999999999" }), {
      ...EXPECTED,
      ...CALLBACK_REFS,
    });
    expect(r.mismatches).toContain("reference_mismatch");
    expect(r.approved).toBe(false);
    expect(settledOutcome(r), "must not settle on a foreign transaction").toBe("unknown");
  });

  it("accepts the answer about our own transaction", () => {
    const r = reconcileStatus(reply(), { ...EXPECTED, ...CALLBACK_REFS });
    expect(r.mismatches).toEqual([]);
    expect(r.approved).toBe(true);
  });

  it("does not invent a mismatch when either side omits the reference", () => {
    // A blank is legal under the MAC rules, and a reconciliation sweep may run
    // with no callback in hand. Absence must not block settlement.
    expect(reconcileStatus(reply({ rrn: "" }), { ...EXPECTED, ...CALLBACK_REFS }).mismatches)
      .toEqual([]);
    expect(reconcileStatus(reply(), EXPECTED).mismatches).toEqual([]);
  });
});

describe("the live reply's own spellings", () => {
  // Every name here was read off the TEST terminal on 2026-08-20, not guessed.
  // An APPROVED reply carries approval_id; a declined one does not, which is
  // why it was the last field left unmapped.
  it("captures the bank approval code from approval_id", () => {
    const r = reconcileStatus(
      parseStatusResponse(
        JSON.stringify({
          terminal: EXPECTED.terminal,
          actionCode: "0",
          approval_id: "517400",
          responseCode: "00",
          amount: EXPECTED.amount,
          currency: "944",
        }),
      ),
      EXPECTED,
    );
    expect(r.approval, "the approval code is the strongest dispute evidence").toBe("517400");
    expect(r.approved).toBe(true);
  });

  it("normalises underscores, hyphens and spaces alike", () => {
    const r = reconcileStatus(
      parseStatusResponse(
        JSON.stringify({ "INT_REF": "AAAA", "tran-date": "20260820", actionCode: "0", responseCode: "00", amount: EXPECTED.amount }),
      ),
      EXPECTED,
    );
    expect(r.intRef).toBe("AAAA");
  });
});
