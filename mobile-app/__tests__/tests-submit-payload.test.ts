// Round 52 — the "Finish Test clears my answers and does nothing until I tap it
// a second time" report. Three separate defects fed it; these are the pure
// pieces of each fix:
//   1. the submit payload was sliced to the first 30 answers,
//   2. the autosave marked MORE ids clean than it actually sent, so anything
//      truncated (or changed mid-flight) was never retried and lost for good,
//   3. the player's selections lived only in component state, so any remount
//      re-seeded them from the pre-answer server payload.
import {
  MAX_ANSWERS,
  MAX_ATTEMPT_QUESTIONS,
  buildAnswerItems,
  chunkAnswerItems,
  hydrateAnswers,
  hydrateFlags,
  initialAnswers,
  initialFlags,
  settledQids,
  submitPlan,
  type AnswersMap,
} from "@/features/tests/logic";
import {
  MAX_DRAFTS,
  clearAllDrafts,
  clearDraft,
  draftCount,
  ensureDraft,
  peekDraft,
  type AttemptDraft,
} from "@/features/tests/draft";
import type { AnswerItem, TestQuestion } from "@/features/tests/types";

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

/** An attempt of `n` questions with every answer chosen — the submit payload. */
function fullPayload(n: number): AnswerItem[] {
  const qids = Array.from({ length: n }, (_, i) => `q${i}`);
  const answers: AnswersMap = {};
  for (const id of qids) answers[id] = `${id}-opt`;
  return buildAnswerItems(qids, answers, new Set(), new Map());
}

describe("Bug #1 — a submit carries EVERY answer of the attempt", () => {
  it("the batch size bounds one CALL, not the attempt", () => {
    // The old value (30) was below a real attempt size; the new one is the
    // per-call cap the server enforces, and the Round-51 ceiling is far above
    // it — which is exactly why the payload has to chunk rather than cap.
    expect(MAX_ANSWERS).toBe(100);
    expect(MAX_ATTEMPT_QUESTIONS).toBe(500);
    expect(MAX_ATTEMPT_QUESTIONS).toBeGreaterThan(MAX_ANSWERS);
  });

  it("a 50-question olympiad submits all 50 in ONE call", () => {
    const batches = chunkAnswerItems(fullPayload(50), MAX_ANSWERS);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(50);
    // The regression: answers 31..50 used to never leave the device.
    expect(batches[0][30].selected_option_ids).toEqual(["q30-opt"]);
    expect(batches[0][49].question_id).toBe("q49");
  });

  it("the Round-51 maximum (500 questions) goes out in full, in bounded calls", () => {
    const items = fullPayload(MAX_ATTEMPT_QUESTIONS);
    const batches = chunkAnswerItems(items, MAX_ANSWERS);
    expect(batches).toHaveLength(5);
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(MAX_ANSWERS);
    // Nothing dropped, nothing duplicated, original order preserved.
    const flat = batches.flat();
    expect(flat).toHaveLength(MAX_ATTEMPT_QUESTIONS);
    expect(new Set(flat.map((i) => i.question_id)).size).toBe(MAX_ATTEMPT_QUESTIONS);
    expect(flat.map((i) => i.question_id)).toEqual(items.map((i) => i.question_id));
  });

  it("chunks an exact multiple without emitting a trailing empty batch", () => {
    const batches = chunkAnswerItems(fullPayload(200), MAX_ANSWERS);
    expect(batches.map((b) => b.length)).toEqual([100, 100]);
  });

  it("leaves the remainder in a short final batch", () => {
    expect(chunkAnswerItems(fullPayload(101), MAX_ANSWERS).map((b) => b.length)).toEqual([
      100, 1,
    ]);
  });

  it("an empty payload yields NO batches (the caller decides on an empty ping)", () => {
    expect(chunkAnswerItems([], MAX_ANSWERS)).toEqual([]);
  });

  it("a degenerate size never divides by zero or loops forever", () => {
    expect(chunkAnswerItems(fullPayload(3), 0).map((b) => b.length)).toEqual([1, 1, 1]);
    expect(chunkAnswerItems(fullPayload(3), -5).map((b) => b.length)).toEqual([1, 1, 1]);
    expect(chunkAnswerItems(fullPayload(3), 2.7).map((b) => b.length)).toEqual([2, 1]);
  });

  it("still builds each item the way the server expects", () => {
    const [item] = chunkAnswerItems(
      buildAnswerItems(["q1"], { q1: "o1" }, new Set(["q1"]), new Map([["q1", 900]])),
    );
    expect(item).toEqual([
      { question_id: "q1", selected_option_ids: ["o1"], is_marked: true, time_spent_ms: 900 },
    ]);
  });
});

