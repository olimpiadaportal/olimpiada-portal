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
import { getMyFreeTrial } from "@/lib/freeTrial";
import {
  TAUGHT_SUBJECTS_RPC,
  keepTaughtSubjects,
  taughtSubjectSet,
} from "@/lib/gradeSubjects";

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

/**
 * The subjects this grade studies, as a lookup set — or `null` when the rule
 * cannot be applied (no grade, or the read failed) and the caller must leave
 * its list alone.
 *
 * ONE RULE, IN THE DATABASE (migration 155). Every child- and parent-facing
 * subject list on the web goes through this, and the mobile apps call the same
 * RPC. The previous hand-written version lived in two files, ran only during a
 * free window, ignored topic status, and dropped a subject whose topic was
 * SHARED across grades — see lib/gradeSubjects.ts.
 */
export async function fetchTaughtSubjectIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gradeId: string | null,
): Promise<ReadonlySet<string> | null> {
  if (!gradeId) return null;
  const { data, error } = await supabase.rpc(TAUGHT_SUBJECTS_RPC, { p_grade: gradeId });
  return taughtSubjectSet(data, error);
}

export type ChildSubjectAccess = {
  /** giveaway OR free-access interval currently active */
  freeNow: boolean;
  /** students.access_status (raw; 'inactive' fallback) */
  access: string;
  /** trialing/active subscription OR freeNow OR trialNow */
  hasAccess: boolean;
  /** subjects the child can take tests in right now */
  subjects: ChildSubject[];
  /**
   * Migration 139-141: a live 1-day Free Trial covers this child. Kept SEPARATE
   * from `freeNow` because it is subject-scoped, where the giveaway and the
   * admin free-access window are all-or-nothing.
   */
  trialNow: boolean;
  /** The trial's expiry, for the countdown. Null when there is no live trial. */
  trialEndsAt: string | null;
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
        .select("access_status, grade_id")
        .eq("profile_id", childProfileId)
        .maybeSingle(),
      supabase
        .from("child_subscriptions")
        .select(CHILD_COVERAGE_SELECT)
        .eq("student_profile_id", childProfileId)
        .in("status", ["trialing", "active"]),
    ]);
  const freeNow = giveawayActive || freeAccessActive;

  // MIGRATION 139-141 -- the 1-day Free Trial.
  //
  // Deliberately NOT folded into `freeNow`: the giveaway and the admin
  // free-access window are ALL-OR-NOTHING and merge every actively priced
  // subject, while a trial covers exactly the one or two subjects the parent
  // chose. Treating it as another "free window" would hand the child the whole
  // catalogue for a day.
  const trial = await getMyFreeTrial();
  const trialNow = trial.active;

  const access = (student as any)?.access_status ?? "inactive";
  const hasAccess =
    access === "trialing" || access === "active" || freeNow || trialNow;

  const subjMap = new Map<string, { code: string | null; name: string }>();
  for (const s of liveCoveredSubjects(subs as any[])) {
    subjMap.set(s.id, { code: s.code, name: s.name });
  }
  // Free window: every ACTIVE SUBJECT is available.
  //
  // This used to read `subjects_pricing` and take whatever subjects happened to
  // hang off a priced row, which quietly made PRICING the source of truth for
  // what a child can open. It is not, and the two disagree: has_subject_access()
  // returns true for EVERY subject while is_giveaway_active(), so a subject an
  // admin had created but not yet priced was fully accessible in the database
  // and simply absent from the child's screen. Three of the seven live subjects
  // were in exactly that state.
  //
  // `subjects` is the admin's list and is publicly readable (policy
  // subjects_select is USING (true)), so reading it here needs no privilege and
  // matches what the database will actually allow. Archived subjects are
  // excluded — status is the admin's own switch for that.
  if (freeNow) {
    const { data: all } = await supabase
      .from("subjects")
      .select("id, code, name")
      .eq("status", "active");
    for (const row of (all ?? []) as any[]) {
      subjMap.set(String(row.id), {
        code: row.code ?? null,
        name: String(row.name),
      });
    }
  }
  // The trial merges EXACTLY its own subjects. The attempt RPCs re-check access
  // per subject anyway, so an over-generous list here would only produce a
  // refusal the child cannot explain.
  if (trialNow) {
    for (const ts of trial.subjects) {
      subjMap.set(ts.id, { code: ts.code || null, name: ts.name });
    }
  }

  // SCOPED TO THE CHILD'S GRADE, OUTSIDE EVERY BRANCH ABOVE. Fizika exists only
  // for grades 7-11, so a grade-3 child was being offered a subject with no
  // curriculum at all behind it. The rule is honoured by DATA (migration 155)
  // rather than a hardcoded grade floor, so it needs no maintenance when a
  // subject's range changes.
  //
  // THE PLACEMENT IS THE FIX. The first version of this ran inside the
  // `if (freeNow)` branch, which meant a child on a real subscription or a trial
  // was never grade-filtered at all — the only children who reached it were the
  // ones paying nothing. A subject bought for the wrong grade is exactly the
  // case that must be hidden: it can only ever open an empty test.
  const taught = await fetchTaughtSubjectIds(supabase, (student as any)?.grade_id ?? null);
  const subjects = keepTaughtSubjects(
    Array.from(subjMap, ([id, v]) => ({ id, code: v.code, name: v.name })),
    taught,
  );

  return { freeNow, access, hasAccess, subjects, trialNow, trialEndsAt: trial.endsAt };
}
