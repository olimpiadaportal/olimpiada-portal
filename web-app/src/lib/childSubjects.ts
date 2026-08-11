// Child subject-access resolution shared by the TEST ENGINE pages (T1/T2).
// EXACT mirror of the subject-merge logic on the child dashboard
// (src/app/child/page.tsx): the child's covered subjects come from live
// trialing/active subscriptions, and during a giveaway window or an active
// per-parent/child free-access interval EVERY subject with active pricing is
// merged in on top. The DB RPC (start_topic_test_attempt) re-checks access
// server-side — this helper only drives what the UI offers.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isGiveawayActive } from "@/lib/paymentMode";
import { getChildFreeAccessActive } from "@/lib/freeAccess";

// `code` drives the locale-aware display label (subj.<code> via subjectLabel);
// `name` stays the raw DB fallback. Ids remain the stored/submitted values.
export type ChildSubject = { id: string; code: string | null; name: string };

/**
 * The columns every child-facing subject list must read. `current_period_end`
 * on BOTH levels is not redundant: since migration 109 the SUBSCRIPTION's value
 * is the MAX across subjects ("coverage ends"), so it stays in the future while
 * an individual weekly subject has already lapsed — and a legacy row whose own
 * period is still NULL inherits it.
 */
export const CHILD_COVERAGE_SELECT =
  "status, current_period_end, subscription_subjects(remove_at, current_period_end, subjects(id, code, name))";

/**
 * Subjects the child can actually START something in right now.
 *
 * Filtering on `child_subscriptions.status` alone lists a subject whose own
 * cycle has ended — the yearly subject keeps the subscription alive, the lapsed
 * weekly one stays on screen, and the attempt RPCs then reject it with
 * `coalesce(ss.current_period_end, cs.current_period_end) > now()`. Same
 * predicate here, so the UI never offers something the engine will refuse.
 *
 * Pure and `now`-injectable so the rule is unit-testable without a database.
 */
export function liveCoveredSubjects(
  rows: readonly any[] | null | undefined,
  now: number = Date.now(),
): ChildSubject[] {
  const map = new Map<string, ChildSubject>();
  for (const sub of rows ?? []) {
    for (const ss of sub?.subscription_subjects ?? []) {
      if (!ss?.subjects) continue;
      // remove_at first: a scheduled removal is the earlier of the two dates,
      // and once it passes the subject is gone even if the row's period end was
      // never rewritten.
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

export type ChildSubjectAccess = {
  /** giveaway OR free-access interval currently active */
  freeNow: boolean;
  /** students.access_status (raw; 'inactive' fallback) */
  access: string;
  /** trialing/active subscription OR freeNow */
  hasAccess: boolean;
  /** subjects the child can take tests in right now */
  subjects: ChildSubject[];
};

export async function getChildSubjectAccess(
  childProfileId: string,
): Promise<ChildSubjectAccess> {
  const supabase = await createClient();

  const [giveawayActive, freeAccessActive, { data: student }, { data: subs }] =
    await Promise.all([
      isGiveawayActive(),
      getChildFreeAccessActive(),
      supabase
        .from("students")
        .select("access_status")
        .eq("profile_id", childProfileId)
        .maybeSingle(),
      supabase
        .from("child_subscriptions")
        .select(CHILD_COVERAGE_SELECT)
        .eq("student_profile_id", childProfileId)
        .in("status", ["trialing", "active"]),
    ]);
  const freeNow = giveawayActive || freeAccessActive;

  const access = (student as any)?.access_status ?? "inactive";
  const hasAccess = access === "trialing" || access === "active" || freeNow;

  const subjMap = new Map<string, { code: string | null; name: string }>();
  for (const s of liveCoveredSubjects(subs as any[])) {
    subjMap.set(s.id, { code: s.code, name: s.name });
  }
  // Free window: every subject with ACTIVE pricing is available (active
  // subjects_pricing rows are publicly readable — pricing-page policy).
  if (freeNow) {
    const { data: priced } = await supabase
      .from("subjects_pricing")
      .select("subjects(id, code, name)")
      .eq("status", "active");
    for (const row of (priced ?? []) as any[]) {
      if (row.subjects) {
        subjMap.set(row.subjects.id, {
          code: row.subjects.code ?? null,
          name: row.subjects.name,
        });
      }
    }
  }
  const subjects = Array.from(subjMap, ([id, v]) => ({ id, code: v.code, name: v.name }));

  return { freeNow, access, hasAccess, subjects };
}
