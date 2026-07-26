// Unit tests for the PUBLIC pricing configurator's pure logic
// (src/lib/pricingConfigurator.ts).
//
// This is the module the /services page's interactive price panel runs on, so
// the cases below are the ones a wrong answer would be visible to a customer:
// selection rules, interval recomputation, multi-subject totals, the empty
// state, hostile/stale hand-off query params, and money formatting.
import { describe, expect, it } from "vitest";
import {
  addSubject,
  availableSubjects,
  buildSelectionHref,
  buildSelectionQuery,
  computeQuote,
  DEFAULT_PLAN_INTERVAL,
  formatAzn,
  isPlanInterval,
  MAX_CONFIGURATOR_SUBJECTS,
  parseSelectionParams,
  removeSubject,
  selectedSubjects,
  subjectPrice,
  toggleSubject,
  type ConfiguratorSubject,
} from "@/lib/pricingConfigurator";

// Investor-approved public pricing: 3 / 9 / 90 AZN per subject per
// week / month / year. Mirrors the seeded `subjects_pricing` rows.
const MATH: ConfiguratorSubject = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "math",
  name: "Riyaziyyat",
  prices: { week: 3, month: 9, year: 90 },
};
const SCIENCE: ConfiguratorSubject = {
  id: "22222222-2222-4222-8222-222222222222",
  code: "science",
  name: "Elm",
  prices: { week: 3, month: 9, year: 90 },
};
const LOGIC: ConfiguratorSubject = {
  id: "33333333-3333-4333-8333-333333333333",
  code: "logic",
  name: "Məntiq",
  prices: { week: 3, month: 9, year: 90 },
};
/** Sold monthly only — exercises the "no price for this interval" path. */
const ENGLISH: ConfiguratorSubject = {
  id: "44444444-4444-4444-8444-444444444444",
  code: "english",
  name: "İngilis dili",
  prices: { month: 12 },
};

const CATALOG: ConfiguratorSubject[] = [MATH, SCIENCE, LOGIC, ENGLISH];

/** A well-formed UUID that is NOT in the catalog (archived / unknown subject). */
const ARCHIVED_ID = "99999999-9999-4999-8999-999999999999";

describe("interval guards", () => {
  it("accepts only the three DB plan_interval values", () => {
    expect(isPlanInterval("week")).toBe(true);
    expect(isPlanInterval("month")).toBe(true);
    expect(isPlanInterval("year")).toBe(true);
    expect(isPlanInterval("daily")).toBe(false);
    expect(isPlanInterval("")).toBe(false);
    expect(isPlanInterval(undefined)).toBe(false);
    expect(isPlanInterval(12)).toBe(false);
  });
});

describe("addSubject", () => {
  it("adds a catalog subject to an empty selection", () => {
    expect(addSubject([], MATH.id, CATALOG)).toEqual([MATH.id]);
  });

  it("appends in selection order", () => {
    const sel = addSubject(addSubject([], SCIENCE.id, CATALOG), MATH.id, CATALOG);
    expect(sel).toEqual([SCIENCE.id, MATH.id]);
  });

  it("never selects the same subject twice", () => {
    const once = addSubject([], MATH.id, CATALOG);
    const twice = addSubject(once, MATH.id, CATALOG);
    expect(twice).toEqual([MATH.id]);
    // ...not even with different letter casing in the incoming id.
    expect(addSubject(once, MATH.id.toUpperCase(), CATALOG)).toEqual([MATH.id]);
  });

  it("ignores ids that are not in the catalog (unknown or archived)", () => {
    expect(addSubject([], ARCHIVED_ID, CATALOG)).toEqual([]);
    expect(addSubject([], "not-a-uuid", CATALOG)).toEqual([]);
    expect(addSubject([MATH.id], ARCHIVED_ID, CATALOG)).toEqual([MATH.id]);
  });

  it("does not mutate the input array", () => {
    const original = [MATH.id];
    const next = addSubject(original, SCIENCE.id, CATALOG);
    expect(original).toEqual([MATH.id]);
    expect(next).not.toBe(original);
  });

  it("refuses to grow past the server-side cap", () => {
    const many: ConfiguratorSubject[] = Array.from(
      { length: MAX_CONFIGURATOR_SUBJECTS + 2 },
      (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        code: `s${i}`,
        name: `Subject ${i}`,
        prices: { month: 9 },
      }),
    );
    let selection: string[] = [];
    for (const s of many) selection = addSubject(selection, s.id, many);
    expect(selection).toHaveLength(MAX_CONFIGURATOR_SUBJECTS);
  });
});

