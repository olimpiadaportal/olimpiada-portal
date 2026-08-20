// Field formatting and validation. Everything the gateway would reject with an
// opaque failure is rejected here instead, where it can be read.
import { describe, expect, it } from "vitest";
import {
  amountsMatch,
  formatAmount,
  formatTimestamp,
  generateNonce,
  isQueryableOrder,
  isValidCountry,
  isValidCurrency,
  isValidNonce,
  isValidOrder,
  isValidReference,
  isValidTerminal,
  isValidTimestamp,
  mintOrderCandidate,
  orderDatePart,
  parseAmount,
  parseTimestamp,
  timestampSkewSeconds,
  TIMESTAMP_MAX_SKEW_SECONDS,
} from "../format";

describe("AMOUNT", () => {
  it("always renders two decimals", () => {
    expect(formatAmount(3)).toBe("3.00");
    expect(formatAmount(11.48)).toBe("11.48");
    expect(formatAmount(0.5)).toBe("0.50");
    expect(formatAmount(90)).toBe("90.00");
  });

  it("survives binary float dust", () => {
    // 1.005 and 0.1+0.2 are the two classic ways a money string comes out wrong.
    expect(formatAmount(0.1 + 0.2)).toBe("0.30");
    expect(formatAmount(1.005)).toBe("1.01");
  });

  it("refuses what must never be sent", () => {
    expect(formatAmount(-1)).toBeNull();
    expect(formatAmount(Number.NaN)).toBeNull();
    expect(formatAmount(Number.POSITIVE_INFINITY)).toBeNull();
    // Longer than the 12-character field.
    expect(formatAmount(12_345_678_901)).toBeNull();
  });

  it("parses what the gateway may echo, and nothing else", () => {
    expect(parseAmount("3")).toBe(3);
    expect(parseAmount("3.00")).toBe(3);
    expect(parseAmount(" 11.48 ")).toBe(11.48);
    expect(parseAmount("3,00")).toBeNull(); // comma decimal separator
    expect(parseAmount("3 AZN")).toBeNull();
    expect(parseAmount("1e3")).toBeNull();
    expect(parseAmount("-3")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });

  it("compares amounts numerically, because we send 3.00 and they may echo 3", () => {
    expect(amountsMatch("3.00", "3")).toBe(true);
    expect(amountsMatch("3.0", "3.00")).toBe(true);
    expect(amountsMatch("3.00", "3.01")).toBe(false);
    expect(amountsMatch("3.00", "nonsense")).toBe(false);
  });
});

describe("TIMESTAMP", () => {
  it("formats UTC as YYYYMMDDHHMMSS", () => {
    expect(formatTimestamp(new Date(Date.UTC(2003, 0, 5, 15, 30, 21)))).toBe(
      "20030105153021",
    );
    expect(formatTimestamp(new Date(Date.UTC(2026, 7, 19, 0, 0, 0)))).toBe(
      "20260819000000",
    );
  });

  it("is UTC, not local time", () => {
    // The one failure that would silently break every transaction in a non-UTC
    // deployment: a formatter reading local getHours().
    const d = new Date(Date.UTC(2026, 7, 19, 23, 59, 59));
    expect(formatTimestamp(d)).toBe("20260819235959");
  });

  it("round-trips", () => {
    const d = new Date(Date.UTC(2026, 7, 19, 12, 34, 56));
    expect(parseTimestamp(formatTimestamp(d))?.getTime()).toBe(d.getTime());
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseTimestamp("20260231120000")).toBeNull(); // 31 February
    expect(parseTimestamp("20261301120000")).toBeNull(); // month 13
    expect(parseTimestamp("20260819250000")).toBeNull(); // hour 25
    expect(isValidTimestamp("2026081912345")).toBe(false); // 13 digits
    expect(isValidTimestamp("2026-08-19T12:34:56Z")).toBe(false);
  });

  it("measures skew against the gateway's one-hour tolerance", () => {
    const now = new Date(Date.UTC(2026, 7, 19, 12, 0, 0));
    expect(timestampSkewSeconds("20260819120000", now)).toBe(0);
    expect(timestampSkewSeconds("20260819113000", now)).toBe(1800);
    expect(timestampSkewSeconds("20260819100000", now)).toBeGreaterThan(
      TIMESTAMP_MAX_SKEW_SECONDS,
    );
    expect(timestampSkewSeconds("rubbish", now)).toBeNull();
  });
});