describe("Bug #2 — the dirty set only clears what was actually accepted", () => {
  const answers: AnswersMap = { q1: "o1", q2: null, q3: "o3" };
  const flags = new Set(["q2"]);
  const sent = buildAnswerItems(["q1", "q2", "q3"], answers, flags, new Map());

  it("marks clean exactly the ids in the accepted batch", () => {
    expect(settledQids(sent, answers, flags)).toEqual(["q1", "q2", "q3"]);
  });

  it("an id that never left the device stays dirty", () => {
    // What the old code did: send batch 1, then delete EVERY dirty id.
    const batches = chunkAnswerItems(sent, 2);
    const dirty = new Set(["q1", "q2", "q3"]);
    for (const id of settledQids(batches[0], answers, flags)) dirty.delete(id);
    expect(Array.from(dirty)).toEqual(["q3"]); // retried on the next autosave
    for (const id of settledQids(batches[1], answers, flags)) dirty.delete(id);
    expect(dirty.size).toBe(0);
  });

  it("a selection made WHILE the save was in flight stays dirty", () => {
    const changed: AnswersMap = { ...answers, q1: "o9" };
    expect(settledQids(sent, changed, flags)).toEqual(["q2", "q3"]);
  });

  it("a deselection made while in flight stays dirty", () => {
    const changed: AnswersMap = { ...answers, q3: null };
    expect(settledQids(sent, changed, flags)).toEqual(["q1", "q2"]);
  });

  it("an answer given to a question that was sent EMPTY stays dirty", () => {
    const changed: AnswersMap = { ...answers, q2: "o2" };
    expect(settledQids(sent, changed, flags)).toEqual(["q1", "q3"]);
  });

  it("a bookmark toggled while in flight stays dirty", () => {
    expect(settledQids(sent, answers, new Set(["q2", "q3"]))).toEqual(["q1", "q2"]);
    expect(settledQids(sent, answers, new Set())).toEqual(["q1", "q3"]);
  });

  it("treats a missing key and an explicit null as the same unanswered state", () => {
    const withoutQ2: AnswersMap = { q1: "o1", q3: "o3" };
    expect(settledQids(sent, withoutQ2, flags)).toEqual(["q1", "q2", "q3"]);
  });

  it("an empty accepted batch settles nothing (the resync ping)", () => {
    expect(settledQids([], answers, flags)).toEqual([]);
  });
});

