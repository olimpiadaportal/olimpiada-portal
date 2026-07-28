// TEST ENGINE — the in-memory ANSWER DRAFT for a running attempt.
//
// Why this exists (Round 52 bug report: "the answers are cleared and I have to
// tap Finish twice"): the player's selections used to live only in
// <RunnerActive>'s useState, seeded from the attempt payload the runner was
// OPENED with. Any remount of that component — a redirect bounce, a query
// entry being evicted and refetched, a re-render of the parent's loading gate —
// re-ran the initializer against that pre-answer payload and every selection
// vanished, with nothing submitted. Keeping the draft OUTSIDE the component
// makes a remount a resume instead of a reset: state is destroyed, the draft is
// not, and hydrateAnswers/hydrateFlags (logic.ts) merge it back over the server
// rows.
//
// MEMORY ONLY, by design and per the master plan's offline policy (§11):
// attempt data is never persisted to disk, so a cold start always re-reads the
// server (and up to one autosave interval of selections is lost if the OS kills
// a backgrounded process — the autosave, not this map, is the durability
// story). The map is bounded (MAX_DRAFTS, least-recently-opened CLEAN draft
// evicted — one with unsaved work is never dropped) and a draft is released the
// moment its attempt is submitted or canceled, so nothing accumulates across a
// session.
import type { AnswersMap } from "./logic";

export type AttemptDraft = {
  /** question_id → selected option id (null = deliberately unanswered). */
  answers: AnswersMap;
  /** Bookmarked question ids. */
  flags: Set<string>;
  /** Question ids changed since the last ACCEPTED save (autosave batch). */
  dirty: Set<string>;
  /** question_id → accumulated ms on screen. */
  spentMs: Map<string, number>;
};

/**
 * SOFT bound on retained drafts. Only CLEAN drafts count towards trimming, so
 * the store can legitimately exceed this while several attempts hold unsaved
 * work (a daily round per subject plus an olympiad is a real combination).
 */
export const MAX_DRAFTS = 3;

const drafts = new Map<string, AttemptDraft>();

/**
 * The live draft for `attemptId`, created via `create()` on first open. The
 * SAME object is returned for every later mount of the same attempt, which is
 * what lets a remount resume instead of reset.
 */
export function ensureDraft(attemptId: string, create: () => AttemptDraft): AttemptDraft {
  const existing = drafts.get(attemptId);
  if (existing) {
    // Re-insert so Map iteration order stays least-recently-opened first.
    drafts.delete(attemptId);
    drafts.set(attemptId, existing);
    return existing;
  }
  const fresh = create();
  drafts.set(attemptId, fresh);
  evictOldestClean(attemptId);
  return fresh;
}

/**
 * Trim to MAX_DRAFTS, oldest first — but NEVER drop a draft that still has
 * unsaved work, and never the one just opened (`keepId`, which is always clean
 * at that moment and belongs to the runner about to mount). Evicting a dirty
 * draft would silently discard exactly the selections this module exists to
 * protect: its component stays mounted, writing into an object the map would
 * never hand back. A child holding more than MAX_DRAFTS attempts with unsaved
 * work simply keeps them all — the map stores uuid pairs, and that cost is
 * nothing against losing an answer.
 */
function evictOldestClean(keepId: string): void {
  if (drafts.size <= MAX_DRAFTS) return;
  for (const [id, draft] of drafts) {
    if (id === keepId || draft.dirty.size > 0) continue;
    drafts.delete(id);
    if (drafts.size <= MAX_DRAFTS) return;
  }
}

/** Read without creating (tests/diagnostics). */
export function peekDraft(attemptId: string): AttemptDraft | null {
  return drafts.get(attemptId) ?? null;
}

/** Drop a settled attempt's draft (submitted / canceled). */
export function clearDraft(attemptId: string): void {
  drafts.delete(attemptId);
}

/** Drop everything (sign-out / tests). */
export function clearAllDrafts(): void {
  drafts.clear();
}

/** Retained draft count — bounded by MAX_DRAFTS. */
export function draftCount(): number {
  return drafts.size;
}
