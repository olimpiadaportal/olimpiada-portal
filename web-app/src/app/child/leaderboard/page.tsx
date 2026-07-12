import Link from "next/link";
import type { ReactNode } from "react";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { LeaderboardSubjectSelect } from "@/components/LeaderboardSubjectSelect";

// L1 — REAL leaderboard consuming the live DB engine through the child's own
// authenticated client (SECURITY DEFINER RPCs; NOT service role). Everything
// is server-rendered: board/scope/period come from searchParams and are
// validated against server-side whitelists — the client never fetches or
// aggregates anything.
//
// Migration 048: rows are NAMED ("Firstname L.", formatted server-side — the
// full last name never leaves the DB) and carry city/school/grade context.
// The old anonymization (display_name null + anon_tag) is gone.
//
// searchParams contract (all optional, all whitelist-validated):
//   ?board=points|streak      (default points; streak is GLOBAL-only)
//   ?scope=global|subject|grade|city|school   (points only; default global;
//          grade/city/school are offered ONLY when the child has that id;
//          subject is offered whenever the platform has an active subject)
//   ?period=month|all         (points only; default month; all → 'all_time')
//   ?subject=<uuid>           (subject scope only; validated against the ACTIVE
//          subjects catalog — forged/unknown ids clamp to the first subject)

type Board = "points" | "streak";
type Scope = "global" | "subject" | "grade" | "city" | "school";
type PeriodUrl = "month" | "all";

// get_leaderboard row (migration 048).
type LbRow = {
  rank: number;
  display_name: string; // ALWAYS "Firstname L." (server-formatted)
  city: string | null;
  school: string | null;
  grade_level: number | null;
  value: number;
  is_self: boolean;
};
type MyRank = { rank: number | null; total: number; value: number };
type StreakStatus = {
  current: number;
  best: number;
  state: "active" | "at_risk" | "lost";
  hours_until_loss: number | null;
};

const MEDALS = ["\u{1F947}", "\u{1F948}", "\u{1F949}"]; // 🥇 🥈 🥉

