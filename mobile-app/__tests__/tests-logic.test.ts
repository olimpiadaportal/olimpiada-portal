import {
  buildAnswerItems,
  classifyAnswer,
  countAnswered,
  deadlineFromRemaining,
  displayStatus,
  findLiveAttempt,
  fmtClock,
  initialAnswers,
  initialFlags,
  isGiveawayNow,
  isLiveAttempt,
  isUuid,
  paletteCellState,
  remainingFrom,
  resultBreakdown,
  reviewCounts,
  setupSelectionValid,
  timerLevel,
  usedMinutes,
} from "@/features/tests/logic";
import type { TestQuestion } from "@/features/tests/types";

const NOW = 1_760_000_000_000;

function q(id: string, selected: string[] = [], marked = false): TestQuestion {
  return {
    question_id: id,
    type: "multiple_choice",
    topic_id: null,
    body: "b",
    prompt: null,
    selected_option_ids: selected,
    is_marked: marked,
    options: [],
  };
}

describe("countdown math (server deadline is the truth)", () => {
  it("formats MM:SS and clamps negatives", () => {
    expect(fmtClock(0)).toBe("00:00");
    expect(fmtClock(-5)).toBe("00:00");
    expect(fmtClock(61)).toBe("01:01");
    expect(fmtClock(1500)).toBe("25:00");
  });

  it("web parity thresholds: warn ≤300s, crit ≤60s", () => {
    expect(timerLevel(null)).toBe("normal");
    expect(timerLevel(301)).toBe("normal");
    expect(timerLevel(300)).toBe("warn");
    expect(timerLevel(61)).toBe("warn");
    expect(timerLevel(60)).toBe("crit");
    expect(timerLevel(0)).toBe("crit");
  });

  it("anchors the deadline from a server remaining snapshot and recomputes", () => {
    const deadline = deadlineFromRemaining(NOW, 90);
    expect(deadline).toBe(NOW + 90_000);
    expect(remainingFrom(deadline, NOW)).toBe(90);
    expect(remainingFrom(deadline, NOW + 89_500)).toBe(1); // ceil
    expect(remainingFrom(deadline, NOW + 200_000)).toBe(0); // never negative
    expect(remainingFrom(null, NOW)).toBeNull();
  });

  it("treats a negative/zero server remaining as already expired (TIMED)", () => {
    expect(remainingFrom(deadlineFromRemaining(NOW, -10), NOW)).toBe(0);
    expect(remainingFrom(deadlineFromRemaining(NOW, 0), NOW)).toBe(0);
  });

  // Round-20 practice contract (migration 057): null remaining = UNTIMED.
  it("null server remaining = UNTIMED: no anchor, no countdown ticks", () => {
    expect(deadlineFromRemaining(NOW, null)).toBeNull();
    expect(deadlineFromRemaining(NOW, undefined)).toBeNull();
    // remaining stays null across ticks — the runner's 0:00 auto-submit
    // condition (remaining === 0) can therefore never become true.
    const anchor = deadlineFromRemaining(NOW, null);
    expect(remainingFrom(anchor, NOW)).toBeNull();
    expect(remainingFrom(anchor, NOW + 500)).toBeNull(); // first tick
    expect(remainingFrom(anchor, NOW + 3_600_000)).toBeNull(); // an hour in
  });

  it("untimed remaining renders the normal (no-pulse) timer state", () => {
    const anchor = deadlineFromRemaining(NOW, null);
    expect(timerLevel(remainingFrom(anchor, NOW + 60_000))).toBe("normal");
  });
});

describe("answered / skipped classification (skipped is NEVER wrong)", () => {
  it("classifies selections", () => {
    expect(classifyAnswer(0, false)).toBe("skipped"); // grader stores false for empty rows
    expect(classifyAnswer(0, null)).toBe("skipped");
    expect(classifyAnswer(1, true)).toBe("correct");
    expect(classifyAnswer(1, false)).toBe("wrong");
    expect(classifyAnswer(1, null)).toBe("wrong");
  });

  it("counts review states", () => {
    expect(reviewCounts(["correct", "wrong", "skipped", "correct"])).toEqual({
      all: 4,
      correct: 2,
      wrong: 1,
      skipped: 1,
    });
  });

  it("builds the result breakdown from own answer rows", () => {
    const counts = resultBreakdown([
      { selected_option_ids: ["a"], is_correct: true },
      { selected_option_ids: ["b"], is_correct: false },
      { selected_option_ids: [], is_correct: false }, // skipped, not wrong
      { selected_option_ids: null, is_correct: null },
    ]);
    expect(counts).toEqual({ all: 4, correct: 1, wrong: 1, skipped: 2 });
  });
});