describe("Bug #3 — a remount RESUMES the draft, it never resets to the payload", () => {
  // The payload the runner was opened with: nothing selected yet. Re-seeding
  // from this is what made every answer look "cleared".
  const questions = [q("q1"), q("q2"), q("q3", ["saved"], true)];

  it("with no draft, the server rows are the truth", () => {
    expect(hydrateAnswers(questions, null)).toEqual(initialAnswers(questions));
    expect(hydrateAnswers(questions, undefined)).toEqual({
      q1: null,
      q2: null,
      q3: "saved",
    });
    expect(Array.from(hydrateFlags(questions, null))).toEqual(["q3"]);
  });

  it("local selections win over the pre-answer payload", () => {
    const merged = hydrateAnswers(questions, { q1: "o1", q2: "o2", q3: "saved" });
    expect(merged).toEqual({ q1: "o1", q2: "o2", q3: "saved" });
  });

  it("an UNSAVED deselection is NOT undone by the stored row", () => {
    expect(hydrateAnswers(questions, { q3: null }, new Set(["q3"]))).toEqual({
      q1: null,
      q2: null,
      q3: null,
    });
  });

  it("a SETTLED draft never overrides a selection the payload actually carries", () => {
    // The same attempt continued elsewhere (web app): the server row is newer
    // than this process's memory, so it wins for everything not still dirty.
    const merged = hydrateAnswers(questions, { q3: "stale-local" }, new Set());
    expect(merged.q3).toBe("saved");
    // …and the still-dirty id keeps the local value in the very same merge.
    const mixed = hydrateAnswers(
      questions,
      { q1: "local-1", q3: "stale-local" },
      new Set(["q1"]),
    );
    expect(mixed).toEqual({ q1: "local-1", q2: null, q3: "saved" });
  });

  it("a settled draft still FILLS a question the payload has no answer for", () => {
    // The stale/pre-answer snapshot case a remount can land on: nothing is
    // ever lost just because the id was already saved.
    expect(hydrateAnswers(questions, { q1: "o1" }, new Set()).q1).toBe("o1");
  });

  it("ignores draft entries for questions outside this attempt", () => {
    const merged = hydrateAnswers(questions, { q1: "o1", ghost: "o9" });
    expect(merged).toEqual({ q1: "o1", q2: null, q3: "saved" });
    expect(Object.keys(merged)).toEqual(["q1", "q2", "q3"]);
  });

  it("an UNSAVED unflag is not re-flagged from the stored row", () => {
    expect(Array.from(hydrateFlags(questions, new Set(), new Set(["q3"])))).toEqual([]);
    // Settled: the stored bookmark stands.
    expect(Array.from(hydrateFlags(questions, new Set(), new Set()))).toEqual(["q3"]);
    expect(Array.from(hydrateFlags(questions, new Set(["q1", "q3"]))).sort()).toEqual([
      "q1",
      "q3",
    ]);
    expect(Array.from(hydrateFlags(questions, new Set(["ghost"])))).toEqual(["q3"]);
  });

  it("hydrate → mutate → hydrate again reproduces the remount and keeps the work", () => {
    // Mount 1: fresh draft from the payload, then the child answers two.
    const draft: AnswersMap = initialAnswers(questions);
    draft.q1 = "o1";
    draft.q2 = "o2";
    const dirty = new Set(["q1", "q2"]);
    // Mount 2 (submit bounce / refetch landing): SAME payload, same draft.
    expect(hydrateAnswers(questions, draft, dirty)).toEqual({
      q1: "o1",
      q2: "o2",
      q3: "saved",
    });
    // And once those two are saved, the merge is stable — the draft agrees
    // with the rows it produced, so nothing flips back.
    expect(hydrateAnswers(questions, draft, new Set())).toEqual({
      q1: "o1",
      q2: "o2",
      q3: "saved",
    });
  });
});

