// Round 49 — pure helpers behind the configurable per-attempt question count
// and the per-student, non-repeating rotation summary. These back a SERVER-SIDE
// gate (the admin form's min/max attributes are UX only), so the parser is
// tested against the hostile inputs a client can post.
import { describe, expect, it } from "vitest";
import {
  PER_ATTEMPT_MAX,
  PER_ATTEMPT_MIN,
  azOrdinalSuffix,
  estimateCycleAttempts,
  fillTemplate,
  gradeLabel,
  gradePoolShortfalls,
  parsePerAttempt,
  poolMeetsPerAttempt,
} from "../olympiad-per-attempt";

describe("parsePerAttempt", () => {
  it("accepts whole numbers inside the bounds", () => {
    expect(parsePerAttempt("1")).toBe(1);
    expect(parsePerAttempt("25")).toBe(25);
    expect(parsePerAttempt("50")).toBe(50);
    expect(parsePerAttempt(String(PER_ATTEMPT_MAX))).toBe(PER_ATTEMPT_MAX);
    expect(parsePerAttempt(" 30 ")).toBe(30);
  });

  it("rejects zero and negatives (a package must serve at least one question)", () => {
    expect(parsePerAttempt("0")).toBeNull();
    expect(parsePerAttempt("-1")).toBeNull();
    expect(parsePerAttempt("-50")).toBeNull();
    expect(parsePerAttempt(String(PER_ATTEMPT_MIN - 1))).toBeNull();
  });

  it("rejects anything above the upper bound", () => {
    expect(parsePerAttempt(String(PER_ATTEMPT_MAX + 1))).toBeNull();
    expect(parsePerAttempt("99999")).toBeNull();
  });

  it("rejects non-integers, empty values and junk", () => {
    expect(parsePerAttempt("")).toBeNull();
    expect(parsePerAttempt("   ")).toBeNull();
    expect(parsePerAttempt("12.5")).toBeNull();
    expect(parsePerAttempt("25px")).toBeNull();
    expect(parsePerAttempt("1e3")).toBeNull();
    expect(parsePerAttempt("+5")).toBeNull();
    expect(parsePerAttempt("NaN")).toBeNull();
    expect(parsePerAttempt("Infinity")).toBeNull();
    expect(parsePerAttempt(null)).toBeNull();
    expect(parsePerAttempt(undefined)).toBeNull();
    expect(parsePerAttempt({})).toBeNull();
    expect(parsePerAttempt(["25"])).toBeNull();
  });

  it("accepts a numeric value too (defensive: not only FormData strings)", () => {
    expect(parsePerAttempt(25)).toBe(25);
    expect(parsePerAttempt(25.5)).toBeNull();
  });
});

describe("estimateCycleAttempts", () => {
  it("divides the pool by the per-attempt count", () => {
    expect(estimateCycleAttempts(500, 50)).toBe(10);
    expect(estimateCycleAttempts(100, 25)).toBe(4);
  });

  it("rounds up when the pool is not divisible (boundary attempt)", () => {
    // 520 / 50 → 10 full attempts + a boundary attempt of 20 leftover + 30 new.
    expect(estimateCycleAttempts(520, 50)).toBe(11);
    expect(estimateCycleAttempts(51, 50)).toBe(2);
  });

  it("is 1 when the pool is smaller than the count (whole pool served)", () => {
    expect(estimateCycleAttempts(10, 50)).toBe(1);
    expect(estimateCycleAttempts(1, 500)).toBe(1);
  });

  it("returns 0 for empty pools and unusable counts instead of Infinity/NaN", () => {
    expect(estimateCycleAttempts(0, 50)).toBe(0);
    expect(estimateCycleAttempts(-5, 50)).toBe(0);
    expect(estimateCycleAttempts(500, 0)).toBe(0);
    expect(estimateCycleAttempts(500, -1)).toBe(0);
    expect(estimateCycleAttempts(Number.NaN, 50)).toBe(0);
    expect(estimateCycleAttempts(500, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("poolMeetsPerAttempt", () => {
  it("passes only when the pool can fill a whole attempt", () => {
    expect(poolMeetsPerAttempt(50, 50)).toBe(true);
    expect(poolMeetsPerAttempt(51, 50)).toBe(true);
    expect(poolMeetsPerAttempt(49, 50)).toBe(false);
    expect(poolMeetsPerAttempt(0, 1)).toBe(false);
  });

  it("never passes on non-finite input", () => {
    expect(poolMeetsPerAttempt(Number.NaN, 50)).toBe(false);
    expect(poolMeetsPerAttempt(50, Number.NaN)).toBe(false);
  });
});

describe("gradePoolShortfalls", () => {
  const grades = [
    { name: "5. sinif", level: 5, pool: 520 },
    { name: "6. sinif", level: 6, pool: 35 },
    { name: "7. sinif", level: 7, pool: 50 },
  ];

  it("returns only the grades whose pool cannot fill an attempt", () => {
    expect(gradePoolShortfalls(grades, 50).map((g) => g.level)).toEqual([6]);
  });

  it("returns nothing when every pool is deep enough", () => {
    expect(gradePoolShortfalls(grades, 25)).toEqual([]);
  });

  it("flags every grade when the count is raised above all pools", () => {
    expect(gradePoolShortfalls(grades, 600).map((g) => g.level)).toEqual([5, 6, 7]);
  });

  it("treats an empty pool as a shortfall", () => {
    expect(gradePoolShortfalls([{ pool: 0 }], 1)).toHaveLength(1);
  });
});

describe("azOrdinalSuffix / gradeLabel", () => {
  it("uses Azerbaijani vowel harmony for grades 1–11", () => {
    const suffixes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(azOrdinalSuffix);
    expect(suffixes).toEqual([
      "ci", "ci", "cü", "cü", "ci", "cı", "ci", "ci", "cu", "cu", "ci",
    ]);
  });

  it("renders the grade natively per locale", () => {
    expect(gradeLabel("az", 6)).toBe("6-cı sinif");
    expect(gradeLabel("az", 3)).toBe("3-cü sinif");
    expect(gradeLabel("az", 11)).toBe("11-ci sinif");
    expect(gradeLabel("en", 6)).toBe("Grade 6");
    expect(gradeLabel("ru", 6)).toBe("6-й класс");
  });

  it("falls back to the stored grade name when the level is unusable", () => {
    expect(gradeLabel("az", 0, "6. sinif")).toBe("6. sinif");
    expect(gradeLabel("en", Number.NaN, "6. sinif")).toBe("6. sinif");
    expect(gradeLabel("ru", -2)).toBe("");
  });
});

describe("fillTemplate", () => {
  it("replaces EVERY occurrence of a placeholder", () => {
    // The shortfall sentence names the required count twice — a plain
    // String.replace would leave the second "{count}" in the message.
    const az =
      "{grade} üçün {pool} sual yüklənib. Paket üzrə sual sayı {count} olduğu üçün ən azı {count} sual tələb olunur.";
    expect(
      fillTemplate(az, { grade: gradeLabel("az", 6), pool: 35, count: 50 }),
    ).toBe(
      "6-cı sinif üçün 35 sual yüklənib. Paket üzrə sual sayı 50 olduğu üçün ən azı 50 sual tələb olunur.",
    );
  });

  it("leaves unknown placeholders untouched and accepts numbers", () => {
    expect(fillTemplate("{a}/{b}", { a: 1 })).toBe("1/{b}");
  });
});
