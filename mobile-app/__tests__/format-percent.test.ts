import { formatPercent } from "@/lib/formatPercent";

describe("formatPercent (Round 36 display rule 17.10)", () => {
  it("always renders exactly two decimals — never an integer round", () => {
    expect(formatPercent(87.3456, "en")).toBe("87.35%");
    expect(formatPercent(87.3449, "en")).toBe("87.34%");
    expect(formatPercent(50, "en")).toBe("50.00%");
    expect(formatPercent(7.1, "en")).toBe("7.10%");
    // 99.995 must not become "100.00%"-adjacent nonsense like "100%".
    expect(formatPercent(99.99, "en")).toBe("99.99%");
  });

  it("uses the locale's decimal separator (az/ru = comma)", () => {
    expect(formatPercent(87.3456, "az")).toBe("87,35%");
    expect(formatPercent(87.3456, "ru")).toBe("87,35%");
    expect(formatPercent(87.3456, "en")).toBe("87.35%");
  });

  it("renders the 0 and 100 bounds cleanly in every locale", () => {
    expect(formatPercent(0, "en")).toBe("0.00%");
    expect(formatPercent(100, "en")).toBe("100.00%");
    expect(formatPercent(0, "az")).toBe("0,00%");
    expect(formatPercent(100, "az")).toBe("100,00%");
    expect(formatPercent(100, "ru")).toBe("100,00%");
  });

  it("never fabricates from a malformed value", () => {
    expect(formatPercent(Number.NaN, "en")).toBe("0.00%");
    expect(formatPercent(Number.POSITIVE_INFINITY, "en")).toBe("0.00%");
  });
});
