// TEST ENGINE — shared answer-payload rules.
//
// Imported by BOTH the client player (`src/components/TestRunner.tsx`) and the
// server actions (`src/lib/auth/testActions.ts`) so the client-side cap and the
// server-side cap can never drift apart again.
//
// Owner bug (2026-07-27): the cap used to be the literal 30 in two independent
// places — the player sliced its payload with `.slice(0, 30)` and the server
// action rejected anything longer than 30 items. Every answer past the 30th was
// therefore dropped BEFORE it ever reached Postgres and graded as unanswered,
// which is what the child sees as "my answers were cleared". Olympiad packages
// already run 50 questions per attempt today, and Round 51 made
// `questions_per_attempt` a 1..500 admin field.
//
// The rule now: VALIDATE the payload size, never silently truncate it. A
// payload that is genuinely too large is rejected with a visible error; a
// payload that is merely larger than one RPC call can merge is CHUNKED.
import { isUuid } from "@/lib/uuid";

/**
 * Hard ceiling for one answers payload — the Round-51 maximum for an olympiad
 * package's `questions_per_attempt`. Daily rounds draw 25 and topic tests draw
 * at most 25, so this only ever binds on very large olympiad packages.
 *
 * Input validation only: `sanitizeAnswers` REJECTS an over-cap payload (the
 * child sees an error and can retry) instead of quietly dropping answers.
 */
export const MAX_ANSWERS = 500;

/**
 * How many items ONE `save_test_answers` call carries.
 *
 * `public.save_test_answers` and `public.submit_test_attempt` both stop merging
 * after a fixed number of array elements (`exit when v_n > 100;  -- payload cap`
 * in `supabase/sql/011_indexes_constraints_functions_triggers.sql`; migration
 * 093 raises that to 1000). Staying at the LOWER of the two is deliberate:
 * chunking is correct against either server version, so the app can ship ahead
 * of or behind the migration without ever silently dropping an answer.
 *
 * The submit itself always sends the FULL payload in one call and lets the
 * server apply its own bound from the FRONT of the array; only the overflow —
 * everything past the first chunk, which that bound might not reach — is
 * pre-saved. Because `submit_test_attempt` grades FROM THE STORED ROWS (never
 * from the client array), those pre-saved answers count in full.
 */
export const RPC_ANSWER_CHUNK = 100;

export type AnswerItem = {
  question_id: string;
  selected_option_ids: string[];
  is_marked?: boolean;
  time_spent_ms?: number;
};

/**
 * Split an answers payload into RPC-sized batches. Returns `[]` for an empty
 * payload; the union of the batches is always the full input (nothing is ever
 * dropped).
 */
export function chunkAnswers(items: AnswerItem[], size: number = RPC_ANSWER_CHUNK): AnswerItem[][] {
  const step = Math.max(1, Math.floor(size));
  const out: AnswerItem[][] = [];
  for (let i = 0; i < items.length; i += step) out.push(items.slice(i, i + step));
  return out;
}

/**
 * Validate + normalize a client answers array. `null` = invalid input (the
 * caller returns a generic trilingual error; raw internals never reach the
 * client).
 *
 * Server-side validation, not UX: every id is UUID-shaped, the option list per
 * question is capped, and `time_spent_ms` is clamped to a finite day.
 */
export function sanitizeAnswers(raw: unknown): AnswerItem[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ANSWERS) return null;
  const out: AnswerItem[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const it = item as Record<string, unknown>;
    const qid = String(it.question_id ?? "");
    if (!isUuid(qid)) return null;
    const selRaw = it.selected_option_ids;
    if (!Array.isArray(selRaw) || selRaw.length > 8) return null;
    const sel: string[] = [];
    for (const o of selRaw) {
      if (typeof o !== "string" || !isUuid(o)) return null;
      sel.push(o);
    }
    const a: AnswerItem = { question_id: qid, selected_option_ids: sel };
    if (typeof it.is_marked === "boolean") a.is_marked = it.is_marked;
    const ts = Number(it.time_spent_ms);
    if (Number.isFinite(ts) && ts >= 0) a.time_spent_ms = Math.min(Math.round(ts), 86_400_000);
    out.push(a);
  }
  return out;
}
