// The grouped iOS offer list (owner feedback 2026-10-10): one section per
// subject with its periods inside, instead of one flat row per SKU.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  defaultOffer,
  groupIapOffers,
  openSubjectId,
  selectedOffer,
} from "../src/features/iap/offerGroups";
import type { IapOffer } from "../src/features/iap/catalog";

const offer = (over: Partial<IapOffer>): IapOffer => ({
  productId: "p",
  subjectId: "s1",
  subjectCode: "math",
  subjectName: "Riyaziyyat",
  interval: "month",
  displayPrice: "X",
  ...over,
});

describe("groupIapOffers", () => {
  it("makes one group per subject, keeping the catalogue's subject order", () => {
    const groups = groupIapOffers([
      offer({ productId: "b.week", subjectId: "s2", interval: "week" }),
      offer({ productId: "a.week", subjectId: "s1", interval: "week" }),
      offer({ productId: "b.month", subjectId: "s2", interval: "month" }),
      offer({ productId: "a.year", subjectId: "s1", interval: "year" }),
    ]);
    expect(groups.map((g) => g.subjectId)).toEqual(["s2", "s1"]);
    expect(groups[0].offers.map((o) => o.productId)).toEqual(["b.week", "b.month"]);
    expect(groups[1].offers.map((o) => o.productId)).toEqual(["a.week", "a.year"]);
  });

  it("orders periods shortest first whatever order they arrive in", () => {
    const [group] = groupIapOffers([
      offer({ productId: "y", interval: "year" }),
      offer({ productId: "w", interval: "week" }),
      offer({ productId: "m", interval: "month" }),
    ]);
    expect(group.offers.map((o) => o.interval)).toEqual(["week", "month", "year"]);
  });

  it("passes every offer through untouched — the price string included", () => {
    const original = offer({ productId: "m", displayPrice: "9,99 ₼" });
    const [group] = groupIapOffers([original]);
    expect(group.offers[0]).toBe(original);
    expect(group.offers[0].displayPrice).toBe("9,99 ₼");
  });

  it("keeps one offer per period (first wins)", () => {
    const [group] = groupIapOffers([
      offer({ productId: "m1", interval: "month" }),
      offer({ productId: "m2", interval: "month" }),
    ]);
    expect(group.offers.map((o) => o.productId)).toEqual(["m1"]);
  });

  it("returns nothing for nothing", () => {
    expect(groupIapOffers([])).toEqual([]);
  });

  it("21 SKUs become 7 groups of 3", () => {
    const offers: IapOffer[] = [];
    for (let s = 0; s < 7; s++) {
      for (const interval of ["week", "month", "year"] as const) {
        offers.push(offer({ productId: `s${s}.${interval}`, subjectId: `s${s}`, interval }));
      }
    }
    const groups = groupIapOffers(offers);
    expect(groups).toHaveLength(7);
    expect(groups.every((g) => g.offers.length === 3)).toBe(true);
  });
});

describe("the preselected period", () => {
  it("is monthly when monthly is on sale", () => {
    const [group] = groupIapOffers([
      offer({ productId: "w", interval: "week" }),
      offer({ productId: "m", interval: "month" }),
      offer({ productId: "y", interval: "year" }),
    ]);
    expect(defaultOffer(group)?.productId).toBe("m");
  });

  it("falls back to the shortest period, never jumps to the year first", () => {
    const [group] = groupIapOffers([
      offer({ productId: "y", interval: "year" }),
      offer({ productId: "w", interval: "week" }),
    ]);
    expect(defaultOffer(group)?.productId).toBe("w");
  });

  it("honours the parent's pick, and drops a pick that is no longer on sale", () => {
    const [group] = groupIapOffers([
      offer({ productId: "w", interval: "week" }),
      offer({ productId: "m", interval: "month" }),
    ]);
    expect(selectedOffer(group, "week")?.productId).toBe("w");
    expect(selectedOffer(group, "year")?.productId).toBe("m");
    expect(selectedOffer(group, undefined)?.productId).toBe("m");
  });
});

describe("which subject section is open", () => {
  const groups = groupIapOffers([
    offer({ productId: "a", subjectId: "s1" }),
    offer({ productId: "b", subjectId: "s2" }),
  ]);

  it("opens the first subject before the parent touches anything", () => {
    expect(openSubjectId(groups, undefined)).toBe("s1");
  });

  it("keeps the parent's choice, including closing everything", () => {
    expect(openSubjectId(groups, "s2")).toBe("s2");
    expect(openSubjectId(groups, null)).toBeNull();
  });

  it("hands the open state back to the first subject when the chosen one leaves", () => {
    expect(openSubjectId(groups, "s9")).toBe("s1");
    expect(openSubjectId([], undefined)).toBeNull();
  });
});

describe("the grouping module stays pure", () => {
  it("imports no React, react-native or StoreKit", () => {
    const code = readFileSync(
      join(resolve(__dirname, "..", "src"), "features", "iap", "offerGroups.ts"),
      "utf8",
    );
    const imports = code.match(/^import[^;]+;/gm) ?? [];
    expect(imports.every((line) => /^import type /.test(line))).toBe(true);
  });
});
