// Round 51 audit — parent analytics mode/subject rules (web /analytics page
// parity): the subjects-vs-olympiads empty-state check and the subject
// selection clamp.
import { dashHasData, resolveSubjectSelection } from "@/features/analytics/helpers";

describe("dashHasData (honest empty state per mode)", () => {
  it("subjects mode keys off graded questions only", () => {
    expect(dashHasData({ totals: { questions: 5, attempts: 0 } }, "subjects")).toBe(true);
    expect(dashHasData({ totals: { questions: 0, attempts: 3 } }, "subjects")).toBe(false);
    expect(dashHasData({}, "subjects")).toBe(false);
    expect(dashHasData(null, "subjects")).toBe(false);
  });

  it("olympiads mode counts attempts OR questions as activity", () => {
    expect(dashHasData({ totals: { attempts: 1, questions: 0 } }, "olympiads")).toBe(true);
    expect(dashHasData({ totals: { attempts: 0, questions: 7 } }, "olympiads")).toBe(true);
    expect(dashHasData({ totals: { attempts: 0, questions: 0 } }, "olympiads")).toBe(false);
    expect(dashHasData(null, "olympiads")).toBe(false);
  });

  it("malformed totals degrade to zero, never NaN-truthy", () => {
    expect(
      dashHasData({ totals: { questions: "x" as unknown as number } }, "subjects"),
    ).toBe(false);
  });
});

describe("resolveSubjectSelection (web ?subject= clamp parity)", () => {
  it("empty universe → '' (locked panel, no RPC call)", () => {
    expect(resolveSubjectSelection([], "all")).toBe("");
    expect(resolveSubjectSelection([], "s1")).toBe("");
  });

  it("'all' is honored only with more than one subject", () => {
    expect(resolveSubjectSelection(["s1", "s2"], "all")).toBe("all");
    // Single-subject child: 'all' coerces to that subject so a tab is always
    // selected and the RPC never aggregates beyond the child's plan.
    expect(resolveSubjectSelection(["s1"], "all")).toBe("s1");
  });

  it("a valid subject id wins; a forged one falls back to the default", () => {
    expect(resolveSubjectSelection(["s1", "s2"], "s2")).toBe("s2");
    expect(resolveSubjectSelection(["s1", "s2"], "forged")).toBe("all");
    expect(resolveSubjectSelection(["s1"], "forged")).toBe("s1");
  });

  it("no request → single subject or 'all'", () => {
    expect(resolveSubjectSelection(["s1"], null)).toBe("s1");
    expect(resolveSubjectSelection(["s1", "s2"], null)).toBe("all");
  });
});