describe("runner state helpers", () => {
  const questions = [q("q1", ["o1"]), q("q2", [], true), q("q3")];

  it("rehydrates answers + flags from the saved rows (TRUE resume)", () => {
    const answers = initialAnswers(questions);
    expect(answers).toEqual({ q1: "o1", q2: null, q3: null });
    expect(Array.from(initialFlags(questions))).toEqual(["q2"]);
    expect(countAnswered(questions, answers)).toBe(1);
  });

  it("builds the save payload (selection array, flag, capped time)", () => {
    const items = buildAnswerItems(
      ["q1", "q2"],
      { q1: "o1", q2: null },
      new Set(["q2"]),
      new Map([
        ["q1", 1234.6],
        ["q2", 999_999_999],
      ]),
    );
    expect(items).toEqual([
      { question_id: "q1", selected_option_ids: ["o1"], is_marked: false, time_spent_ms: 1235 },
      { question_id: "q2", selected_option_ids: [], is_marked: true, time_spent_ms: 86_400_000 },
    ]);
  });

  it("caps the payload at 30 items (web/DB cap)", () => {
    const many = Array.from({ length: 40 }, (_, i) => `q${i}`);
    const items = buildAnswerItems(many, {}, new Set(), new Map());
    expect(items).toHaveLength(30);
  });

  it("computes palette cell states", () => {
    const answers = { q1: "o1", q2: null, q3: null };
    const flags = new Set(["q2"]);
    expect(paletteCellState(questions[0], 0, 0, answers, flags)).toEqual({
      current: true,
      answered: true,
      flagged: false,
    });
    expect(paletteCellState(questions[1], 1, 0, answers, flags)).toEqual({
      current: false,
      answered: false,
      flagged: true,
    });
  });
});

describe("tests home helpers", () => {
  const future = new Date(NOW + 60_000).toISOString();
  const past = new Date(NOW - 60_000).toISOString();

  it("finds the live (continuable) attempt", () => {
    const rows: { id: string; status: string; deadline_at: string | null }[] = [
      { id: "a", status: "graded", deadline_at: past },
      { id: "b", status: "in_progress", deadline_at: future },
      { id: "c", status: "in_progress", deadline_at: past },
    ];
    expect(findLiveAttempt(rows, NOW)?.id).toBe("b");
  });

  it("lazily expires a stale TIMED in_progress row for display", () => {
    expect(displayStatus({ status: "in_progress", deadline_at: past }, NOW)).toBe("expired");
    expect(displayStatus({ status: "in_progress", deadline_at: future }, NOW)).toBe(
      "in_progress",
    );
    expect(displayStatus({ status: "canceled", deadline_at: null }, NOW)).toBe("canceled");
  });

  // Round-20: untimed practice (null deadline) never expires — it stays
  // live/resumable (continue card + result-guard bounce back to the player).
  it("untimed practice stays live and never lazily expires", () => {
    expect(isLiveAttempt({ status: "in_progress", deadline_at: null }, NOW)).toBe(true);
    expect(displayStatus({ status: "in_progress", deadline_at: null }, NOW)).toBe(
      "in_progress",
    );
    expect(isLiveAttempt({ status: "graded", deadline_at: null }, NOW)).toBe(false);
    expect(
      findLiveAttempt(
        [
          { id: "a", status: "graded", deadline_at: null },
          { id: "b", status: "in_progress", deadline_at: null },
        ],
        NOW,
      )?.id,
    ).toBe("b");
  });

  it("re-checks the giveaway window client-side (stale config safety)", () => {
    expect(isGiveawayNow("giveaway", future, NOW)).toBe(true);
    expect(isGiveawayNow("giveaway", past, NOW)).toBe(false);
    expect(isGiveawayNow("giveaway", null, NOW)).toBe(true); // server said active
    expect(isGiveawayNow("demo", future, NOW)).toBe(false);
    expect(isGiveawayNow(undefined, null, NOW)).toBe(false);
  });
});

describe("setup validation (Round-19 contract)", () => {
  it("topic mandatory; subtopic mandatory only when the topic has subtopics", () => {
    expect(setupSelectionValid("", false, "")).toBe(false);
    expect(setupSelectionValid("t", true, "")).toBe(false);
    expect(setupSelectionValid("t", true, "s")).toBe(true);
    expect(setupSelectionValid("t", false, "")).toBe(true); // waived: zero subtopics
  });
});

describe("misc", () => {
  it("uuid guard", () => {
    expect(isUuid("6f1f39d2-6f38-4a4e-9d6d-1b6a1a1c2e3f")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it("used minutes clamps to [1, duration] and rejects bad input", () => {
    const start = new Date(NOW).toISOString();
    expect(usedMinutes(start, new Date(NOW + 12 * 60_000).toISOString(), 25)).toBe(12);
    expect(usedMinutes(start, new Date(NOW + 1_000).toISOString(), 25)).toBe(1);
    expect(usedMinutes(start, new Date(NOW + 90 * 60_000).toISOString(), 25)).toBe(25);
    expect(usedMinutes(null, start, 25)).toBeNull();
    expect(usedMinutes(start, null, 25)).toBeNull();
    expect(usedMinutes(new Date(NOW + 1000).toISOString(), start, 25)).toBeNull();
  });
});
