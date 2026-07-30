// Round 52 (§9) — the term badge class must never fall through to an
// undefined CSS class: an unstyled badge would render as invisible text in the
// Rüb column, which is exactly the column the owner asked to make scannable.
import { describe, expect, it } from "vitest";
import { termClass } from "../termBadge";

describe("termClass", () => {
  it("maps each real term to its own colour class", () => {
    expect(termClass(1)).toBe("term-badge term-badge-1");
    expect(termClass(2)).toBe("term-badge term-badge-2");
    expect(termClass(3)).toBe("term-badge term-badge-3");
    expect(termClass(4)).toBe("term-badge term-badge-4");
  });

  it("falls back to the warning style for anything that is not 1..4", () => {
    for (const bad of [null, undefined, 0, 5, -1, 1.5, Number.NaN]) {
      expect(termClass(bad as number | null)).toBe("term-badge term-badge-none");
    }
  });
});
