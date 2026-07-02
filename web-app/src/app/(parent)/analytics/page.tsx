import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";

// Parent analytics: high-level metric cards computed from the parent's OWN children.
// RLS scopes every read to this parent's children, so no extra filtering is required
// beyond the created_by_parent_profile_id lookup for the child set. All DB reads are
// wrapped in try/catch and every metric degrades to 0 so the page always renders.
export default async function ParentAnalytics() {
  const parent = await requireParent();
  const t = await getT();
  const supabase = await createClient();

  let totalChildren = 0;
  let activeSubs = 0;
  let attempts = 0;
  let avgScore = 0;

  try {
    const { data: children } = await supabase
      .from("students")
      .select("profile_id")
      .eq("created_by_parent_profile_id", parent.profileId);
    const childIds = ((children ?? []) as any[]).map((c) => c.profile_id);
    totalChildren = childIds.length;

    if (childIds.length > 0) {
      // Children with a live (active/trialing) subscription.
      try {
        const { data: subs } = await supabase
          .from("child_subscriptions")
          .select("student_profile_id, status")
          .in("student_profile_id", childIds)
          .in("status", ["trialing", "active"]);
        const activeChildren = new Set(
          ((subs ?? []) as any[]).map((s) => s.student_profile_id),
        );
        activeSubs = activeChildren.size;
      } catch {
        activeSubs = 0;
      }

      // Graded attempts + average score across all of the parent's children.
      try {
        const { data: results } = await supabase
          .from("test_attempts")
          .select("score, max_score")
          .in("student_profile_id", childIds)
          .eq("status", "graded");
        const rows = (results ?? []) as any[];
        attempts = rows.length;
        if (rows.length > 0) {
          let sumPct = 0;
          let counted = 0;
          for (const r of rows) {
            const max = Number(r.max_score);
            const score = Number(r.score);
            if (max > 0 && Number.isFinite(score)) {
              sumPct += (score / max) * 100;
              counted += 1;
            }
          }
          avgScore = counted > 0 ? Math.round(sumPct / counted) : 0;
        }
      } catch {
        attempts = 0;
        avgScore = 0;
      }
    }
  } catch {
    // Leave all metrics at their graceful zero defaults.
  }

  const metrics: { label: string; value: string }[] = [
    { label: t("analytics.totalChildren"), value: String(totalChildren) },
    { label: t("analytics.activeSubs"), value: String(activeSubs) },
    { label: t("analytics.attempts"), value: String(attempts) },
    {
      label: t("analytics.avgScore"),
      value: attempts > 0 ? `${avgScore}%` : t("analytics.none"),
    },
  ];

  return (
    <section className="prose">
      <h1>{t("analytics.title")}</h1>
      <p className="muted">{t("analytics.subtitle")}</p>

      <div className="analytics-grid">
        {metrics.map((m) => (
          <div className="metric-card" key={m.label}>
            <span className="metric-num">{m.value}</span>
            <span className="metric-label">{m.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
