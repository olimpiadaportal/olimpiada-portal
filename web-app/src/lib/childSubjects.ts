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

export type ChildSubject = { id: string; name: string };

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
        .select("status, subscription_subjects(subjects(id, name))")
        .eq("student_profile_id", childProfileId)
        .in("status", ["trialing", "active"]),
    ]);
  const freeNow = giveawayActive || freeAccessActive;

  const access = (student as any)?.access_status ?? "inactive";
  const hasAccess = access === "trialing" || access === "active" || freeNow;

  const subjMap = new Map<string, string>();
  for (const s of (subs ?? []) as any[]) {
    for (const ss of s.subscription_subjects ?? []) {
      if (ss.subjects) subjMap.set(ss.subjects.id, ss.subjects.name);
    }
  }
  // Free window: every subject with ACTIVE pricing is available (active
  // subjects_pricing rows are publicly readable — pricing-page policy).
  if (freeNow) {
    const { data: priced } = await supabase
      .from("subjects_pricing")
      .select("subjects(id, name)")
      .eq("status", "active");
    for (const row of (priced ?? []) as any[]) {
      if (row.subjects) subjMap.set(row.subjects.id, row.subjects.name);
    }
  }
  const subjects = Array.from(subjMap, ([id, name]) => ({ id, name }));

  return { freeNow, access, hasAccess, subjects };
}
