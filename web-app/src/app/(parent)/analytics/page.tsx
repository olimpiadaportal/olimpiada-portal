import Link from "next/link";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { getPaymentModeInfo } from "@/lib/paymentMode";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  AnalyticsDashboard,
  type AnalyticsChild,
  type DashPayload,
} from "./AnalyticsDashboard";

// get_child_leaderboard_summary payload (defensive-optional: any RPC error/null
// is treated as "no leaderboard activity" and renders the honest empty state).
type LbSummary = {
  points_month?: number | null;
  points_all_time?: number | null;
  current_streak?: number | null;
  best_streak?: number | null;
  rank_month?: number | null;
  total_month?: number | null;
  rank_all_time?: number | null;
};

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
  "ana.locked", "ana.noActive", "ana.goSubscribe",
  "ana.kpi.last7", "ana.kpi.tests", "ana.kpi.correct", "ana.kpi.wrong",
  "ana.kpi.skipped", "ana.kpi.time", "ana.kpi.best", "ana.kpi.weak", "ana.kpi.last",
  "ana.chart.weekly", "ana.chart.weeklySub", "ana.chart.trend", "ana.chart.trendSub30",
  "ana.chart.topics", "ana.chart.mistakes",
  "ana.th.topic", "ana.th.subtopic", "ana.th.questions", "ana.th.accuracy", "ana.th.mistakes",
  "ana.day.mon", "ana.day.tue", "ana.day.wed", "ana.day.thu",
  "ana.day.fri", "ana.day.sat", "ana.day.sun",
  "ana.unit.h", "ana.unit.m",
  "ana.rangeNote",
  "ana.empty.title", "ana.empty.sub", "ana.empty.trend", "ana.empty.mistakes",
  // Analytics-type switch (Subjects vs Olympiads) + olympiad-scope extras.
  "ana.mode.label", "ana.mode.subjects", "ana.mode.olympiads",
  "ana.olymp.kpi.attempts",
  "ana.olymp.perPackage", "ana.olymp.perPackageSub",
  "ana.th.package", "ana.th.attempts",
  "ana.olymp.empty.title", "ana.olymp.empty.sub",
];

function firstParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ParentAnalytics({
  searchParams,
}: {
  searchParams: Promise<{
    child?: string | string[];
    subject?: string | string[];
    mode?: string | string[];
  }>;
}) {
  const parent = await requireParent();
  const t = await getT();
  const supabase = await createClient();
  const sp = await searchParams;

  // R11 — while an admin giveaway window is ACTIVE, every subject counts as
  // unlocked for every child. Resolved server-side from the DB flags (never
  // client state); outside the giveaway, unlocked subjects come from each
  // child's LIVE subscription rows below. Admin free grants need no special
  // case: they are ordinary child_subscriptions rows (provider='admin_grant',
  // status='active'), so the same status filter covers them.
  const giveawayActive = (await getPaymentModeInfo()).giveaway.active;

  let totalChildren = 0;
  let activeSubs = 0;
  let attempts = 0;
  let avgScore = 0;
  let kids: AnalyticsChild[] = [];
  // The PURCHASABLE platform subjects (id + real name), from active pricing —
  // the universe of subjects a child could have. Subject tabs are derived from
  // THESE real subjects (not a hardcoded slug set), so any admin-defined subject
  // works. A child's subscribed subjects are selectable; the rest render locked
  // with a subscribe hint; an active giveaway unlocks all of them.
  let platformSubjects: { id: string; name: string }[] = [];

  try {
    const { data: children } = await supabase
      .from("students")
      .select("profile_id, first_name, last_name")
      .eq("created_by_parent_profile_id", parent.profileId)
      .order("created_at", { ascending: true });
    const list = (children ?? []) as any[];
    const childIds = list.map((c) => c.profile_id);
    totalChildren = childIds.length;

    // childId -> Map<subjectId, subjectName> covered by the child's LIVE plan.
    const activeByChild = new Map<string, Map<string, string>>();

    // Purchasable subjects (distinct) — same source the subscribe page uses, so
    // the two screens always agree on the child's subjects.
    try {
      const { data: pricing } = await supabase
        .from("subjects_pricing")
        .select("subject_id, subjects(id, code, name)")
        .eq("status", "active");
      const seen = new Set<string>();
      for (const row of (pricing ?? []) as any[]) {
        const s = row.subjects;
        if (s?.id && !seen.has(s.id)) {
          seen.add(s.id);
          // Locale-aware tab label (subj.<code>); the id stays the RPC/URL value.
          platformSubjects.push({ id: s.id, name: subjectLabel(t, s.code, s.name) });
        }
      }
      platformSubjects.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      // No pricing readable → locked tabs simply won't render (active still do).
    }

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
        // Tab enrichment (covered subjects) is isolated so a failure here can
        // never zero the already-computed activeSubs metric above.
        if (subRows.length > 0) {
          try {
            const { data: covered } = await supabase
              .from("subscription_subjects")
              .select("child_subscription_id, subjects(id, code, name)")
              .in("child_subscription_id", Array.from(subToChild.keys()));
            for (const row of (covered ?? []) as any[]) {
              const childId = subToChild.get(row.child_subscription_id);
              const subj = row.subjects;
              if (!childId || !subj?.id) continue;
              if (!activeByChild.has(childId)) activeByChild.set(childId, new Map());
              activeByChild
                .get(childId)!
                .set(subj.id, subjectLabel(t, subj.code, subj.name));
            }
          } catch {
            // Covered-subject tabs only degrade; the metric stays intact.
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
      const own = activeByChild.get(c.profile_id) ?? new Map<string, string>();
      // Active giveaway → every purchasable subject is unlocked (merged so a
      // child's real subscription rows win where both carry the same id).
      const activeMap = giveawayActive
        ? new Map<string, string>([
            ...platformSubjects.map((s) => [s.id, s.name] as const),
            ...own,
          ])
        : own;
      // Order active subjects by the platform order; append any the child has
      // that is no longer in the purchasable set (e.g. pricing later removed).
      const activeSubjects: { id: string; name: string }[] = platformSubjects
        .filter((s) => activeMap.has(s.id))
        .map((s) => ({ id: s.id, name: activeMap.get(s.id)! }));
      for (const [id, name] of activeMap) {
        if (!activeSubjects.some((a) => a.id === id)) activeSubjects.push({ id, name });
      }
      return {
        id: c.profile_id,
        name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        activeSubjects,
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

  // --- Analytics type (URL state, like child/subject): "subjects" (default)
  // keeps today's per-subject view, RPC-scoped to kind<>'olympiad' so subject
  // stats are guaranteed olympiad-free; "olympiads" drives the SAME layout from
  // olympiad attempts only (+ a per-package results table). Whitelisted — any
  // forged value falls back to the default.
  const mode: "subjects" | "olympiads" =
    firstParam(sp.mode) === "olympiads" ? "olympiads" : "subjects";

  // --- Resolve the URL selection → child + subject ("all" | uuid | "" = none).
  // Defence-in-depth: ?subject= is honored ONLY when it is one of the selected
  // child's UNLOCKED subjects — a hand-crafted locked/foreign uuid falls back
  // to the default selection, so a locked subject's data is never rendered
  // just because the query param was forged. (The RPC additionally authorizes
  // the parent-child link; subject locking is this page's rule.)
  const childParam = firstParam(sp.child);
  const selectedChild = kids.find((k) => k.id === childParam) ?? kids[0];
  const active = selectedChild?.activeSubjects ?? [];
  const subjectParam = firstParam(sp.subject);
  let selectedSubject = "";
  if (active.length > 0) {
    // "all" is only valid when the child actually has >1 subject (the dashboard
    // renders the "all" tab only then). For a single-subject child, ?subject=all
    // is coerced to that one subject so a tab is always selected and the RPC
    // never aggregates over subjects the child isn't subscribed to.
    if (subjectParam === "all" && active.length > 1) selectedSubject = "all";
    else if (active.some((s) => s.id === subjectParam)) selectedSubject = subjectParam;
    else selectedSubject = active.length === 1 ? active[0].id : "all";
  }

  // --- ONE RPC call for the selection (real aggregates; RPC authorizes the
  // linked parent in-body). Any error/null → safe empty object so the client
  // renders the honest empty state instead of crashing.
  // Subjects mode requires an unlocked subject selection (p_scope='tests'
  // excludes olympiad attempts); olympiads mode ignores the subject filter
  // entirely (p_scope='olympiads' — packages aren't subject-gated, so a child
  // without any subject subscription still sees their olympiad results).
  let dash: DashPayload = {};
  const wantDash =
    mode === "olympiads" ? !!selectedChild : !!(selectedChild && selectedSubject);
  if (wantDash && selectedChild) {
    try {
      const { data, error } = await supabase.rpc("get_child_subject_dashboard", {
        p_student_profile_id: selectedChild.id,
        p_subject_id:
          mode === "olympiads" || selectedSubject === "all" ? null : selectedSubject,
        p_days: 30,
        p_scope: mode === "olympiads" ? "olympiads" : "tests",
      });
      if (!error && data && typeof data === "object") dash = data as DashPayload;
    } catch {
      dash = {};
    }
  }

  // L-quick — leaderboard/improvement summary for the SAME selected child the
  // dashboard scopes to. Gated by the `leaderboard` flag; RLS inside the RPC
  // authorizes the parent↔child link. Any error/null → honest empty state.
  const leaderboardOn = await isFeatureEnabled("leaderboard");
  let lbSummary: LbSummary | null = null;
  if (leaderboardOn && selectedChild) {
    try {
      const { data, error } = await supabase.rpc("get_child_leaderboard_summary", {
        p_student: selectedChild.id,
      });
      if (!error && data) lbSummary = data as LbSummary;
    } catch {
      lbSummary = null;
    }
  }
  const lbHasActivity =
    !!lbSummary &&
    (Number(lbSummary.points_all_time ?? 0) > 0 ||
      Number(lbSummary.points_month ?? 0) > 0 ||
      Number(lbSummary.best_streak ?? 0) > 0);

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
          allSubjects={platformSubjects}
          dict={dict}
          selectedChildId={selectedChild!.id}
          selectedSubject={selectedSubject}
          mode={mode}
          data={dash}
        />
      )}

      {/* L-quick — leaderboard / improvement for the selected child. Gated by
          the `leaderboard` flag; hidden entirely when off. Server-rendered from
          get_child_leaderboard_summary, so it re-resolves whenever the
          dashboard's ?child= selection changes. */}
      {leaderboardOn && kids.length > 0 && selectedChild && (
        <div className="plb-section">
          <div className="ana-section-head">
            <h2>{t("plb.improvementTitle")}</h2>
            <p className="muted">{t("plb.improvementSub")}</p>
          </div>
          {lbHasActivity ? (
            <div className="ana-kpis">
              <div className="ana-kpi">
                <span className="ana-kpi-val">
                  {lbSummary!.rank_month != null ? `#${lbSummary!.rank_month}` : "—"}
                </span>
                <span className="ana-kpi-label">{t("plb.rankThisMonth")}</span>
              </div>
              <div className="ana-kpi">
                <span className="ana-kpi-val">
                  {lbSummary!.rank_all_time != null ? `#${lbSummary!.rank_all_time}` : "—"}
                </span>
                <span className="ana-kpi-label">{t("plb.rankAllTime")}</span>
              </div>
              <div className="ana-kpi">
                <span className="ana-kpi-val">
                  {Math.round(Number(lbSummary!.points_month ?? 0))}
                </span>
                <span className="ana-kpi-label">{t("plb.pointsMonth")}</span>
              </div>
              <div className="ana-kpi">
                <span className="ana-kpi-val">
                  {Math.round(Number(lbSummary!.points_all_time ?? 0))}
                </span>
                <span className="ana-kpi-label">{t("plb.pointsAllTime")}</span>
              </div>
              <div className="ana-kpi">
                <span className="ana-kpi-val">
                  🔥 {Number(lbSummary!.current_streak ?? 0) || 0}
                </span>
                <span className="ana-kpi-label">{t("plb.currentStreak")}</span>
              </div>
              <div className="ana-kpi">
                <span className="ana-kpi-val">
                  🔥 {Number(lbSummary!.best_streak ?? 0) || 0}
                </span>
                <span className="ana-kpi-label">{t("plb.bestStreak")}</span>
              </div>
            </div>
          ) : (
            <div className="ana-locked-panel">
              <p>{t("plb.emptyTitle")}</p>
              <p className="ana-locked-sub">{t("plb.emptySub")}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
