// Round 42 — Hermes-safe long dates. On device, Hermes's partial ICU lacks
// az month names and Intl leaks the raw pattern placeholder ("2026 M08 6");
// formatLongDate must detect that (or an Intl throw) and fall back to manual
// month names, always computing the DAY in Asia/Baku (fixed UTC+4, no DST).
import { formatDayMonth, formatLongDate, formatShortDate } from "@/lib/formatDate";

// 2026-08-06 14:00 in Baku (UTC+4).
const ISO = "2026-08-06T10:00:00Z";
// 01:00 Baku on Aug 6 — still Aug 5 in UTC (the boundary case).
const MIDNIGHT = "2026-08-05T21:00:00Z";
// 23:30 Baku on Aug 5 — same UTC day as MIDNIGHT, different Baku day.
const LATE = "2026-08-05T19:30:00Z";

afterEach(() => {
  jest.restoreAllMocks();
});

describe("formatLongDate (Intl path — full ICU in jest/Node)", () => {
  it("renders real month names in all three locales (never the ICU M08 placeholder)", () => {
    const az = formatLongDate(ISO, "az");
    const en = formatLongDate(ISO, "en");
    const ru = formatLongDate(ISO, "ru");
    expect(az).toContain("avqust");
    expect(en).toContain("August");
    expect(ru).toContain("августа"); // genitive after the day number
    for (const out of [az, en, ru]) {
      expect(out).not.toMatch(/M\d\d/);
      expect(out).toContain("2026");
      expect(out).toMatch(/(^|\D)6(\D|$)/); // day 6
    }
  });

  it("uses the Baku day (UTC+4), not the UTC day, around midnight", () => {
    // 21:00Z on Aug 5 = 01:00 Baku on Aug 6.
    const az = formatLongDate(MIDNIGHT, "az");
    expect(az).toContain("avqust");
    expect(az).toMatch(/(^|\D)6(\D|$)/);
    // 19:30Z = 23:30 Baku — still Aug 5.
    expect(formatLongDate(LATE, "az")).toMatch(/(^|\D)5(\D|$)/);
  });

  it("appends the Baku time when withTime is set", () => {
    expect(formatLongDate(MIDNIGHT, "az", true)).toContain("01:00");
    expect(formatLongDate(ISO, "en", true)).toContain("14:00");
    expect(formatLongDate(ISO, "az")).not.toContain("14:00"); // date-only default
  });

  it("returns — for null/undefined/garbage (commerce.fmtDate parity)", () => {
    expect(formatLongDate(null, "az")).toBe("—");
    expect(formatLongDate(undefined, "en")).toBe("—");
    expect(formatLongDate("", "ru")).toBe("—");
    expect(formatLongDate("garbage", "az")).toBe("—");
  });
});

describe("formatLongDate (Hermes fallback — manual month names)", () => {
  it("falls back when ICU leaks the M08 placeholder (Hermes az)", () => {
    jest
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(
        () => ({ format: () => "2026 M08 6" }) as unknown as Intl.DateTimeFormat,
      );
    expect(formatLongDate(MIDNIGHT, "az")).toBe("6 avqust 2026");
    expect(formatLongDate(MIDNIGHT, "ru")).toBe("6 августа 2026");
    expect(formatLongDate(MIDNIGHT, "en")).toBe("6 August 2026");
    // Baku-day boundary holds in the fallback too.
    expect(formatLongDate(LATE, "az")).toBe("5 avqust 2026");
    // withTime = Baku wall-clock, zero-padded 24h.
    expect(formatLongDate(MIDNIGHT, "az", true)).toBe("6 avqust 2026 01:00");
    expect(formatLongDate(ISO, "ru", true)).toBe("6 августа 2026 14:00");
  });

  it("falls back when Intl itself throws (missing locale/timezone data)", () => {
    jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("no ICU data");
    });
    expect(formatLongDate(ISO, "az")).toBe("6 avqust 2026");
    expect(formatLongDate(ISO, "en", true)).toBe("6 August 2026 14:00");
    expect(formatLongDate(null, "ru")).toBe("—");
  });
});

// Round 46 — the same placeholder trap applied to the news/pricing/inbox
// surfaces, which built their own Intl formatters with only a try/catch.
// Hermes does NOT throw on missing month data, so those catches never fired.
describe("formatShortDate", () => {
  it("renders a real short month, never the placeholder", () => {
    expect(formatShortDate(ISO, "az")).not.toMatch(/M\d\d/);
    expect(formatShortDate(ISO, "en")).toContain("Aug");
    expect(formatShortDate(ISO, "az")).toContain("2026");
  });

  it("falls back to manual short months when ICU leaks the placeholder", () => {
    jest
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(
        () => ({ format: () => "2026 M08 6" }) as unknown as Intl.DateTimeFormat,
      );
    expect(formatShortDate(MIDNIGHT, "az")).toBe("6 avq 2026");
    expect(formatShortDate(MIDNIGHT, "ru")).toBe("6 авг. 2026");
    expect(formatShortDate(MIDNIGHT, "en")).toBe("6 Aug 2026");
    // Baku-day boundary holds here too.
    expect(formatShortDate(LATE, "az")).toBe("5 avq 2026");
  });

  it("returns an empty string for unset/invalid input (news meta parity)", () => {
    expect(formatShortDate(null, "az")).toBe("");
    expect(formatShortDate("garbage", "en")).toBe("");
  });
});

describe("formatDayMonth", () => {
  it("omits the year unless asked, and never leaks the placeholder", () => {
    const withoutYear = formatDayMonth(ISO, "az", false);
    expect(withoutYear).not.toMatch(/M\d\d/);
    expect(withoutYear).not.toContain("2026");
    expect(formatDayMonth(ISO, "az", true)).toContain("2026");
  });

  it("falls back to manual long months when ICU leaks the placeholder", () => {
    jest
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(
        () => ({ format: () => "2026 M08 6" }) as unknown as Intl.DateTimeFormat,
      );
    expect(formatDayMonth(MIDNIGHT, "az", false)).toBe("6 avqust");
    expect(formatDayMonth(MIDNIGHT, "az", true)).toBe("6 avqust 2026");
    expect(formatDayMonth(MIDNIGHT, "ru", false)).toBe("6 августа");
  });

  it("returns an empty string for unset/invalid input", () => {
    expect(formatDayMonth(null, "az", true)).toBe("");
    expect(formatDayMonth("garbage", "en", false)).toBe("");
  });
});
