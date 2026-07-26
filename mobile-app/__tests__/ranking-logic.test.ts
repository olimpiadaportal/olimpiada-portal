// Round 51 audit — pure leaderboard display rules (web /child/leaderboard
// parity): the my-rank fallback message, the provisional legend visibility and
// the district picker's default clamp.
import {
  myRankFallbackKey,
  resolveDistrictId,
  showProvisionalLegend,
} from "@/features/ranking/logic";

describe("myRankFallbackKey (no rank, not provisional)", () => {
  it("says 'not in this filter' under a non-global percent scope", () => {
    expect(myRankFallbackKey("percent", "district")).toBe("lb.myRank.notInFilter");
    expect(myRankFallbackKey("percent", "subject")).toBe("lb.myRank.notInFilter");
    expect(myRankFallbackKey("percent", "school")).toBe("lb.myRank.notInFilter");
  });

  it("keeps the generic 'not ranked' on global and on the streak board", () => {
    expect(myRankFallbackKey("percent", "global")).toBe("lb.myRank.none");
    // Streak is global-only anyway — any scope stays generic.
    expect(myRankFallbackKey("streak", "global")).toBe("lb.myRank.none");
    expect(myRankFallbackKey("streak", "city")).toBe("lb.myRank.none");
  });
});

describe("showProvisionalLegend (web showProvHint parity)", () => {
  const prov = { is_provisional: true };
  const ranked = { is_provisional: false };

  it("shows for a provisional LISTED row", () => {
    expect(showProvisionalLegend("percent", [ranked, prov], ranked)).toBe(true);
  });

  it("shows for a provisional VIEWER even when the list is empty", () => {
    expect(showProvisionalLegend("percent", [], prov)).toBe(true);
  });

  it("hides when nothing provisional is visible", () => {
    expect(showProvisionalLegend("percent", [ranked], ranked)).toBe(false);
    expect(showProvisionalLegend("percent", [], ranked)).toBe(false);
  });

  it("never shows on the streak board or without a my-rank payload", () => {
    expect(showProvisionalLegend("streak", [prov], prov)).toBe(false);
    // No payload → no {n} threshold to substitute → hidden.
    expect(showProvisionalLegend("percent", [prov], null)).toBe(false);
  });
});

describe("resolveDistrictId (picker clamp: selection → own rayon → first)", () => {
  const districts = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("honors a valid explicit selection", () => {
    expect(resolveDistrictId(districts, "b", "c")).toBe("b");
  });

  it("defaults to the child's own rayon when nothing valid is selected", () => {
    expect(resolveDistrictId(districts, null, "c")).toBe("c");
    expect(resolveDistrictId(districts, "forged", "c")).toBe("c");
  });

  it("falls back to the first rayon when the own one is outside the city list", () => {
    expect(resolveDistrictId(districts, null, "zz")).toBe("a");
    expect(resolveDistrictId(districts, null, null)).toBe("a");
  });

  it("returns null only for an empty catalog (the tab is hidden then)", () => {
    expect(resolveDistrictId([], "a", "b")).toBeNull();
  });
});
