// No admin-editable money field may accept a negative amount.
//
// WHY THIS SUITE EXISTS. The panel's subject-price rail was already well built
// — an HTML min, a string-shape parser with no optional sign, and an RPC
// re-checking the bound in the database. What the audit found is that none of
// that is a BOUNDARY: subjects_pricing and olympiad_packages both carry an RLS
// write policy of `for all to authenticated using (is_admin())`, which grants
// plain table INSERT/UPDATE to any signed-in administrator. So
//     PATCH /rest/v1/subjects_pricing  {"price_amount": -5}
// succeeded with an admin session, entirely bypassing the parser and the RPC.
// Migration 2026_08_29_162 added the CHECK constraints that close that path.
//
// These tests pin the APPLICATION half — the layer that produces a readable
// error instead of a constraint violation — and specifically the properties
// that are easy to lose in a refactor:
//   * the shape check rejects a sign before any Number() is reached;
//   * the two rails have DIFFERENT floors on purpose (a free olympiad package
//     is a real product concept, a free subscription subject is not);
//   * money never goes through float arithmetic.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parsePriceAmount,
  parsePackagePriceAmount,
  PRICE_MAX,
} from "@/app/(protected)/pricing/shared";

describe("subscription price parsing", () => {
  it("refuses every way of writing a negative", () => {
    for (const bad of ["-5", "-0.01", "-0", " -5 ", "+-5", "−5"]) {
      expect(parsePriceAmount(bad)).toBeNull();
    }
  });

  it("refuses a leading plus, which Number() would happily accept", () => {
    // Number("+5") is 5. The shape check is what stops it, and that is the
    // point of checking the STRING before converting.
    expect(Number("+5")).toBe(5);
    expect(parsePriceAmount("+5")).toBeNull();
  });

  it("refuses zero — a free subject comes from the free-access rail", () => {
    expect(parsePriceAmount("0")).toBeNull();
    expect(parsePriceAmount("0.00")).toBeNull();
  });

  it("refuses more than two decimals and anything over the cap", () => {
    expect(parsePriceAmount("9.999")).toBeNull();
    expect(parsePriceAmount(String(PRICE_MAX + 1))).toBeNull();
  });

  it("accepts the real prices", () => {
    expect(parsePriceAmount("3")).toBe(3);
    expect(parsePriceAmount("9.50")).toBe(9.5);
    expect(parsePriceAmount("90.00")).toBe(90);
  });
});

describe("olympiad package price parsing", () => {
  it("refuses negatives too", () => {
    for (const bad of ["-1", "-0.01", " -1 "]) {
      expect(parsePackagePriceAmount(bad)).toBeNull();
    }
  });

  it("ACCEPTS zero, unlike the subscription rail", () => {
    // purchase_olympiad_if_free exists precisely to deliver a free package.
    // If this ever starts returning null, that RPC becomes unreachable.
    expect(parsePackagePriceAmount("0")).toBe(0);
    expect(parsePackagePriceAmount("0.00")).toBe(0);
    expect(parsePriceAmount("0")).toBeNull();
  });

  it("has the upper bound the old hand-rolled check lacked", () => {
    // 999999999 used to reach Postgres and return a numeric overflow, which the
    // admin saw as a generic "server error".
    expect(parsePackagePriceAmount("999999999")).toBeNull();
    expect(parsePackagePriceAmount(String(PRICE_MAX))).toBe(PRICE_MAX);
  });
});

describe("money never touches float arithmetic", () => {
  // Comments are blanked first: the code documents the defect it replaced by
  // QUOTING the old `Math.round(priceNum * 100) / 100`, and that explanation is
  // worth keeping. Scanning raw source would match the comment and fail on the
  // very sentence explaining the fix.
  const olympiad = readFileSync(
    resolve(process.cwd(), "src/lib/admin/olympiad.ts"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  it("no longer rounds a price through a float", () => {
    // `Math.round(priceNum * 100) / 100` was the one place in the panel doing
    // arithmetic on money. The parser proves "≤ 2 decimals" from the string
    // shape instead, so no rounding is needed.
    expect(olympiad).not.toMatch(/Math\.round\([^)]*\*\s*100\)/);
  });

  it("routes the package price through the shared parser", () => {
    expect(olympiad).toContain("parsePackagePriceAmount");
  });
});