describe("NONCE", () => {
  it("generates hex inside the 8–32 byte range", () => {
    const n = generateNonce();
    expect(n).toMatch(/^[0-9A-F]+$/);
    expect(n.length).toBe(32); // 16 bytes
    expect(isValidNonce(n)).toBe(true);
  });

  it("clamps a silly request rather than emitting an invalid nonce", () => {
    expect(isValidNonce(generateNonce(1))).toBe(true);
    expect(isValidNonce(generateNonce(9999))).toBe(true);
    expect(generateNonce(1).length).toBe(16); // clamped up to 8 bytes
    expect(generateNonce(9999).length).toBe(64); // clamped down to 32 bytes
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateNonce()));
    expect(seen.size).toBe(200);
  });

  it("validates the spec's own example and rejects near-misses", () => {
    expect(isValidNonce("F2B2DD7E603A7ADA")).toBe(true);
    expect(isValidNonce("7cfb4c2512eeec72")).toBe(true); // lowercase is fine
    expect(isValidNonce("F2B2DD7E603A7AD")).toBe(false); // odd length
    expect(isValidNonce("F2B2DD7E")).toBe(false); // 4 bytes, under the floor
    expect(isValidNonce("Z2B2DD7E603A7ADA")).toBe(false); // not hex
    expect(isValidNonce("a".repeat(66))).toBe(false); // 33 bytes, over the cap
  });
});

describe("ORDER", () => {
  it("is numeric and 6–32 characters", () => {
    expect(isValidOrder("123456")).toBe(true);
    expect(isValidOrder("1".repeat(32))).toBe(true);
    expect(isValidOrder("12345")).toBe(false);
    expect(isValidOrder("1".repeat(33))).toBe(false);
    expect(isValidOrder("2026-08-19")).toBe(false);
    expect(isValidOrder("2026081900000a")).toBe(false);
  });

  it("narrows to 20 characters for a status query", () => {
    expect(isQueryableOrder("1".repeat(20))).toBe(true);
    expect(isQueryableOrder("1".repeat(21))).toBe(false);
    expect(isValidOrder("1".repeat(21))).toBe(true); // still a valid ORDER
  });

  it("mints YYYYMMDD + six digits, in UTC", () => {
    const day = new Date(Date.UTC(2026, 7, 19, 22, 0, 0));
    expect(mintOrderCandidate(day, () => 42)).toBe("20260819000042");
    expect(mintOrderCandidate(day, () => 999_999)).toBe("20260819999999");
    expect(orderDatePart(day)).toBe("20260819");
  });

  it("mints something the gateway and the status query both accept", () => {
    const order = mintOrderCandidate();
    expect(order).toHaveLength(14);
    expect(isValidOrder(order)).toBe(true);
    expect(isQueryableOrder(order)).toBe(true);
  });

  it("keeps the suffix six digits even for an out-of-range random source", () => {
    const day = new Date(Date.UTC(2026, 7, 19));
    expect(mintOrderCandidate(day, () => 1_000_000)).toBe("20260819000000");
    expect(mintOrderCandidate(day, () => -7)).toBe("20260819000007");
  });
});

describe("small shapes", () => {
  it("TERMINAL is exactly 8 digits", () => {
    expect(isValidTerminal("17205223")).toBe(true);
    expect(isValidTerminal("1720522")).toBe(false);
    expect(isValidTerminal("172052233")).toBe(false);
    expect(isValidTerminal("1720522a")).toBe(false);
  });

  it("CURRENCY and COUNTRY are uppercase ISO codes", () => {
    expect(isValidCurrency("AZN")).toBe(true);
    expect(isValidCurrency("azn")).toBe(false);
    expect(isValidCountry("AZ")).toBe(true);
    expect(isValidCountry("AZE")).toBe(false);
  });

  it("references are bounded printable ASCII", () => {
    expect(isValidReference("306276834930", 32)).toBe(true);
    expect(isValidReference("4A29E93C607E33DC", 128)).toBe(true);
    expect(isValidReference("", 32)).toBe(false);
    expect(isValidReference("a".repeat(33), 32)).toBe(false);
    expect(isValidReference("with\nnewline", 32)).toBe(false);
    expect(isValidReference("ə", 32)).toBe(false);
  });
});
