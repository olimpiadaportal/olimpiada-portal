// Callback normalisation and shape validation — the gate an unauthenticated
// public POST has to pass before it costs us a key operation, a query or an
// outbound request.
import { describe, expect, it } from "vitest";
import {
  CALLBACK_ALLOWED_FIELDS,
  isForbiddenFieldName,
  normalizeCallbackFields,
  sanitizeCallbackForStorage,
  validateCallbackShape,
  CALLBACK_MAX_FIELDS,
  CALLBACK_MAX_VALUE_LENGTH,
} from "../callback";

const TERMINAL = "17205223";

function form(overrides: Record<string, string> = {}): Record<string, string> {
  return normalizeCallbackFields(
    Object.entries({
      AMOUNT: "3.00",
      CURRENCY: "AZN",
      ORDER: "20260819000042",
      ACTION: "0",
      RC: "00",
      APPROVAL: "168975",
      RRN: "306276834930",
      INT_REF: "4A29E93C607E33DC",
      TERMINAL,
      TRTYPE: "1",
      TIMESTAMP: "20260819120000",
      NONCE: "7cfb4c2512eeec72",
      P_SIGN: "ab".repeat(256),
      ...overrides,
    }),
  );
}

describe("normalisation", () => {
  it("upper-cases keys, trims values and keeps only allowed fields", () => {
    const fields = normalizeCallbackFields([
      ["amount", " 3.00 "],
      ["Order", "20260819000042"],
      ["surprise", "value"],
    ]);
    expect(fields).toEqual({ AMOUNT: "3.00", ORDER: "20260819000042" });
  });

  it("drops card-shaped fields, whatever the gateway chooses to send", () => {
    // We never receive a PAN — the cardholder types it on the acquirer's hosted
    // page. The masked number the gateway may include is useless to us, and the
    // cheapest way to guarantee it never reaches a log or a row is to drop it at
    // the boundary.
    const fields = normalizeCallbackFields([
      ["CARD", "411111******1111"],
      ["CARD_NUMBER", "4111111111111111"],
      ["TOKEN", "opaque-token"],
      ["CVV", "123"],
      ["EXP_MONTH", "05"],
      ["AMOUNT", "3.00"],
    ]);
    expect(Object.keys(fields)).toEqual(["AMOUNT"]);
    expect(CALLBACK_ALLOWED_FIELDS as readonly string[]).not.toContain("CARD");
    expect(CALLBACK_ALLOWED_FIELDS as readonly string[]).not.toContain("TOKEN");
  });

  it("recognises every card-ish name shape", () => {
    for (const name of ["CARD", "card", "Card_Number", "PAN", "cvv", "CVC", "EXP_YEAR", "token"]) {
      expect(isForbiddenFieldName(name)).toBe(true);
    }
    for (const name of ["AMOUNT", "ORDER", "RRN", "INT_REF", "P_SIGN"]) {
      expect(isForbiddenFieldName(name)).toBe(false);
    }
  });

  it("is bounded — a stuffed body cannot make us allocate", () => {
    const many: [string, string][] = Array.from({ length: 5000 }, (_, i) => [
      `X${i}`,
      "v",
    ]);
    // The cap applies to the RAW entries, so the real fields at the end are
    // never reached; that is the point of capping before filtering.
    many.push(["AMOUNT", "3.00"]);
    expect(Object.keys(normalizeCallbackFields(many))).toHaveLength(0);
    expect(CALLBACK_MAX_FIELDS).toBeLessThan(100);
  });

  it("drops an over-long value rather than truncating it into something valid", () => {
    const fields = normalizeCallbackFields([
      ["ORDER", "1".repeat(CALLBACK_MAX_VALUE_LENGTH + 1)],
    ]);
    expect(fields.ORDER).toBeUndefined();
  });
});

describe("shape validation", () => {
  it("accepts a well-formed callback", () => {
    const result = validateCallbackShape(form(), TERMINAL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.shape.order).toBe("20260819000042");
      expect(result.shape.rrn).toBe("306276834930");
      expect(result.shape.signatureHex).toHaveLength(512);
    }
  });

  it("requires a signature", () => {
    const result = validateCallbackShape(form({ P_SIGN: "" }), TERMINAL);
    expect(result).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("requires a well-formed ORDER", () => {
    expect(validateCallbackShape(form({ ORDER: "" }), TERMINAL)).toEqual({
      ok: false,
      reason: "missing_order",
    });
    expect(validateCallbackShape(form({ ORDER: "abc123" }), TERMINAL)).toEqual({
      ok: false,
      reason: "invalid_order",
    });
    expect(validateCallbackShape(form({ ORDER: "12345" }), TERMINAL)).toEqual({
      ok: false,
      reason: "invalid_order",
    });
  });

  it("refuses another merchant's terminal before anything else is spent", () => {
    expect(validateCallbackShape(form({ TERMINAL: "99999999" }), TERMINAL)).toEqual({
      ok: false,
      reason: "terminal_mismatch",
    });
    expect(validateCallbackShape(form({ TERMINAL: "17" }), TERMINAL)).toEqual({
      ok: false,
      reason: "invalid_terminal",
    });
  });

  it("requires a parseable amount", () => {
    expect(validateCallbackShape(form({ AMOUNT: "three" }), TERMINAL)).toEqual({
      ok: false,
      reason: "invalid_amount",
    });
  });

  it("bounds RRN, INT_REF, APPROVAL and NONCE — they all become database keys", () => {
    expect(validateCallbackShape(form({ RRN: "a".repeat(33) }), TERMINAL)).toEqual({
      ok: false,
      reason: "invalid_reference",
    });
    expect(validateCallbackShape(form({ INT_REF: "a".repeat(129) }), TERMINAL)).toEqual({
      ok: false,
      reason: "invalid_reference",
    });
    expect(validateCallbackShape(form({ APPROVAL: "a".repeat(17) }), TERMINAL)).toEqual({
      ok: false,
      reason: "invalid_reference",
    });
    expect(validateCallbackShape(form({ NONCE: "zz" }), TERMINAL)).toEqual({
      ok: false,
      reason: "invalid_nonce",
    });
  });

  it("allows a blank APPROVAL, which a decline legitimately produces", () => {
    const result = validateCallbackShape(form({ APPROVAL: "", ACTION: "2" }), TERMINAL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.shape.approval).toBeNull();
  });
});

describe("storage sanitisation", () => {
  it("keeps protocol fields and P_SIGN, drops anything card-shaped", () => {
    const stored = sanitizeCallbackForStorage({
      AMOUNT: "3.00",
      ORDER: "20260819000042",
      P_SIGN: "abcd",
      CARD: "411111******1111",
      TOKEN: "opaque",
    });
    expect(stored).toEqual({ AMOUNT: "3.00", ORDER: "20260819000042", P_SIGN: "abcd" });
  });

  it("caps stored values", () => {
    const stored = sanitizeCallbackForStorage({ ORDER: "1".repeat(9999) });
    expect(stored.ORDER?.length).toBe(CALLBACK_MAX_VALUE_LENGTH);
  });
});
