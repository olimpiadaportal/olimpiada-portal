import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import {
  AnalyticsDashboard,
  type AnalyticsChild,
  type DashPayload,
} from "@/components/AnalyticsDashboard";

// R9 (T6) — Parent analytics: the single place parents see statistics AND
// detailed per-child progress. Top: 4 metric cards computed from REAL data
// (RLS scopes reads to this parent's children). Below: the per-child dashboard,
// now driven by REAL aggregates from the get_child_subject_dashboard RPC
// (replaces the Round-8 owner-approved demo data). Selection (child + subject)
// lives in the URL (?child=<profileId>&subject=<subjectId|all>) so the server
// component resolves it, calls the RPC ONCE and passes the payload down; the
// client component only navigates.

const ANA_KEYS = [
  "ana.childLabel", "ana.subjectLabel",
  "ana.subject.all",
  "ana.subject.math", "ana.subject.science", "ana.subject.logic", "ana.subject.english",
  "ana.locked", "ana.noActive", "ana.goSubscribe",
  "ana.kpi.last7", "ana.kpi.tests", "ana.kpi.correct", "ana.kpi.wrong",
  "ana.kpi.time", "ana.kpi.best", "ana.kpi.weak", "ana.kpi.last",
  "ana.chart.weekly", "ana.chart.weeklySub", "ana.chart.trend", "ana.chart.trendSub30",
  "ana.chart.topics", "ana.chart.mistakes",
  "ana.th.topic", "ana.th.subtopic", "ana.th.questions", "ana.th.accuracy", "ana.th.mistakes",
  "ana.day.mon", "ana.day.tue", "ana.day.wed", "ana.day.thu",
  "ana.day.fri", "ana.day.sat", "ana.day.sun",
  "ana.unit.h", "ana.unit.m",
  "ana.rangeNote",
  "ana.empty.title", "ana.empty.sub", "ana.empty.trend", "ana.empty.mistakes",
];

// Canonical tab order for the 4 platform subjects.
const SUBJECT_ORDER = ["math", "science", "logic", "english"];