describe("removeSubject / toggleSubject", () => {
  it("removes the requested subject and keeps the rest in order", () => {
    const sel = [MATH.id, SCIENCE.id, LOGIC.id];
    expect(removeSubject(sel, SCIENCE.id)).toEqual([MATH.id, LOGIC.id]);
  });

  it("is a no-op when the subject is not selected", () => {
    expect(removeSubject([MATH.id], SCIENCE.id)).toEqual([MATH.id]);
  });

  it("toggles on then off", () => {
    const on = toggleSubject([], MATH.id, CATALOG);
    expect(on).toEqual([MATH.id]);
    expect(toggleSubject(on, MATH.id, CATALOG)).toEqual([]);
  });
});

describe("availableSubjects / selectedSubjects", () => {
  it("splits the catalog into the two columns without overlap", () => {
    const selection = [SCIENCE.id];
    expect(availableSubjects(CATALOG, selection).map((s) => s.id)).toEqual([
      MATH.id,
      LOGIC.id,
      ENGLISH.id,
    ]);
    expect(selectedSubjects(CATALOG, selection).map((s) => s.id)).toEqual([SCIENCE.id]);
  });

  it("lists the selection in SELECTION order, not catalog order", () => {
    expect(selectedSubjects(CATALOG, [LOGIC.id, MATH.id]).map((s) => s.code)).toEqual([
      "logic",
      "math",
    ]);
  });

  it("drops selected ids that have no catalog entry", () => {
    expect(selectedSubjects(CATALOG, [MATH.id, ARCHIVED_ID])).toHaveLength(1);
  });
});

describe("subjectPrice", () => {
  it("returns the price for the interval, or null when not sold that way", () => {
    expect(subjectPrice(MATH, "year")).toBe(90);
    expect(subjectPrice(ENGLISH, "month")).toBe(12);
    expect(subjectPrice(ENGLISH, "week")).toBeNull();
    expect(subjectPrice(undefined, "month")).toBeNull();
  });
});

