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
/** Payload cap mirrored from the web action / DB-side limit (037). */
export const MAX_ANSWERS = 30;
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
 */
export function deadlineFromRemaining(
  nowMs: number,
  remainingSeconds: number | null | undefined,
): number {
  const r = Math.max(0, Math.floor(remainingSeconds ?? 0));
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

export function countAnswered(questions: TestQuestion[], answers: AnswersMap): number {
  return questions.filter((q) => answers[q.question_id]).length;
}

/** Autosave/submit payload for the given question ids (web buildItems parity). */
export function buildAnswerItems(
  qids: string[],
  answers: AnswersMap,
  flags: Set<string>,
  spentMs: Map<string, number>,
): AnswerItem[] {
  return qids
    .map((qid) => {
      const sel = answers[qid];
      const item: AnswerItem = {
        question_id: qid,
        selected_option_ids: sel ? [sel] : [],
        is_marked: flags.has(qid),
      };
      const ms = spentMs.get(qid);
      if (ms && ms > 0) item.time_spent_ms = Math.min(Math.round(ms), 86_400_000);
      return item;
    })
    .slice(0, MAX_ANSWERS);
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

/** A resumable attempt: in_progress AND the server deadline is still ahead. */
export function isLiveAttempt(
  row: Pick<AttemptListRow, "status" | "deadline_at">,
  nowMs: number,
): boolean {
  return (
    row.status === "in_progress" &&
    !!row.deadline_at &&
    Date.parse(row.deadline_at) > nowMs
  );
}

export function findLiveAttempt<T extends Pick<AttemptListRow, "status" | "deadline_at">>(
  rows: T[],
  nowMs: number,
): T | null {
  return rows.find((r) => isLiveAttempt(r, nowMs)) ?? null;
}

/**
 * Display status for the history list (web parity): an in_progress row whose
 * deadline already passed renders as "expired" (lazy expiry).
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
 * Minutes actually used, clamped to [1, duration] (web result page parity).
 * Returns null when either timestamp is missing/invalid.
 */
export function usedMinutes(
  startedAt: string | null,
  endedAt: string | null,
  durationMin: number,
): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(Math.max(1, Math.round(ms / 60_000)), durationMin);
}
