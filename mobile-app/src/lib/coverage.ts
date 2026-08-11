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
