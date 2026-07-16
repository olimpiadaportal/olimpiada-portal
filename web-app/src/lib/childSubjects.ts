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
        .select("status, subscription_subjects(subjects(id, code, name))")
        .eq("student_profile_id", childProfileId)
        .in("status", ["trialing", "active"]),
    ]);
  const freeNow = giveawayActive || freeAccessActive;

  const access = (student as any)?.access_status ?? "inactive";
  const hasAccess = access === "trialing" || access === "active" || freeNow;

  const subjMap = new Map<string, { code: string | null; name: string }>();
  for (const s of (subs ?? []) as any[]) {
    for (const ss of s.subscription_subjects ?? []) {
      if (ss.subjects) {
        subjMap.set(ss.subjects.id, {
          code: ss.subjects.code ?? null,
          name: ss.subjects.name,
        });
      }
    }
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