describe("computeQuote", () => {
  it("reports the empty state when nothing is selected", () => {
    const q = computeQuote(CATALOG, [], "month");
    expect(q.hasSelection).toBe(false);
    expect(q.count).toBe(0);
    expect(q.lines).toEqual([]);
    expect(q.subtotal).toBe(0);
    expect(q.total).toBe(0);
    expect(q.perSubject).toBeNull();
  });

  it("totals a single subject", () => {
    const q = computeQuote(CATALOG, [MATH.id], "month");
    expect(q.count).toBe(1);
    expect(q.perSubject).toBe(9);
    expect(q.subtotal).toBe(9);
    expect(q.total).toBe(9);
  });

  it("totals multiple subjects", () => {
    const q = computeQuote(CATALOG, [MATH.id, SCIENCE.id, LOGIC.id], "month");
    expect(q.count).toBe(3);
    expect(q.subtotal).toBe(27);
    expect(q.total).toBe(27);
  });

  it("recomputes when the interval changes", () => {
    const selection = [MATH.id, SCIENCE.id];
    expect(computeQuote(CATALOG, selection, "week").total).toBe(6);
    expect(computeQuote(CATALOG, selection, "month").total).toBe(18);
    expect(computeQuote(CATALOG, selection, "year").total).toBe(180);
  });

  // The old version of this test asserted `q.total === q.subtotal`, which is a
  // tautology against `total: subtotal` — it could not fail for any input.
  // Pin the CONTRACT instead: no discount field may exist, and the total must
  // equal an independently computed sum of the priced lines.
  it("never invents a discount — the total is exactly the sum of the priced lines", () => {
    for (const iv of ["week", "month", "year"] as const) {
      const q = computeQuote(CATALOG, [MATH.id, SCIENCE.id, LOGIC.id], iv);
      const independentSum = q.lines.reduce((sum, l) => sum + (l.price ?? 0), 0);
      expect(q.total).toBe(independentSum);
      expect(q).not.toHaveProperty("discount");
      expect(q).not.toHaveProperty("discountPercent");
    }
  });

  it("hides the single per-subject figure when the prices differ", () => {
    const q = computeQuote(CATALOG, [MATH.id, ENGLISH.id], "month");
    expect(q.subtotal).toBe(21); // 9 + 12
    expect(q.perSubject).toBeNull();
  });

  it("flags a subject that is not sold on the chosen interval and excludes it from the total", () => {
    const q = computeQuote(CATALOG, [MATH.id, ENGLISH.id], "week");
    expect(q.hasUnpriced).toBe(true);
    expect(q.lines.find((l) => l.id === ENGLISH.id)?.price).toBeNull();
    expect(q.total).toBe(3); // only Riyaziyyat is sold weekly
  });

  // Round 49 regression: a MIXED basket used to render "2 subjects ·
  // 3,00 AZN each · total 3,00 AZN" — arithmetic that visibly did not add up,
  // because perSubject came from the priced lines while count included the
  // unpriced one.
  it("does not show a single per-subject figure that contradicts the count", () => {
    const q = computeQuote(CATALOG, [MATH.id, ENGLISH.id], "week");
    expect(q.count).toBe(2);
    expect(q.pricedCount).toBe(1);
    expect(q.perSubject).toBeNull();
    expect(q.allUnpriced).toBe(false);
  });

  // Round 49 regression: an ALL-unpriced basket summed to 0 and rendered
  // "0,00 AZN" with an enabled Continue button — it told the visitor the
  // basket was free, and the hand-off then dead-ended at the server quote.
  it("marks a basket as unquotable when nothing in it is sold on the interval", () => {
    const q = computeQuote(CATALOG, [ENGLISH.id], "week");
    expect(q.hasSelection).toBe(true);
    expect(q.pricedCount).toBe(0);
    expect(q.allUnpriced).toBe(true);
    expect(q.subtotal).toBe(0);
    // The caller must branch on allUnpriced rather than rendering this 0.
    expect(q.total).toBe(0);
  });

  it("keeps allUnpriced false for an empty basket (that is the empty state)", () => {
    const q = computeQuote(CATALOG, [], "week");
    expect(q.hasSelection).toBe(false);
    expect(q.allUnpriced).toBe(false);
    expect(q.pricedCount).toBe(0);
  });

  it("ignores unknown ids instead of throwing (stale shared link)", () => {
    const q = computeQuote(CATALOG, [ARCHIVED_ID, MATH.id], "month");
    expect(q.count).toBe(1);
    expect(q.total).toBe(9);
  });

  it("falls back to the default interval when handed a bad one", () => {
    const q = computeQuote(CATALOG, [MATH.id], "quarterly" as never);
    expect(q.interval).toBe(DEFAULT_PLAN_INTERVAL);
  });

  it("keeps fractional prices exact (no float dust)", () => {
    const cents: ConfiguratorSubject[] = [
      { id: MATH.id, code: "a", name: "A", prices: { month: 0.1 } },
      { id: SCIENCE.id, code: "b", name: "B", prices: { month: 0.2 } },
    ];
    expect(computeQuote(cents, [MATH.id, SCIENCE.id], "month").total).toBe(0.3);
  });
});

