import {
  buildAnswerItems,
  classifyAnswer,
  countAnswered,
  dailyCardState,
  deadlineFromRemaining,
  displayStatus,
  findLiveAttempt,
  fmtClock,
  initialAnswers,
  initialFlags,
  isGiveawayNow,
  isLiveAttempt,
  isTodayBaku,
  isUuid,
  paletteCellState,
  remainingFrom,
  resultBreakdown,
  reviewCounts,
  setupSelectionValid,
  timerLevel,
  usedMinutes,
} from "@/features/tests/logic";
import type { AttemptListRow, TestQuestion } from "@/features/tests/types";

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

  // Round 52: the builder used to `.slice(0, 30)`, so a 50-question olympiad
  // submitted 30 answers and graded the rest as unanswered. Bounding the wire
  // payload is chunkAnswerItems' job now — see tests-submit-payload.test.ts.
  it("NEVER truncates: every id handed in comes back as an item", () => {
    const many = Array.from({ length: 40 }, (_, i) => `q${i}`);
    const items = buildAnswerItems(many, {}, new Set(), new Map());
    expect(items).toHaveLength(40);
    expect(items[39].question_id).toBe("q39");
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

describe("daily card state (Round 42 — untimed rounds; only GRADED consumes the day)", () => {
  const future = new Date(NOW + 60_000).toISOString();
  const past = new Date(NOW - 60_000).toISOString();
  // Baku-local midnight (fixed UTC+4, no DST) around NOW — boundary-exact.
  const bakuDayStartUtc =
    Math.floor((NOW + 4 * 3_600_000) / 86_400_000) * 86_400_000 - 4 * 3_600_000;
  const todayEarly = new Date(bakuDayStartUtc + 60_000).toISOString();
  const yesterdayBaku = new Date(bakuDayStartUtc - 60_000).toISOString();

  function row(over: Partial<AttemptListRow> & { id: string }): AttemptListRow {
    return {
      kind: "daily",
      is_rated: true,
      status: "graded",
      score: 20,
      max_score: 25,
      started_at: todayEarly,
      submitted_at: null,
      deadline_at: null,
      subject_id: "s1",
      subject_code: null,
      subject_name: null,
      ...over,
    };
  }

  it("detects the Baku-local day (fixed UTC+4)", () => {
    expect(isTodayBaku(todayEarly, NOW)).toBe(true);
    expect(isTodayBaku(yesterdayBaku, NOW)).toBe(false);
    expect(isTodayBaku(null, NOW)).toBe(false);
    expect(isTodayBaku("garbage", NOW)).toBe(false);
  });

  it("a graded rated daily attempt today → done with the rounded score", () => {
    expect(dailyCardState("s1", [row({ id: "a", score: 19.6 })], NOW)).toEqual({
      type: "done",
      result: { id: "a", score: 20, max: 25 },
    });
  });

  it("ANY in_progress attempt today resumes — but graded wins over it", () => {
    // Round 42: rounds are UNTIMED, so new attempts carry a NULL deadline
    // and must resume (Continue) until submitted.
    const live = row({
      id: "b",
      status: "in_progress",
      deadline_at: null,
      score: null,
      max_score: null,
    });
    expect(dailyCardState("s1", [live], NOW)).toEqual({ type: "live", attemptId: "b" });
    expect(dailyCardState("s1", [live, row({ id: "a" })], NOW).type).toBe("done");
    // Legacy timed rows (pre-42 deadlines, future OR past) still resume —
    // the deadline is irrelevant now (web `status === "in_progress"` parity).
    expect(
      dailyCardState("s1", [row({ id: "b2", status: "in_progress", deadline_at: future })], NOW),
    ).toEqual({ type: "live", attemptId: "b2" });
    expect(
      dailyCardState("s1", [row({ id: "b3", status: "in_progress", deadline_at: past })], NOW),
    ).toEqual({ type: "live", attemptId: "b3" });
  });

  it("expired/abandoned/canceled attempts NEVER lock the card (fresh Start)", () => {
    expect(dailyCardState("s1", [row({ id: "d", status: "expired" })], NOW)).toEqual({
      type: "ready",
    });
    expect(dailyCardState("s1", [row({ id: "e", status: "canceled" })], NOW)).toEqual({
      type: "ready",
    });
    expect(dailyCardState("s1", [row({ id: "e2", status: "abandoned" })], NOW)).toEqual({
      type: "ready",
    });
  });

  it("ignores other subjects, unrated/practice rows and yesterday's rounds", () => {
    expect(dailyCardState("s1", [row({ id: "g", subject_id: "s2" })], NOW)).toEqual({
      type: "ready",
    });
    expect(dailyCardState("s1", [row({ id: "h", kind: "test" })], NOW)).toEqual({
      type: "ready",
    });
    expect(dailyCardState("s1", [row({ id: "i", is_rated: false })], NOW)).toEqual({
      type: "ready",
    });
    expect(dailyCardState("s1", [row({ id: "j", started_at: yesterdayBaku })], NOW)).toEqual({
      type: "ready",
    });
  });

  it("rows arrive newest-first: the first graded row wins", () => {
    const s = dailyCardState("s1", [row({ id: "new" }), row({ id: "old" })], NOW);
    expect(s.type).toBe("done");
    if (s.type === "done") expect(s.result.id).toBe("new");
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

  it("UNTIMED attempts (null duration, Round 42) never clamp — no invented 25-minute limit", () => {
    const start = new Date(NOW).toISOString();
    // Raw elapsed minutes pass through unclamped …
    expect(usedMinutes(start, new Date(NOW + 90 * 60_000).toISOString(), null)).toBe(90);
    expect(usedMinutes(start, new Date(NOW + 12 * 60_000).toISOString(), null)).toBe(12);
    // … the 1-minute floor still applies …
    expect(usedMinutes(start, new Date(NOW + 1_000).toISOString(), null)).toBe(1);
    // … and bad timestamps still yield null.
    expect(usedMinutes(null, start, null)).toBeNull();
    expect(usedMinutes(new Date(NOW + 1000).toISOString(), start, null)).toBeNull();
  });
});
