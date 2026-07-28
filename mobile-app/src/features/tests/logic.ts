// TEST ENGINE (M3) — PURE helpers (no React/RN imports; unit-tested in
// __tests__/tests-logic.test.ts). Ports the web TestRunner/TestReviewList math:
// server-authoritative countdown, palette states, answered/SKIPPED (≠ wrong)
// classification, autosave payload building.
import type {
  AnswerItem,
  AttemptListRow,
  BreakdownRow,
  ReviewQuestion,
  TestQuestion,
} from "./types";

export const AUTOSAVE_MS = 30_000;
/**
 * Items carried by ONE save/submit RPC call.
 *
 * This is a TRANSPORT batch size, NOT a limit on how many answers a submit may
 * carry: a payload bigger than this is CHUNKED across calls (chunkAnswerItems)
 * and never truncated. The old value (30) silently dropped everything past the
 * 30th question, so a 50-question olympiad submitted 30 answers and graded the
 * other 20 as unanswered — the "my answers were cleared" half of the Round-52
 * bug report.
 *
 * 100 was the per-call cap the server's `save_test_answers` /
 * `submit_test_attempt` loops enforced before migration 093 raised it to 1000.
 * Keeping the client at the LOWER of the two is deliberate: chunking is correct
 * against either server version, so the app can ship ahead of (or behind) the
 * migration without ever silently dropping an answer.
 */
export const MAX_ANSWERS = 100;
/**
 * Largest attempt the platform can create (Round 51 `questions_per_attempt`
 * ceiling). Documentation + test anchor only — the client never truncates to
 * it; the question list always comes from the server's own attempt payload.
 */
export const MAX_ATTEMPT_QUESTIONS = 500;
/** Option letters (web parity; ≤8 options rendered). */
export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ---- countdown (server deadline is the truth) ----------------------------------