describe("the attempt draft store (memory-only, bounded)", () => {
  const questions = [q("q1"), q("q2")];
  const create = (): AttemptDraft => ({
    answers: initialAnswers(questions),
    flags: initialFlags(questions),
    dirty: new Set<string>(),
    spentMs: new Map<string, number>(),
  });

  beforeEach(() => clearAllDrafts());
  afterAll(() => clearAllDrafts());

  it("returns the SAME object on every later open of the attempt", () => {
    const first = ensureDraft("a1", create);
    first.answers.q1 = "o1";
    first.dirty.add("q1");
    const second = ensureDraft("a1", create);
    expect(second).toBe(first);
    expect(second.answers.q1).toBe("o1");
    expect(Array.from(second.dirty)).toEqual(["q1"]);
  });

  it("does not run the factory again for a known attempt", () => {
    const factory = jest.fn(create);
    ensureDraft("a1", factory);
    ensureDraft("a1", factory);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("keeps attempts isolated from each other", () => {
    ensureDraft("a1", create).answers.q1 = "o1";
    ensureDraft("a2", create);
    expect(peekDraft("a2")!.answers.q1).toBeNull();
    expect(peekDraft("a1")!.answers.q1).toBe("o1");
  });

  it("drops a settled attempt (submitted / canceled)", () => {
    ensureDraft("a1", create).answers.q1 = "o1";
    clearDraft("a1");
    expect(peekDraft("a1")).toBeNull();
    expect(ensureDraft("a1", create).answers.q1).toBeNull();
  });

  it("peek never creates", () => {
    expect(peekDraft("nope")).toBeNull();
    expect(draftCount()).toBe(0);
  });

  it("evicts the least-recently-opened draft past the bound", () => {
    for (let i = 0; i < MAX_DRAFTS; i += 1) ensureDraft(`a${i}`, create);
    expect(draftCount()).toBe(MAX_DRAFTS);
    // Touch a0 so a1 becomes the oldest, then open one more.
    ensureDraft("a0", create);
    ensureDraft("new", create);
    expect(draftCount()).toBe(MAX_DRAFTS);
    expect(peekDraft("a1")).toBeNull();
    expect(peekDraft("a0")).not.toBeNull();
    expect(peekDraft("new")).not.toBeNull();
  });

  it("NEVER evicts a draft that still holds unsaved answers", () => {
    // Every retained attempt is dirty → the bound yields rather than throw
    // away exactly the selections this store exists to protect.
    for (let i = 0; i < MAX_DRAFTS + 2; i += 1) {
      const d = ensureDraft(`dirty${i}`, create);
      d.answers.q1 = `o${i}`;
      d.dirty.add("q1");
    }
    expect(draftCount()).toBe(MAX_DRAFTS + 2);
    for (let i = 0; i < MAX_DRAFTS + 2; i += 1) {
      expect(peekDraft(`dirty${i}`)!.answers.q1).toBe(`o${i}`);
    }
  });

  it("evicts a CLEAN draft instead of a dirty older one", () => {
    const dirty = ensureDraft("dirty", create);
    dirty.dirty.add("q1");
    ensureDraft("clean1", create); // oldest clean
    ensureDraft("clean2", create);
    ensureDraft("clean3", create); // pushes past the bound
    expect(peekDraft("dirty")).not.toBeNull();
    expect(peekDraft("clean1")).toBeNull();
    expect(draftCount()).toBe(MAX_DRAFTS);
  });

  it("clearAllDrafts empties the store", () => {
    ensureDraft("a1", create);
    ensureDraft("a2", create);
    clearAllDrafts();
    expect(draftCount()).toBe(0);
  });
});

/**
 * Replays the runner's doSubmit wire sequence against a fake transport, so the
 * ORDER and the CONTENT of the calls are asserted, not just the chunking math.
 * `saveOk:false` models the server refusing a save (SQLSTATE 23514: deadline
 * passed / attempt closed) — which is the normal state of affairs on the 0:00
 * auto-submit path, because save has no grace period while submit has 60s.
 */
function replaySubmit(items: AnswerItem[], saveOk: boolean) {
  const saved: AnswerItem[][] = [];
  const { preSave, submit } = submitPlan(items, MAX_ANSWERS);
  for (const batch of preSave) {
    saved.push(batch);
    if (!saveOk) break;
  }
  return { saved, submitted: submit };
}

describe("end-to-end submit shape for the reported scenarios", () => {
  it("25-question practice test: ONE call carrying all 25 answers", () => {
    const { saved, submitted } = replaySubmit(fullPayload(25), true);
    expect(saved).toHaveLength(0); // no pre-save round-trip at all
    expect(submitted).toHaveLength(25);
  });

  it("50-question olympiad: still one call, answers 31..50 included", () => {
    const { saved, submitted } = replaySubmit(fullPayload(50), true);
    expect(saved).toHaveLength(0);
    expect(submitted.map((i) => i.question_id)).toContain("q49");
  });

  it("150-question olympiad: the submit carries EVERY question, not the tail", () => {
    const { saved, submitted } = replaySubmit(fullPayload(150), true);
    // Only the overflow is pre-saved; the merge covers the front by itself.
    expect(saved.map((b) => b.length)).toEqual([50]);
    expect(saved[0][0].question_id).toBe("q100");
    expect(submitted).toHaveLength(150);
    expect(submitted[0].question_id).toBe("q0");
  });

  it("REGRESSION: a refused pre-save still leaves questions 1..100 in the merge", () => {
    // The shipped bug: the loop broke here and then submitted ONLY the last
    // chunk, so q0..q99 were graded as unanswered without a word of warning.
    const { saved, submitted } = replaySubmit(fullPayload(150), false);
    expect(saved).toHaveLength(1); // stopped after the first refusal
    const ids = submitted.map((i) => i.question_id);
    for (let i = 0; i < 100; i += 1) expect(ids).toContain(`q${i}`);
    expect(ids).toHaveLength(150);
  });

  it("500-question olympiad: 4 overflow pre-saves + a full-payload submit", () => {
    const { saved, submitted } = replaySubmit(fullPayload(500), true);
    expect(saved.map((b) => b.length)).toEqual([100, 100, 100, 100]);
    expect(saved.flat()[0].question_id).toBe("q100"); // items 101..500
    expect(submitted).toHaveLength(500);
    expect(submitted.map((i) => i.question_id)).toEqual(
      Array.from({ length: 500 }, (_, i) => `q${i}`),
    );
  });
});
