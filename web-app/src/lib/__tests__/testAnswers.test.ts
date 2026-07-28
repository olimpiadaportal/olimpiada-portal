// Regression tests for the test-engine answer payload rules.
//
// These lock in the owner bug fixed on 2026-07-27: the payload used to be
// truncated to 30 items on both sides (client `.slice(0, 30)` + a server action
// that rejected anything longer), so every answer past the 30th on a large
// olympiad attempt was dropped before it reached Postgres and graded as
// unanswered.
import { describe, expect, it } from "vitest";
import { MAX_ANSWERS, RPC_ANSWER_CHUNK, chunkAnswers, sanitizeAnswers } from "@/lib/testAnswers";
import type { AnswerItem } from "@/lib/testAnswers";

const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-1111-4222-8333-444444444444`;

function payload(n: number): AnswerItem[] {
  return Array.from({ length: n }, (_, i) => ({
    question_id: uuid(i + 1),
    selected_option_ids: [uuid(10_000 + i)],
    is_marked: false,
  }));
}

describe("answer payload caps", () => {
  it("allows a full Round-51 olympiad draw (questions_per_attempt up to 500)", () => {
    expect(MAX_ANSWERS).toBe(500);
    const clean = sanitizeAnswers(payload(500));
    expect(clean).not.toBeNull();
    expect(clean).toHaveLength(500);
  });

  it("keeps every answer of a 50-question olympiad — the shipped package size", () => {
    const clean = sanitizeAnswers(payload(50));
    expect(clean).toHaveLength(50);
    // The 31st..50th answers used to be silently dropped.
    expect(clean?.[49]?.question_id).toBe(uuid(50));
  });

  it("rejects an over-cap payload instead of silently truncating it", () => {
    expect(sanitizeAnswers(payload(MAX_ANSWERS + 1))).toBeNull();
  });
});

describe("sanitizeAnswers validation", () => {
  it("rejects non-arrays and non-object items", () => {
    expect(sanitizeAnswers(null)).toBeNull();
    expect(sanitizeAnswers("[]")).toBeNull();
    expect(sanitizeAnswers([null])).toBeNull();
  });

  it("rejects a non-UUID question id or option id", () => {
    expect(sanitizeAnswers([{ question_id: "42", selected_option_ids: [] }])).toBeNull();
    expect(sanitizeAnswers([{ question_id: uuid(1), selected_option_ids: ["x"] }])).toBeNull();
  });

  it("rejects an option list longer than the per-question cap", () => {
    const sel = Array.from({ length: 9 }, (_, i) => uuid(100 + i));
    expect(sanitizeAnswers([{ question_id: uuid(1), selected_option_ids: sel }])).toBeNull();
  });

  it("keeps an unanswered question as an empty selection", () => {
    const clean = sanitizeAnswers([{ question_id: uuid(1), selected_option_ids: [] }]);
    expect(clean).toEqual([{ question_id: uuid(1), selected_option_ids: [] }]);
  });

  it("clamps time_spent_ms to one day and drops non-finite values", () => {
    const clean = sanitizeAnswers([
      { question_id: uuid(1), selected_option_ids: [], time_spent_ms: 999_999_999 },
      { question_id: uuid(2), selected_option_ids: [], time_spent_ms: "nope" },
    ]);
    expect(clean?.[0]?.time_spent_ms).toBe(86_400_000);
    expect(clean?.[1]?.time_spent_ms).toBeUndefined();
  });
});

describe("chunkAnswers", () => {
  it("splits at the RPC limit and loses nothing", () => {
    const items = payload(250);
    const batches = chunkAnswers(items);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(items);
    expect(RPC_ANSWER_CHUNK).toBe(100);
  });

  it("returns a single batch for a normal 25-question round", () => {
    expect(chunkAnswers(payload(25))).toHaveLength(1);
  });

  it("returns no batches for an empty payload", () => {
    expect(chunkAnswers([])).toEqual([]);
  });

  it("never loops forever on a degenerate size", () => {
    expect(chunkAnswers(payload(3), 0).map((b) => b.length)).toEqual([1, 1, 1]);
  });
});