/** "MM:SS" clock (web fmtClock parity; minutes can exceed 99 harmlessly). */
export function fmtClock(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type TimerLevel = "normal" | "warn" | "crit";

/** Web parity: warn ≤ 300s, critical ≤ 60s. */
export function timerLevel(remaining: number | null): TimerLevel {
  if (remaining === null) return "normal";
  if (remaining <= 60) return "crit";
  if (remaining <= 300) return "warn";
  return "normal";
}

/**
 * Local deadline anchor from a server `remaining_seconds` snapshot. Computing
 * remaining from an ANCHOR (not by decrementing state) keeps the clock honest
 * across JS-timer throttling and app background/foreground; the anchor itself
 * is re-derived from every save/get response, so device-clock skew never
 * accumulates (web deadlineRef parity).
 *
 * Round-20 contract (migration 057): a NULL server remaining means UNTIMED
 * (practice — no deadline exists), so the anchor is null and `remainingFrom`
 * keeps yielding null: no countdown, no resync target, and the 0:00
 * auto-submit can never fire. A numeric remaining ≤ 0 stays "already expired"
 * (a TIMED attempt past its deadline).
 */
export function deadlineFromRemaining(
  nowMs: number,
  remainingSeconds: number | null | undefined,
): number | null {
  if (remainingSeconds === null || remainingSeconds === undefined) return null;
  const r = Math.max(0, Math.floor(remainingSeconds));
  return nowMs + r * 1000;
}

/** Seconds left against the local anchor (never negative; ceil like the web). */
export function remainingFrom(deadlineMs: number | null, nowMs: number): number | null {
  if (deadlineMs === null) return null;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

// ---- answered / skipped / wrong (skipped is NEVER wrong) -------------------------

export type ReviewState = "correct" | "wrong" | "skipped";

/**
 * Post-grading classification (web review page parity): no selection = SKIPPED
 * regardless of the stored is_correct=false the grader writes for empty rows;
 * only an ANSWERED incorrect question counts as wrong.
 */
export function classifyAnswer(
  selectedCount: number,
  isCorrect: boolean | null | undefined,
): ReviewState {
  if (selectedCount === 0) return "skipped";
  return isCorrect === true ? "correct" : "wrong";
}

export function classifyReviewQuestion(q: ReviewQuestion): ReviewState {
  return classifyAnswer((q.selected_option_ids ?? []).length, q.is_correct);
}

export type ReviewCounts = {
  all: number;
  correct: number;
  wrong: number;
  skipped: number;
};

export function reviewCounts(states: ReviewState[]): ReviewCounts {
  const c: ReviewCounts = { all: states.length, correct: 0, wrong: 0, skipped: 0 };
  for (const s of states) c[s] += 1;
  return c;
}

/** Result-screen breakdown from own answer rows (correct/wrong/skipped). */
export function resultBreakdown(rows: BreakdownRow[]): ReviewCounts {
  return reviewCounts(
    rows.map((r) => classifyAnswer((r.selected_option_ids ?? []).length, r.is_correct)),
  );
}

// ---- runner state helpers ----------------------------------------------------------

export type AnswersMap = Record<string, string | null>;

export function initialAnswers(questions: TestQuestion[]): AnswersMap {
  const init: AnswersMap = {};
  for (const q of questions) init[q.question_id] = q.selected_option_ids[0] ?? null;
  return init;
}

export function initialFlags(questions: TestQuestion[]): Set<string> {
  return new Set(questions.filter((q) => q.is_marked).map((q) => q.question_id));
}

/**
 * Server payload + the in-memory DRAFT (draft.ts) for the same attempt.
 *
 * The server rows are the BASE. The draft is layered on top under two narrow
 * rules, so a remount resumes the child's work without the memory-only copy
 * becoming a permanent shadow of the attempt:
 *
 *  - a still-DIRTY id (changed locally, not yet accepted by the server) always
 *    wins — including a deliberate deselection, which must not be undone by
 *    the stored row it has not overwritten yet;
 *  - a SETTLED draft value only fills a hole: it is used when the payload
 *    carries no selection for that question, which is exactly the stale/
 *    pre-answer snapshot case a remount can hit. A payload that DOES carry a
 *    selection is newer (the same attempt continued in the web app, or our own
 *    saves read back) and wins.
 *
 * Draft entries for questions outside this payload are ignored — the payload
 * defines the attempt.
 */
export function hydrateAnswers(
  questions: TestQuestion[],
  draft: AnswersMap | null | undefined,
  dirty?: ReadonlySet<string> | null,
): AnswersMap {
  const merged = initialAnswers(questions);
  if (!draft) return merged;
  for (const q of questions) {
    const id = q.question_id;
    if (!Object.prototype.hasOwnProperty.call(draft, id)) continue;
    const local = draft[id] ?? null;
    if (dirty?.has(id) || (merged[id] ?? null) === null) merged[id] = local;
  }
  return merged;
}

/**
 * Bookmark flags, same two rules as hydrateAnswers: an unsaved local toggle
 * wins outright, and a settled local bookmark is never LOST to the payload
 * (flags are additive, so filling in can only ever restore one).
 */
export function hydrateFlags(
  questions: TestQuestion[],
  draft: ReadonlySet<string> | null | undefined,
  dirty?: ReadonlySet<string> | null,
): Set<string> {
  const merged = initialFlags(questions);
  if (!draft) return merged;
  for (const q of questions) {
    const id = q.question_id;
    if (draft.has(id)) merged.add(id);
    else if (dirty?.has(id)) merged.delete(id);
  }
  return merged;
}

export function countAnswered(questions: TestQuestion[], answers: AnswersMap): number {
  return questions.filter((q) => answers[q.question_id]).length;
}

/**
 * Autosave/submit payload for the given question ids.
 *
 * NEVER truncates: every id handed in comes back as an item. Bounding the wire
 * payload is chunkAnswerItems' job, and it chunks instead of dropping — a
 * builder that silently returned a prefix is what made a 50-question olympiad
 * submit only its first 30 answers.
 */
export function buildAnswerItems(
  qids: string[],
  answers: AnswersMap,
  flags: ReadonlySet<string>,
  spentMs: ReadonlyMap<string, number>,
): AnswerItem[] {
  return qids.map((qid) => {
    const sel = answers[qid];
    const item: AnswerItem = {
      question_id: qid,
      selected_option_ids: sel ? [sel] : [],
      is_marked: flags.has(qid),
    };
    const ms = spentMs.get(qid);
    if (ms && ms > 0) item.time_spent_ms = Math.min(Math.round(ms), 86_400_000);
    return item;
  });
}

/**
 * Split a payload into wire-sized batches (MAX_ANSWERS items each) so a large
 * attempt is delivered in full across several bounded calls. An empty payload
 * yields NO batches — the caller decides whether an empty ping is meaningful
 * (the autosave resync sends one; a submit does not).
 */
export function chunkAnswerItems(
  items: AnswerItem[],
  size: number = MAX_ANSWERS,
): AnswerItem[][] {
  const step = Math.max(1, Math.floor(size));
  const out: AnswerItem[][] = [];
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}

/**
 * The wire plan for a SUBMIT.
 *
 * `submit` is ALWAYS the complete payload. `submit_test_attempt` walks the
 * array from the FRONT under its own bound (100 before migration 093, 1000
 * after) and then grades from the STORED rows, so the one thing the client must
 * never do is hand it a tail slice — that is how a 150-question olympiad graded
 * questions 1..100 as unanswered while faithfully submitting 101..150.
 *
 * `preSave` is only what that bound might not reach: every chunk AFTER the
 * first. Persisting those through `save_test_answers` makes them count even
 * when the submit merge stops early. For a normal ≤MAX_ANSWERS attempt (every
 * daily round, every topic test, most olympiads) it is empty and the submit is
 * a single round-trip.
 */
export function submitPlan(
  items: AnswerItem[],
  size: number = MAX_ANSWERS,
): { preSave: AnswerItem[][]; submit: AnswerItem[] } {
  return { preSave: chunkAnswerItems(items, size).slice(1), submit: items };
}

/**
 * Which question ids may leave the dirty set after the server ACCEPTED `sent`.
 *
 * Two rules, both bug fixes:
 *  - only ids that were actually in the accepted payload (a batch that never
 *    left the device must stay dirty and be retried — marking clean more than
 *    was sent lost those answers permanently);
 *  - only ids whose local value still matches what was sent, so a selection
 *    made WHILE the request was in flight stays dirty and is saved next round.
 */
export function settledQids(
  sent: AnswerItem[],
  answers: AnswersMap,
  flags: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const item of sent) {
    const sentSelection = item.selected_option_ids[0] ?? null;
    if (sentSelection !== (answers[item.question_id] ?? null)) continue;
    if ((item.is_marked === true) !== flags.has(item.question_id)) continue;
    out.push(item.question_id);
  }
  return out;
}

export type PaletteCellState = {
  current: boolean;
  answered: boolean;
  flagged: boolean;
};

export function paletteCellState(
  q: TestQuestion,
  index: number,
  currentIndex: number,
  answers: AnswersMap,
  flags: Set<string>,
): PaletteCellState {
  return {
    current: index === currentIndex,
    answered: Boolean(answers[q.question_id]),
    flagged: flags.has(q.question_id),
  };
}

// ---- tests home helpers ---------------------------------------------------------------

// Asia/Baku is UTC+4 year-round (no DST) — web /child/test parity for the
// "started inside today's Baku day" detection.
const BAKU_OFFSET_MS = 4 * 3_600_000;
const DAY_MS = 86_400_000;

export function isTodayBaku(iso: string | null, nowMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return (
    Math.floor((t + BAKU_OFFSET_MS) / DAY_MS) === Math.floor((nowMs + BAKU_OFFSET_MS) / DAY_MS)
  );
}

/** Today's-round subject-card state (done > live > ready). */
export type DailyCardState =
  | { type: "done"; result: { id: string; score: number; max: number } }
  | { type: "live"; attemptId: string }
  | { type: "ready" };

/**
 * Round 42 (web gradedBySubject/liveBySubject parity): ONLY a GRADED own
 * rated daily attempt started inside today's Baku day consumes the card;
 * rounds are now UNTIMED (the server no longer sets a deadline), so ANY
 * in_progress attempt resumes (Continue) until it is submitted — but never
 * when a graded one exists; anything else (expired/abandoned/canceled)
 * leaves the Start button available and the next start serves a FRESH set.
 * Rows arrive newest-first, so the first match per bucket wins.
 */
export function dailyCardState(
  subjectId: string,
  rows: AttemptListRow[],
  nowMs: number,
): DailyCardState {
  let graded: AttemptListRow | null = null;
  let live: AttemptListRow | null = null;
  for (const r of rows) {
    if (r.kind !== "daily" || !r.is_rated || r.subject_id !== subjectId) continue;
    if (!isTodayBaku(r.started_at, nowMs)) continue;
    if (r.status === "graded") {
      if (!graded) graded = r;
    } else if (r.status === "in_progress") {
      if (!live) live = r;
    }
  }
  if (graded) {
    return {
      type: "done",
      result: {
        id: graded.id,
        score: Math.round(Number(graded.score ?? 0)),
        max: Math.round(Number(graded.max_score ?? 0)),
      },
    };
  }
  if (live) return { type: "live", attemptId: live.id };
  return { type: "ready" };
}

/**
 * A resumable attempt: in_progress AND either UNTIMED (null deadline —
 * Round-20 practice never expires) or the server deadline is still ahead.
 */
export function isLiveAttempt(
  row: Pick<AttemptListRow, "status" | "deadline_at">,
  nowMs: number,
): boolean {
  if (row.status !== "in_progress") return false;
  if (row.deadline_at === null) return true; // untimed practice
  return Date.parse(row.deadline_at) > nowMs;
}

export function findLiveAttempt<T extends Pick<AttemptListRow, "status" | "deadline_at">>(
  rows: T[],
  nowMs: number,
): T | null {
  return rows.find((r) => isLiveAttempt(r, nowMs)) ?? null;
}

/**
 * Display status for the history list (web parity): a TIMED in_progress row
 * whose deadline already passed renders as "expired" (lazy expiry). Untimed
 * practice (null deadline) stays "in_progress" — it never expires.
 */
export function displayStatus(
  row: Pick<AttemptListRow, "status" | "deadline_at">,
  nowMs: number,
): string {
  if (row.status === "in_progress" && !isLiveAttempt(row, nowMs)) return "expired";
  return row.status;
}

/**
 * Client-side lazy expiry of the server-resolved giveaway mode (the config
 * snapshot can be up to 5 min stale — web isGiveawayActive re-checks the
 * window on every call).
 */
export function isGiveawayNow(
  mode: string | undefined,
  endsAt: string | null | undefined,
  nowMs: number,
): boolean {
  if (mode !== "giveaway") return false;
  if (!endsAt) return true;
  const t = Date.parse(endsAt);
  return !Number.isFinite(t) || nowMs < t;
}

// ---- setup validation (Round-19 contract) -----------------------------------------------

/**
 * Topic is ALWAYS required; subtopic is required unless the chosen topic has
 * zero subtopics (web TestSetup parity). Client-side UX only — the RPC
 * re-enforces the rule server-side.
 */
export function setupSelectionValid(
  topicId: string,
  hasSubtopics: boolean,
  subtopicId: string,
): boolean {
  return topicId !== "" && (!hasSubtopics || subtopicId !== "");
}

// ---- result time context ---------------------------------------------------------------

/**
 * Minutes actually used (web result page parity): floored to 1, clamped to the
 * attempt duration when one EXISTS. UNTIMED attempts (duration_seconds null —
 * daily rounds/practice since Round 42) pass durationMin=null and get the raw
 * elapsed minutes, never a fabricated limit. Returns null when either
 * timestamp is missing/invalid.
 */
export function usedMinutes(
  startedAt: string | null,
  endedAt: string | null,
  durationMin: number | null,
): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const raw = Math.max(1, Math.round(ms / 60_000));
  return durationMin !== null ? Math.min(raw, durationMin) : raw;
}
