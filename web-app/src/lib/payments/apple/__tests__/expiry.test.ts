// The expiry a NON-RENEWING subscription does not carry.
//
// Apple sends no `expiresDate` for these products, so every one of these cases
// is a date the platform invents. The month-end cases are the ones that matter:
// they must agree with Postgres `+ interval '1 month'`, which CLAMPS (31 Jan +
// 1 month = 28 Feb) rather than overflowing into March — otherwise a month
// bought on iOS and a month bought on the web end on different days.
import { describe, expect, it } from "vitest";
import {
  PURCHASE_DATE_MAX_MS,
  PURCHASE_DATE_MIN_MS,
  addCalendarMonthsUtc,
  computeEndsAt,
  isPlausiblePurchaseDateMs,
} from "../expiry";

/** ISO in, ISO out — reads like the calendar it is asserting about. */
function endsAt(iso: string, interval: "week" | "month" | "year"): string | null {
  const result = computeEndsAt(Date.parse(iso), interval);
  return result === null ? null : result.toISOString();
}

describe("week", () => {
  it("adds exactly seven days", () => {
    expect(endsAt("2026-01-15T09:30:00.000Z", "week")).toBe("2026-01-22T09:30:00.000Z");
  });

  it("crosses a month boundary without calendar logic", () => {
    expect(endsAt("2026-02-25T00:00:00.000Z", "week")).toBe("2026-03-04T00:00:00.000Z");
  });

  it("crosses a year boundary", () => {
    expect(endsAt("2026-12-29T23:59:59.000Z", "week")).toBe("2027-01-05T23:59:59.000Z");
  });
});

describe("month — the boundary that Postgres clamps", () => {
  it("31 Jan + 1 month is 28 Feb, not 3 March", () => {
    expect(endsAt("2026-01-31T10:00:00.000Z", "month")).toBe("2026-02-28T10:00:00.000Z");
  });

  it("clamps into a LEAP February", () => {
    expect(endsAt("2024-01-31T10:00:00.000Z", "month")).toBe("2024-02-29T10:00:00.000Z");
  });

  it("31 Aug + 1 month is 30 Sep", () => {
    expect(endsAt("2026-08-31T00:00:00.000Z", "month")).toBe("2026-09-30T00:00:00.000Z");
  });

  it("31 Dec + 1 month rolls the year and keeps the day", () => {
    expect(endsAt("2026-12-31T12:00:00.000Z", "month")).toBe("2027-01-31T12:00:00.000Z");
  });

  it("keeps a mid-month day untouched", () => {
    expect(endsAt("2026-03-15T06:45:12.345Z", "month")).toBe("2026-04-15T06:45:12.345Z");
  });

  it("preserves the time of day exactly, including milliseconds", () => {
    expect(endsAt("2026-01-31T23:59:59.999Z", "month")).toBe("2026-02-28T23:59:59.999Z");
  });
});

describe("year", () => {
  it("29 Feb + 1 year is 28 Feb of a non-leap year", () => {
    expect(endsAt("2024-02-29T08:00:00.000Z", "year")).toBe("2025-02-28T08:00:00.000Z");
  });

  it("is twelve calendar months, not 365 days", () => {
    // 2027 is not a leap year, so a naive +365d from this instant would land on
    // 2027-03-01 rather than the same calendar day.
    expect(endsAt("2026-03-01T00:00:00.000Z", "year")).toBe("2027-03-01T00:00:00.000Z");
  });

  it("handles a leap day arriving from a leap year into another leap year", () => {
    expect(endsAt("2024-02-29T00:00:00.000Z", "month")).toBe("2024-03-29T00:00:00.000Z");
  });
});

describe("addCalendarMonthsUtc", () => {
  it("walks multiple years backwards and forwards consistently", () => {
    const jan31 = Date.parse("2026-01-31T00:00:00.000Z");
    expect(new Date(addCalendarMonthsUtc(jan31, 0)).toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(new Date(addCalendarMonthsUtc(jan31, 13)).toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(new Date(addCalendarMonthsUtc(jan31, -1)).toISOString()).toBe("2025-12-31T00:00:00.000Z");
    expect(new Date(addCalendarMonthsUtc(jan31, -11)).toISOString()).toBe("2025-02-28T00:00:00.000Z");
  });
});

describe("a purchase date we refuse to do arithmetic on", () => {
  it("rejects seconds mistaken for milliseconds", () => {
    // A 2026 instant expressed in SECONDS is 1.7e9 — which as milliseconds is
    // 1970. Silently granting a period starting in 1970 is worse than refusing.
    expect(isPlausiblePurchaseDateMs(1_788_000_000)).toBe(false);
    expect(computeEndsAt(1_788_000_000, "month")).toBeNull();
  });

  it("rejects non-integers, NaN, Infinity and negatives", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5]) {
      expect(isPlausiblePurchaseDateMs(bad)).toBe(false);
      expect(computeEndsAt(bad, "year")).toBeNull();
    }
  });

  it("rejects values outside the sanity window but accepts its floor", () => {
    expect(isPlausiblePurchaseDateMs(PURCHASE_DATE_MIN_MS)).toBe(true);
    expect(isPlausiblePurchaseDateMs(PURCHASE_DATE_MIN_MS - 1)).toBe(false);
    expect(isPlausiblePurchaseDateMs(PURCHASE_DATE_MAX_MS)).toBe(false);
  });

  it("rejects an interval that arrived from a database row rather than the type", () => {
    const purchase = Date.parse("2026-05-05T00:00:00.000Z");
    expect(computeEndsAt(purchase, "decade" as unknown as "month")).toBeNull();
  });
});

describe("the end is always after the start", () => {
  it("holds for every interval at a month-end instant", () => {
    const purchase = Date.parse("2026-01-31T00:00:00.000Z");
    for (const interval of ["week", "month", "year"] as const) {
      const result = computeEndsAt(purchase, interval);
      expect(result).not.toBeNull();
      expect(result!.getTime()).toBeGreaterThan(purchase);
    }
  });
});