describe("formatAzn", () => {
  it("uses the Azerbaijani decimal comma by default", () => {
    expect(formatAzn(27)).toBe("27,00 AZN");
    expect(formatAzn(9)).toBe("9,00 AZN");
    expect(formatAzn(0)).toBe("0,00 AZN");
    expect(formatAzn(1080)).toBe("1080,00 AZN");
  });

  it("localizes the decimal separator", () => {
    expect(formatAzn(27, "az")).toBe("27,00 AZN");
    expect(formatAzn(27, "ru")).toBe("27,00 AZN");
    expect(formatAzn(27, "en")).toBe("27.00 AZN");
  });

  it("always shows exactly two decimals (exact prices, never approximations)", () => {
    expect(formatAzn(12.5)).toBe("12,50 AZN");
    expect(formatAzn(12.005)).toBe("12,01 AZN");
    expect(formatAzn(0.1 + 0.2)).toBe("0,30 AZN");
    expect(formatAzn(27)).not.toContain("≈");
  });

  it("renders the em dash for a missing / non-finite amount", () => {
    expect(formatAzn(null)).toBe("—");
    expect(formatAzn(undefined)).toBe("—");
    expect(formatAzn(Number.NaN)).toBe("—");
    expect(formatAzn(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("parseSelectionParams (hand-off arriving from a URL)", () => {
  it("restores a valid selection and interval", () => {
    const parsed = parseSelectionParams(
      { subjects: `${MATH.id},${SCIENCE.id}`, interval: "year" },
      CATALOG,
    );
    expect(parsed.subjectIds).toEqual([MATH.id, SCIENCE.id]);
    expect(parsed.interval).toBe("year");
  });

  it("drops unknown / archived subject ids silently", () => {
    const parsed = parseSelectionParams(
      { subjects: `${MATH.id},${ARCHIVED_ID}`, interval: "month" },
      CATALOG,
    );
    expect(parsed.subjectIds).toEqual([MATH.id]);
  });

  it("drops entries that are not UUID-shaped", () => {
    const parsed = parseSelectionParams(
      { subjects: `${MATH.id},<script>,1,,${SCIENCE.id}`, interval: "month" },
      CATALOG,
    );
    expect(parsed.subjectIds).toEqual([MATH.id, SCIENCE.id]);
  });

  it("collapses duplicates, including differing casing", () => {
    const parsed = parseSelectionParams(
      { subjects: `${MATH.id},${MATH.id.toUpperCase()},${MATH.id}` },
      CATALOG,
    );
    expect(parsed.subjectIds).toEqual([MATH.id]);
  });

  it("normalizes to the catalog's own id casing", () => {
    const parsed = parseSelectionParams({ subjects: MATH.id.toUpperCase() }, CATALOG);
    expect(parsed.subjectIds).toEqual([MATH.id]);
  });

  it("tolerates whitespace around ids", () => {
    const parsed = parseSelectionParams(
      { subjects: ` ${MATH.id} , ${SCIENCE.id} ` },
      CATALOG,
    );
    expect(parsed.subjectIds).toEqual([MATH.id, SCIENCE.id]);
  });

  it("falls back to the default interval for a missing or bogus value", () => {
    expect(parseSelectionParams({ subjects: MATH.id }, CATALOG).interval).toBe(
      DEFAULT_PLAN_INTERVAL,
    );
    expect(
      parseSelectionParams({ subjects: MATH.id, interval: "forever" }, CATALOG).interval,
    ).toBe(DEFAULT_PLAN_INTERVAL);
  });

  it("uses the first value when a param is repeated", () => {
    const parsed = parseSelectionParams(
      { subjects: [MATH.id, SCIENCE.id], interval: ["week", "year"] },
      CATALOG,
    );
    expect(parsed.subjectIds).toEqual([MATH.id]);
    expect(parsed.interval).toBe("week");
  });

  it("discards an absurdly long value outright", () => {
    const parsed = parseSelectionParams(
      { subjects: `${MATH.id},${"x".repeat(2000)}` },
      CATALOG,
    );
    expect(parsed.subjectIds).toEqual([]);
  });

  it("returns an empty selection for missing / empty params", () => {
    expect(parseSelectionParams({}, CATALOG).subjectIds).toEqual([]);
    expect(parseSelectionParams({ subjects: "" }, CATALOG).subjectIds).toEqual([]);
    expect(parseSelectionParams({ subjects: undefined }, CATALOG).subjectIds).toEqual([]);
  });

  it("returns nothing when the catalog is empty (everything is unknown)", () => {
    expect(parseSelectionParams({ subjects: MATH.id }, []).subjectIds).toEqual([]);
  });

  it("caps the restored selection at the server-side maximum", () => {
    const many: ConfiguratorSubject[] = Array.from({ length: 25 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      code: `s${i}`,
      name: `Subject ${i}`,
      prices: { month: 9 },
    }));
    const parsed = parseSelectionParams(
      { subjects: many.map((s) => s.id).join(",") },
      many,
    );
    expect(parsed.subjectIds).toHaveLength(MAX_CONFIGURATOR_SUBJECTS);
  });
});

describe("buildSelectionQuery / buildSelectionHref (hand-off leaving the page)", () => {
  it("carries only subject ids and the interval — never a price or total", () => {
    const query = buildSelectionQuery([MATH.id, SCIENCE.id], "year");
    expect(query).toBe(`?subjects=${MATH.id}%2C${SCIENCE.id}&interval=year`);
    expect(query).not.toMatch(/price|total|amount|discount|AZN/i);
  });

  it("returns an empty string when nothing is selected", () => {
    expect(buildSelectionQuery([], "month")).toBe("");
    expect(buildSelectionHref("/register", [], "month")).toBe("/register");
  });

  it("produces a same-origin relative href", () => {
    const href = buildSelectionHref("/children/new", [MATH.id], "month");
    expect(href.startsWith("/children/new?")).toBe(true);
    expect(href).not.toMatch(/^(https?:)?\/\//);
  });

  it("round-trips through parseSelectionParams", () => {
    const selection = [MATH.id, LOGIC.id];
    const query = buildSelectionQuery(selection, "week");
    const params = new URLSearchParams(query);
    const parsed = parseSelectionParams(
      {
        subjects: params.get("subjects") ?? undefined,
        interval: params.get("interval") ?? undefined,
      },
      CATALOG,
    );
    expect(parsed.subjectIds).toEqual(selection);
    expect(parsed.interval).toBe("week");
  });
});
