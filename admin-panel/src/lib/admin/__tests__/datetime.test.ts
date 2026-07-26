// Hardened Baku date formatting — guards against the CLDR root-locale bug
// where Intl.DateTimeFormat with a bare "az" tag renders months as the raw
// pattern placeholder ("2026 M08 22"). The helper must always produce a real
// month word in all three locales and pin the clock to Asia/Baku (UTC+4).
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatBakuDate, formatBakuDateTime } from "../datetime";

// 10:30 UTC on 22 Aug 2026 → 14:30 in Baku, same calendar day.
const AUG_22_UTC = "2026-08-22T10:30:00Z";
// 21:30 UTC on 22 Aug 2026 → 01:30 on 23 Aug in Baku (crosses midnight).
const AUG_22_LATE_UTC = "2026-08-22T21:30:00Z";

const ICU_MONTH_PLACEHOLDER = /M\d\d/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatBakuDateTime", () => {
  it.each([
    ["az", /avq/i],
    ["en", /aug/i],
    ["ru", /авг/i],
  ] as const)("renders a real August month word for %s (never M08)", (locale, month) => {
    const out = formatBakuDateTime(AUG_22_UTC, locale);
    expect(out).not.toMatch(ICU_MONTH_PLACEHOLDER);
    expect(out).toMatch(month);
    expect(out).toContain("22");
    expect(out).toContain("2026");
    expect(out).toContain("14:30");
  });

  it("respects the fixed Asia/Baku +4 offset across midnight", () => {
    const out = formatBakuDateTime(AUG_22_LATE_UTC, "az");
    expect(out).toContain("23"); // Baku is already the 23rd
    expect(out).toContain("01:30");
  });

  it("accepts Date and epoch-ms inputs (settings page passes Date objects)", () => {
    const viaDate = formatBakuDateTime(new Date(AUG_22_UTC), "en");
    const viaMs = formatBakuDateTime(Date.parse(AUG_22_UTC), "en");
    expect(viaDate).toBe(formatBakuDateTime(AUG_22_UTC, "en"));
    expect(viaMs).toBe(viaDate);
  });

  it("returns \"\" on empty or invalid input (existing contract)", () => {
    expect(formatBakuDateTime(null, "az")).toBe("");
    expect(formatBakuDateTime(undefined, "az")).toBe("");
    expect(formatBakuDateTime("", "az")).toBe("");
    expect(formatBakuDateTime("not-a-date", "az")).toBe("");
  });

  it("falls back to hand-mapped month names when Intl leaks the root placeholder", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      (() => ({ format: () => "2026 M08 22" })) as never,
    );
    expect(formatBakuDateTime(AUG_22_UTC, "az")).toBe("22 avq 2026, 14:30");
    expect(formatBakuDateTime(AUG_22_UTC, "en")).toBe("22 Aug 2026, 14:30");
    expect(formatBakuDateTime(AUG_22_UTC, "ru")).toBe("22 авг. 2026, 14:30");
  });

  it("falls back when the runtime's Intl throws (missing locale/tz data)", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation((() => {
      throw new RangeError("missing data");
    }) as never);
    expect(formatBakuDateTime(AUG_22_LATE_UTC, "az")).toBe("23 avq 2026, 01:30");
  });
});

describe("formatBakuDate", () => {
  it.each([
    ["az", /avq/i],
    ["en", /aug/i],
    ["ru", /авг/i],
  ] as const)("renders a date-only value with a real month word for %s", (locale, month) => {
    const out = formatBakuDate(AUG_22_UTC, locale);
    expect(out).not.toMatch(ICU_MONTH_PLACEHOLDER);
    expect(out).toMatch(month);
    expect(out).toContain("2026");
    expect(out).not.toContain("14:30");
  });

  it("shifts to the next Baku day after 20:00 UTC", () => {
    expect(formatBakuDate(AUG_22_LATE_UTC, "en")).toContain("23");
  });

  it("uses hand-mapped month names when Intl leaks the placeholder", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      (() => ({ format: () => "2026 M08 22" })) as never,
    );
    expect(formatBakuDate(AUG_22_UTC, "az")).toBe("22 avq 2026");
  });

  it("returns \"\" on bad input", () => {
    expect(formatBakuDate(null, "az")).toBe("");
    expect(formatBakuDate("garbage", "ru")).toBe("");
  });
});
