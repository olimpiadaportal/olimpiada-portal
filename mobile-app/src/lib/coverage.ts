// Which subjects a child can actually START something in right now — the exact
// twin of web-app/src/lib/childSubjects.ts (CHILD_COVERAGE_SELECT +
// liveCoveredSubjects), kept here because the two apps share no runtime.
//
// Migration 109 gave every subject its OWN period, and made
// child_subscriptions.current_period_end the MAX across them ("coverage ends").
// So a subscription stays live on the strength of a yearly subject while a
// weekly one has already lapsed. Filtering only on the subscription status —
// which every child-facing list used to do — kept that lapsed subject on screen,
// and the attempt RPCs then refused it with their per-subject gate
// (`coalesce(ss.current_period_end, cs.current_period_end) > now()`). Same
// predicate here, so the app never offers a tile the engine will reject.
import type { ArenaSubject } from "@/features/arena/queries";

/** The columns the predicate needs. Both period ends: the subject's own, and
 *  the subscription's as the inheritance fallback for a pre-109 row. */
export const CHILD_COVERAGE_SELECT =
  "status, current_period_end, subscription_subjects(remove_at, current_period_end, subjects(id, code, name))";

/** Pure and `now`-injectable so the rule is testable without a database. */
export function liveCoveredSubjects(
  rows: readonly any[] | null | undefined,
  now: number = Date.now(),
): ArenaSubject[] {
  const map = new Map<string, ArenaSubject>();
  for (const sub of rows ?? []) {
    for (const ss of sub?.subscription_subjects ?? []) {
      if (!ss?.subjects) continue;
      // remove_at first: a scheduled removal is the earlier of the two dates,
      // and once it passes the subject is gone even if the row's own period end
      // was never rewritten.
      const endsAt = ss.remove_at ?? ss.current_period_end ?? sub?.current_period_end ?? null;
      if (endsAt && new Date(endsAt).getTime() <= now) continue;
      map.set(ss.subjects.id, {
        id: ss.subjects.id,
        code: ss.subjects.code ?? null,
        name: ss.subjects.name,
      });
    }
  }
  return [...map.values()];
}

// The OTHER half of "which subjects may this child open right now": the ids
// my_accessible_subjects() answers with. It lives beside liveCoveredSubjects
// for the same two reasons — it is pure, and BOTH child-side readers have to
// agree on it.

/**
 * Subject ids out of a `my_accessible_subjects()` payload, whatever shape
 * PostgREST chose for it.
 *
 * The RPC `returns setof uuid` (011), which arrives today as a bare array of
 * uuid STRINGS. The two callers used to decode that SEPARATELY and only one of
 * them also handled the row-OBJECT form — a disagreement waiting for an
 * encoding change to happen: `returns table(...)` is one edit away, and it
 * wraps every row in an object. On that day the arena gate would have read "no
 * accessible subjects" and locked a paying child out, while the Tests tab of
 * the SAME session went on listing their subjects. One parse, one answer, both
 * screens — and the safer of the two parses is the one kept.
 *
 * Rows are FILTERED, never cast: an unexpected row is dropped rather than
 * trusted, so a malformed payload can never count as access. The callers keep
 * their own failure handling — an RPC that ERRORED must fall back to [] (which
 * locks), and that is their decision to make, not this function's.
 */
export function parseAccessibleSubjectIds(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const row of data as unknown[]) {
    const id =
      typeof row === "string"
        ? row
        : row && typeof row === "object"
          ? String(Object.values(row as Record<string, unknown>)[0] ?? "")
          : "";
    if (id !== "") ids.push(id);
  }
  return ids;
}
