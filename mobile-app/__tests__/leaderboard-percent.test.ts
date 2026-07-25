import { parseLbRows, parseRankPayload } from "@/features/ranking/parse";
import { lbHasActivity } from "@/features/analytics/helpers";

describe("parseRankPayload (get_my_leaderboard_rank / get_child_leaderboard_position)", () => {
  it("maps a ranked payload", () => {
    const r = parseRankPayload({
      rank: 4,
      total: 120,
      value: 87.3456,
      is_provisional: false,
      questions: 250,
      attempts: 12,
      min_attempts: 3,
    });
    expect(r.rank).toBe(4);
    expect(r.total).toBe(120);
    expect(r.value).toBeCloseTo(87.3456, 4); // unrounded — the UI formats it
    expect(r.is_provisional).toBe(false);
  });

  it("provisional: rank stays null and the round threshold survives for the hint", () => {
    const r = parseRankPayload({
      rank: null,
      total: 120,
      value: 100,
      is_provisional: true,
      questions: 10,
      attempts: 1,
      min_attempts: 3,
    });
    expect(r.rank).toBeNull();
    expect(r.is_provisional).toBe(true);
    expect(r.questions).toBe(10);
    expect(r.attempts).toBe(1);
    expect(r.min_attempts).toBe(3);
  });

  it("malformed payload degrades to safe zeros, never throws", () => {
    for (const bad of [null, undefined, "x", 7, { rank: "1", value: "high" }]) {
      const r = parseRankPayload(bad);
      expect(r.rank).toBeNull();
      expect(r.total).toBe(0);
      expect(r.value).toBe(0);
      expect(r.is_provisional).toBe(false);
    }
  });
});

describe("parseLbRows (get_leaderboard)", () => {
  const payload = [
    { rank: 1, display_name: "Aysel M.", value: 92.5, is_self: false, is_provisional: false, questions: 200, correct: 185, attempts: 8 },
    { rank: 2, display_name: "Tural H.", value: 90.0, is_self: true, is_provisional: false, questions: 180, correct: 162, attempts: 7 },
    { rank: 2, display_name: "Nigar Q.", value: 90.0, is_self: false, is_provisional: false, questions: 150, correct: 135, attempts: 6 },
    { rank: null, display_name: "Elvin R.", value: 100, is_self: false, is_provisional: true, questions: 5, correct: 5, attempts: 1 },
  ];

  it("keeps the server order and competition ranks exactly as delivered", () => {
    const rows = parseLbRows(payload);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, null]);
    // A provisional 100% row never re-sorts above the official #1.
    expect(rows[0].display_name).toBe("Aysel M.");
    expect(rows[3].is_provisional).toBe(true);
  });

  it("provisional rows carry rank=null + flags, values stay unrounded", () => {
    const rows = parseLbRows([{ rank: null, display_name: "X", value: 66.6667, is_provisional: true }]);
    expect(rows[0].rank).toBeNull();
    expect(rows[0].is_provisional).toBe(true);
    expect(rows[0].value).toBeCloseTo(66.6667, 4);
    expect(rows[0].is_self).toBe(false);
  });

  it("non-array / junk rows degrade defensively", () => {
    expect(parseLbRows(null)).toEqual([]);
    expect(parseLbRows({})).toEqual([]);
    const rows = parseLbRows([null, { rank: "1", value: "?" }]);
    expect(rows).toHaveLength(2);
    expect(rows[0].rank).toBeNull();
    expect(rows[1].rank).toBeNull();
    expect(rows[1].value).toBe(0);
  });
});

describe("lbHasActivity (percent-era summary gate)", () => {
  it("keys off the new activity fields, not the deprecated points", () => {
    expect(lbHasActivity(null)).toBe(false);
    expect(lbHasActivity({})).toBe(false);
    expect(lbHasActivity({ attempts_all_time: 1 })).toBe(true);
    expect(lbHasActivity({ questions_all_time: 25 })).toBe(true);
    expect(lbHasActivity({ best_streak: 2 })).toBe(true);
    // A provisional child with activity still gets the panel (no rank yet).
    expect(
      lbHasActivity({ attempts_all_time: 2, provisional_all_time: true, rank_all_time: null }),
    ).toBe(true);
  });
});