// Map a DB subject row to one of the 4 platform subject slugs (tolerant to
// admin-edited names; unmapped subjects simply don't light a tab).
function subjectSlug(code?: string | null, name?: string | null): string | null {
  const c = (code ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  if (c === "math" || n.includes("riyaz")) return "math";
  if (c === "science" || n.includes("elm") || n.includes("təbiət")) return "science";
  if (c === "logic" || c === "mentiq" || n.includes("məntiq") || n.includes("mentiq")) return "logic";
  if (c === "english" || n.includes("ngilis")) return "english";
  return null;
}

function firstParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ParentAnalytics({
  searchParams,
}: {
  searchParams: Promise<{ child?: string | string[]; subject?: string | string[] }>;
}) {
  const parent = await requireParent();
  const t = await getT();
  const supabase = await createClient();
  const sp = await searchParams;

  let totalChildren = 0;
  let activeSubs = 0;
  let attempts = 0;
  let avgScore = 0;
  let kids: AnalyticsChild[] = [];

  try {
    const { data: children } = await supabase
      .from("students")
      .select("profile_id, first_name, last_name")
      .eq("created_by_parent_profile_id", parent.profileId)
      .order("created_at", { ascending: true });
    const list = (children ?? []) as any[];
    const childIds = list.map((c) => c.profile_id);
    totalChildren = childIds.length;

    // slug -> subject uuid, per child (first subject wins per slug).
    const activeByChild = new Map<string, Map<string, string>>();

    if (childIds.length > 0) {
      // Live subscriptions (mirrors the subscribe page's "live" statuses) →
      // their covered subjects give each child's active subject tabs. The
      // trialing/active subset also feeds the "active subscriptions" metric.
      try {
        const { data: subs } = await supabase
          .from("child_subscriptions")
          .select("id, student_profile_id, status")
          .in("student_profile_id", childIds)
          .in("status", ["trialing", "active", "past_due"]);
        const subRows = (subs ?? []) as any[];

        const activeChildren = new Set(
          subRows
            .filter((s) => s.status === "trialing" || s.status === "active")
            .map((s) => s.student_profile_id),
        );
        activeSubs = activeChildren.size;

        const subToChild = new Map<string, string>(
          subRows.map((s) => [s.id, s.student_profile_id]),
        );
        if (subRows.length > 0) {
          const { data: covered } = await supabase
            .from("subscription_subjects")
            .select("child_subscription_id, subjects(id, code, name)")
            .in("child_subscription_id", Array.from(subToChild.keys()));
          for (const row of (covered ?? []) as any[]) {
            const childId = subToChild.get(row.child_subscription_id);
            const slug = subjectSlug(row.subjects?.code, row.subjects?.name);
            const subjectId = row.subjects?.id;
            if (!childId || !slug || !subjectId) continue;
            if (!activeByChild.has(childId)) activeByChild.set(childId, new Map());
            const bySlug = activeByChild.get(childId)!;
            if (!bySlug.has(slug)) bySlug.set(slug, subjectId);
          }
        }
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

    kids = list.map((c) => {
      const bySlug = activeByChild.get(c.profile_id) ?? new Map<string, string>();
      return {
        id: c.profile_id,
        name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        activeSubjects: SUBJECT_ORDER.filter((s) => bySlug.has(s)).map((s) => ({
          slug: s,
          id: bySlug.get(s)!,
        })),
      };
    });
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

  // --- Resolve the URL selection → child + subject ("all" | uuid | "" = none)
  const childParam = firstParam(sp.child);
  const selectedChild = kids.find((k) => k.id === childParam) ?? kids[0];
  const active = selectedChild?.activeSubjects ?? [];
  const subjectParam = firstParam(sp.subject);
  let selectedSubject = "";
  if (active.length > 0) {
    if (subjectParam === "all") selectedSubject = "all";
    else if (active.some((s) => s.id === subjectParam)) selectedSubject = subjectParam;
    // Sensible default: the single active subject; the aggregate when several.
    else selectedSubject = active.length === 1 ? active[0].id : "all";
  }

  // --- ONE RPC call for the selection (real aggregates; RPC authorizes the
  // linked parent in-body). Any error/null → safe empty object so the client
  // renders the honest empty state instead of crashing.
  let dash: DashPayload = {};
  if (selectedChild && selectedSubject) {
    try {
      const { data, error } = await supabase.rpc("get_child_subject_dashboard", {
        p_student_profile_id: selectedChild.id,
        p_subject_id: selectedSubject === "all" ? null : selectedSubject,
        p_days: 30,
      });
      if (!error && data && typeof data === "object") dash = data as DashPayload;
    } catch {
      dash = {};
    }
  }

  const dict: Record<string, string> = {};
  for (const k of ANA_KEYS) dict[k] = t(k);

  return (
    <section className="ana-page">
      <header className="ana-head">
        <h1>{t("analytics.title")}</h1>
        <p className="muted">{t("analytics.subtitle")}</p>
      </header>

      <div className="analytics-grid">
        {metrics.map((m) => (
          <div className="metric-card" key={m.label}>
            <span className="metric-num">{m.value}</span>
            <span className="metric-label">{m.label}</span>
          </div>
        ))}
      </div>

      <div className="ana-section-head">
        <h2>{t("ana.section.title")}</h2>
        <p className="muted">{t("ana.section.sub")}</p>
      </div>

      {kids.length === 0 ? (
        <div className="ana-locked-panel">
          <p>{t("ana.noChildren")}</p>
          <Link className="btn" href="/children/new">
            {t("ana.addChild")}
          </Link>
        </div>
      ) : (
        <AnalyticsDashboard
          kids={kids}
          dict={dict}
          selectedChildId={selectedChild!.id}
          selectedSubject={selectedSubject}
          data={dash}
        />
      )}
    </section>
  );
}