export default async function ChildLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    board?: string;
    scope?: string;
    period?: string;
    subject?: string;
  }>;
}) {
  const child = await requireChild();
  const t = await getT();
  const locale = await getLocale();

  // The `leaderboard` FEATURE FLAG gates the whole page exactly as before
  // (the nav tab is hidden by the layout when off; a direct URL gets the
  // trilingual "ranking is currently disabled" notice).
  if (!(await isFeatureEnabled("leaderboard"))) {
    return (
      <section>
        <p className="arena-eyebrow">{t("arena.nav.rank")}</p>
        <h1 style={{ marginBottom: 20 }}>{t("arena.nav.rank")}</h1>
        <div className="arena-panel arena-muted">{t("gate.leaderboardOff")}</div>
      </section>
    );
  }

  const supabase = await createClient();
  const raw = await searchParams;

  // Scope inputs: the child's OWN grade/city/school ids from their students
  // row (RLS lets a child read its own row), plus ALL ACTIVE platform subjects
  // (world-readable catalog) — the subject board ranks every subject, not just
  // the ones this child is subscribed to.
  const [{ data: student }, { data: subjectRows }] = await Promise.all([
    supabase
      .from("students")
      .select("grade_id, district_id, school_id")
      .eq("profile_id", child.profileId)
      .maybeSingle(),
    supabase
      .from("subjects")
      .select("id, name")
      .eq("status", "active")
      .order("name", { ascending: true }),
  ]);
  const activeSubjects = ((subjectRows ?? []) as { id: string; name: string }[])
    .filter((s) => !!s.id);
  const gradeId: string | null = (student as any)?.grade_id ?? null;
  const cityId: string | null = (student as any)?.district_id ?? null;
  const schoolId: string | null = (student as any)?.school_id ?? null;

  // ---- server-side whitelists (never pass raw client strings to the RPC) ----
  const board: Board = raw.board === "streak" ? "streak" : "points";
  const periodUrl: PeriodUrl = raw.period === "all" ? "all" : "month";
  // grade/city/school tabs exist ONLY when the child has the corresponding id;
  // the subject tab exists whenever the platform has at least one active subject.
  const scopeTabs: { key: Scope; id: string | null }[] = [
    { key: "global", id: null },
    ...(activeSubjects.length > 0 ? [{ key: "subject" as Scope, id: null }] : []),
    ...(gradeId ? [{ key: "grade" as Scope, id: gradeId }] : []),
    ...(cityId ? [{ key: "city" as Scope, id: cityId }] : []),
    ...(schoolId ? [{ key: "school" as Scope, id: schoolId }] : []),
  ];
  const requestedScope: Scope =
    scopeTabs.find((s) => s.key === raw.scope)?.key ?? "global";
  // The STREAK board is GLOBAL-ONLY — the RPC rejects any other scope, so we
  // never even build one.
  const scope: Scope = board === "streak" ? "global" : requestedScope;
  // ?subject= is clamped against the active-subject catalog: a forged/unknown
  // uuid (or a missing param) falls back to the FIRST active subject, so the
  // subject board never renders blank.
  const subjectId =
    activeSubjects.find((s) => s.id === raw.subject)?.id ??
    activeSubjects[0]?.id ??
    null;
  const scopeId: string | null =
    scope === "global"
      ? null
      : scope === "subject"
        ? subjectId
        : scope === "grade"
          ? gradeId
          : scope === "city"
            ? cityId
            : schoolId;
  const period =
    board === "streak" ? "all_time" : periodUrl === "all" ? "all_time" : "month";

  const baseArgs = {
    p_board: board,
    p_scope: scope,
    p_scope_id: scopeId,
    p_period: period,
  };
  const [listRes, meRes, streakRes] = await Promise.all([
    supabase.rpc("get_leaderboard", { ...baseArgs, p_limit: 50 }),
    supabase.rpc("get_my_leaderboard_rank", baseArgs),
    board === "streak"
      ? supabase.rpc("get_streak_status")
      : Promise.resolve({ data: null } as { data: unknown }),
  ]);
  const rows = (listRes.data ?? []) as LbRow[];
  const me = (meRes.data ?? { rank: null, total: 0, value: 0 }) as MyRank;
  const streak = (streakRes.data ?? null) as StreakStatus | null;

  // Link builder — default values are omitted so canonical URLs stay clean.
  // ?subject= is emitted ONLY for the subject scope, so switching to any other
  // scope automatically drops it (and re-entering subject scope re-defaults).
  const defaultSubject = activeSubjects[0]?.id ?? null;
  const href = (q: {
    board: Board;
    scope: Scope;
    period: PeriodUrl;
    subject: string | null;
  }): string => {
    const p = new URLSearchParams();
    if (q.board !== "points") p.set("board", q.board);
    if (q.board === "points") {
      if (q.scope !== "global") p.set("scope", q.scope);
      if (q.period !== "month") p.set("period", q.period);
      if (q.scope === "subject" && q.subject && q.subject !== defaultSubject) {
        p.set("subject", q.subject);
      }
    }
    const s = p.toString();
    return s ? `/child/leaderboard?${s}` : "/child/leaderboard";
  };
  const cur = { board, scope, period: periodUrl, subject: subjectId };

  const selectedSubjectName =
    scope === "subject"
      ? (activeSubjects.find((s) => s.id === subjectId)?.name ?? null)
      : null;

  // Streak-card state messaging (t() has no interpolation — manual replace).
  let streakMsg = "";
  if (streak) {
    if (streak.state === "at_risk") {
      const h = Math.max(1, Math.round(Number(streak.hours_until_loss ?? 0)));
      streakMsg = t("lb.streak.atRisk").replace("{h}", String(h));
    } else if (streak.state === "active") {
      streakMsg = t("lb.streak.active");
    } else {
      streakMsg = t("lb.streak.lost");
    }
  }

  const emptyKey =
    board === "streak"
      ? "lb.empty.streak"
      : periodUrl === "month"
        ? "lb.empty.month"
        : "lb.empty.all";

  const fmtValue = (v: number): string =>
    board === "points"
      ? String(Math.round(Number(v)))
      : `${Number(v)} ${t("lb.days")}`;

  // Mobile context line under the participant name (points board): the same
  // city/school/grade the desktop columns show, joined into one muted line.
  const ctxOf = (r: LbRow): string =>
    [
      r.city?.trim() || null,
      r.school?.trim() || null,
      r.grade_level != null ? formatGradeLabel(r.grade_level, locale) : null,
    ]
      .filter((p): p is string => !!p)
      .join(" · ");

  // ---- ONE column config drives the single table for every board/scope ----
  // Points boards (all scopes) show Rank·Participant·City·School·Grade·Score;
  // the SUBJECT scope shows the selected subject once in the caption instead
  // of a redundant per-row column (every row shares it). The streak board
  // keeps its simpler Rank·Participant·Score layout.
  type Col = {
    id: string;
    header: string;
    thClass?: string;
    tdClass?: string;
    render: (r: LbRow) => ReactNode;
  };
  const cols: Col[] = [
    {
      id: "rank",
      header: t("lb.colRank"),
      tdClass: "arena-rank-cell",
      render: (r) =>
        r.rank <= 3 ? (
          <span className="lb-medal" aria-label={String(r.rank)}>
            {MEDALS[r.rank - 1]}
          </span>
        ) : (
          String(r.rank).padStart(2, "0")
        ),
    },
    {
      id: "participant",
      header: t("lb.colStudent"),
      render: (r) => {
        const ctx = board === "points" ? ctxOf(r) : "";
        return (
          <>
            <span className="arena-part-name">
              {(r.display_name ?? "").trim() || "—"}
            </span>
            {r.is_self && <span className="arena-pts"> · {t("lb.you")}</span>}
            {ctx && <span className="lb-part-ctx">{ctx}</span>}
          </>
        );
      },
    },
    ...(board === "points"
      ? ([
          {
            id: "city",
            header: t("lb.colCity"),
            thClass: "lb-ctx-col",
            tdClass: "lb-ctx-col",
            render: (r) => r.city?.trim() || "—",
          },
          {
            id: "school",
            header: t("lb.colSchool"),
            thClass: "lb-ctx-col",
            tdClass: "lb-ctx-col",
            render: (r) => r.school?.trim() || "—",
          },
          {
            id: "grade",
            header: t("lb.colGrade"),
            thClass: "lb-ctx-col",
            tdClass: "lb-ctx-col",
            render: (r) => formatGradeLabel(r.grade_level, locale),
          },
        ] satisfies Col[])
      : []),
    {
      id: "value",
      header: board === "points" ? t("lb.colPoints") : t("lb.colStreak"),
      thClass: "num",
      tdClass: "num arena-pts",
      render: (r) => fmtValue(r.value),
    },
  ];

  return (
    <section>
      <p className="arena-eyebrow">{t("lb.eyebrow")}</p>
      <h1 style={{ marginBottom: 18 }}>{t("lb.title")}</h1>

      {/* Board tabs: Points | Streak */}
      <nav className="lb-boards" aria-label={t("lb.title")}>
        <Link
          className={`lb-board${board === "points" ? " active" : ""}`}
          href={href({ ...cur, board: "points" })}
          aria-current={board === "points" ? "page" : undefined}
        >
          {t("lb.board.points")}
        </Link>
        <Link
          className={`lb-board${board === "streak" ? " active" : ""}`}
          href={href({ ...cur, board: "streak" })}
          aria-current={board === "streak" ? "page" : undefined}
        >
          {"\u{1F525}"} {t("lb.board.streak")}
        </Link>
      </nav>

      {board === "points" && (
        <>
          {/* Scope tabs — only the scopes this child actually has. */}
          <div className="arena-chips" role="group" aria-label={t("lb.scope.global")}>
            {scopeTabs.map((s) => (
              <Link
                key={s.key}
                className={`arena-chip${scope === s.key ? " active" : ""}`}
                href={href({ ...cur, scope: s.key })}
              >
                {t(`lb.scope.${s.key}`)}
              </Link>
            ))}
          </div>

          {/* Subject picker — ALL active subjects, single-select dropdown.
              Navigation goes through server-built whitelisted hrefs; the
              first subject is auto-selected when ?subject= is absent. */}
          {scope === "subject" && activeSubjects.length > 0 && (
            <LeaderboardSubjectSelect
              label={t("lb.subjectLabel")}
              value={subjectId ?? ""}
              options={activeSubjects.map((s) => ({
                id: s.id,
                name: s.name,
                href: href({ ...cur, subject: s.id }),
              }))}
            />
          )}

          {/* Period toggle: This month | All time */}
          <div className="arena-chips" role="group" aria-label={t("lb.period.month")}>
            <Link
              className={`arena-chip${periodUrl === "month" ? " active" : ""}`}
              href={href({ ...cur, period: "month" })}
            >
              {t("lb.period.month")}
            </Link>
            <Link
              className={`arena-chip${periodUrl === "all" ? " active" : ""}`}
              href={href({ ...cur, period: "all" })}
            >
              {t("lb.period.all")}
            </Link>
          </div>
        </>
      )}

      {/* Streak status card (streak board only, above the list). */}
      {board === "streak" && streak && (
        <div
          className={`lb-streak-card${streak.state === "at_risk" ? " at-risk" : ""}`}
        >
          <span className="lb-flame" aria-hidden="true">
            {"\u{1F525}"}
          </span>
          <div>
            <div className="lb-streak-num">
              {streak.current} {t("lb.days")}
            </div>
            <div className="lb-streak-label">{t("lb.streak.current")}</div>
          </div>
          <div>
            <div className="lb-streak-num lb-streak-best">
              {streak.best} {t("lb.days")}
            </div>
            <div className="lb-streak-label">{t("lb.streak.best")}</div>
          </div>
          <p className="lb-streak-msg">{streakMsg}</p>
        </div>
      )}

      {/* Subject caption — the whole board shares one subject, so it is shown
          ONCE here instead of as a redundant per-row column. */}
      {board === "points" && selectedSubjectName && (
        <p className="lb-subject-caption">
          {t("lb.subjectLabel")}: <strong>{selectedSubjectName}</strong>
        </p>
      )}

      {/* Top-50 board */}
      <div className="arena-panel" style={{ padding: 8 }}>
        {rows.length === 0 ? (
          <p className="arena-muted" style={{ margin: 0, padding: 16 }}>
            {t(emptyKey)}
          </p>
        ) : (
          <div className="lb-table-wrap">
            <table className="arena-table">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.id} className={c.thClass}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rank} className={r.is_self ? "me" : undefined}>
                    {cols.map((c) => (
                      <td key={c.id} className={c.tdClass}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky "Your rank" card for the CURRENT board/scope/period. */}
      <aside className="lb-me-card" aria-label={t("lb.myRank.title")}>
        <div>
          <div className="lb-me-label">{t("lb.myRank.title")}</div>
          {me.rank !== null ? (
            <div className="lb-me-rank">
              #{me.rank} <span className="lb-me-total">/ {me.total}</span>
            </div>
          ) : (
            <div className="lb-me-none">{t("lb.myRank.none")}</div>
          )}
        </div>
        <div className="lb-me-val">
          {board === "points"
            ? `${Math.round(Number(me.value))} ${t("lb.pointsUnit")}`
            : `${Number(me.value)} ${t("lb.days")}`}
        </div>
      </aside>
    </section>
  );
}
