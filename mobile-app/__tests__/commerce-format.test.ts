// Round 47 — money display parity with web formatAzn
// (web-app/src/lib/pricingConfigurator.ts): ALWAYS two decimals, comma
// decimal separator for az/ru, dot for en, "N AZN" suffix. Display only —
// checkout always reprices server-side.
import { fmtAmount, fmtMoney } from "@/features/parent/commerce";

describe("fmtAmount (web formatAzn numeric part)", () => {
  it("always renders exactly two decimals with the locale separator", () => {
    expect(fmtAmount(27, "az")).toBe("27,00");
    expect(fmtAmount(27, "ru")).toBe("27,00");
    expect(fmtAmount(27, "en")).toBe("27.00");
    expect(fmtAmount(8.5, "az")).toBe("8,50");
    expect(fmtAmount(8.5, "en")).toBe("8.50");
    expect(fmtAmount(2.999, "en")).toBe("3.00"); // toFixed rounding, web round2 parity
  });

  it("defaults to the az separator (web formatAzn default locale)", () => {
    expect(fmtAmount(27)).toBe("27,00");
  });

  it("coerces null/undefined/non-finite to 0 (existing mobile contract)", () => {
    expect(fmtAmount(null, "en")).toBe("0.00");
    expect(fmtAmount(undefined, "ru")).toBe("0,00");
    expect(fmtAmount(Number.NaN, "az")).toBe("0,00");
  });
});

describe("fmtMoney", () => {
  it("appends the currency with an AZN fallback", () => {
    expect(fmtMoney(27, "AZN", "az")).toBe("27,00 AZN");
    expect(fmtMoney(27, "AZN", "en")).toBe("27.00 AZN");
    expect(fmtMoney(27, null, "ru")).toBe("27,00 AZN");
    expect(fmtMoney(27, "", "en")).toBe("27.00 AZN");
  });

  it("keeps legacy two-argument calls compiling and az-formatted", () => {
    expect(fmtMoney(18, "AZN")).toBe("18,00 AZN");
    expect(fmtMoney(3.5)).toBe("3,50 AZN");
  });
});
