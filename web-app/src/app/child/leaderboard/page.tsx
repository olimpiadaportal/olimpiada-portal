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
//   ?scope=global|subject|grade|city|district|school   (points only; default
//          global; grade/city/school are offered ONLY when the child has that
//          id; district (migration 058) is offered when the child's city has
//          active districts; subject whenever an active subject exists)
//   ?period=month|all         (points only; default month; all → 'all_time')
//   ?subject=<uuid>           (subject scope only; validated against the ACTIVE
//          subjects catalog — forged/unknown ids clamp to the first subject)
//   ?district=<uuid>          (district scope only; validated against the
//          child's city's ACTIVE districts — unknown ids clamp to the first)

type Board = "points" | "streak";
type Scope = "global" | "subject" | "grade" | "city" | "district" | "school";
type PeriodUrl = "month" | "all";

// get_leaderboard row (migrations 048 + 058: district derived from the
// student's school, for BOTH boards).
type LbRow = {
  rank: number;
  display_name: string; // ALWAYS "Firstname L." (server-formatted)
  city: string | null;
  district: string | null;
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

export default async function ChildLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    board?: string;
    scope?: string;
    period?: string;
    subject?: string;
    district?: string;
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

  // City districts (rayons) of the CHILD'S city (public-read catalog,
  // migration 053) — they drive the district scope tab + its filter chips.
  let cityDistricts: { id: string; name: string }[] = [];
  if (cityId) {
    const { data: cdRows } = await supabase
      .from("city_districts")
      .select("id, name")
      .eq("city_id", cityId)
      .eq("status", "active")
      .order("name", { ascending: true });
    cityDistricts = ((cdRows ?? []) as { id: string; name: string }[]).filter((d) => !!d.id);
  }

  // ---- server-side whitelists (never pass raw client strings to the RPC) ----
  const board: Board = raw.board === "streak" ? "streak" : "points";
  const periodUrl: PeriodUrl = raw.period === "all" ? "all" : "month";
  // grade/city/school tabs exist ONLY when the child has the corresponding id;
  // the subject tab exists whenever the platform has at least one active
  // subject; the district tab exists when the child's city has districts.
  const scopeTabs: { key: Scope; id: string | null }[] = [
    { key: "global", id: null },
    ...(activeSubjects.length > 0 ? [{ key: "subject" as Scope, id: null }] : []),
    ...(gradeId ? [{ key: "grade" as Scope, id: gradeId }] : []),
    ...(cityId ? [{ key: "city" as Scope, id: cityId }] : []),
    ...(cityDistricts.length > 0 ? [{ key: "district" as Scope, id: null }] : []),
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
  // ?district= is clamped the same way against the child's city's districts.
  const districtId =
    cityDistricts.find((d) => d.id === raw.district)?.id ??
    cityDistricts[0]?.id ??
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
            : scope === "district"
              ? districtId
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
  // ?subject=/?district= are emitted ONLY for their own scope, so switching to
  // any other scope automatically drops them (and re-entering re-defaults).
  const defaultSubject = activeSubjects[0]?.id ?? null;
  const defaultDistrict = cityDistricts[0]?.id ?? null;
  const href = (q: {
    board: Board;
    scope: Scope;
    period: PeriodUrl;
    subject: string | null;
    district: string | null;
  }): string => {
    const p = new URLSearchParams();
    if (q.board !== "points") p.set("board", q.board);
    if (q.board === "points") {
      if (q.scope !== "global") p.set("scope", q.scope);
      if (q.period !== "month") p.set("period", q.period);
      if (q.scope === "subject" && q.subject && q.subject !== defaultSubject) {
        p.set("subject", q.subject);
      }
      if (q.scope === "district" && q.district && q.district !== defaultDistrict) {
        p.set("district", q.district);
      }
    }
    const s = p.toString();
    return s ? `/child/leaderboard?${s}` : "/child/leaderboard";
  };
  const cur = { board, scope, period: periodUrl, subject: subjectId, district: districtId };

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

  // Mobile context line under the participant name: the same columns the
  // desktop table shows, joined into one muted line (points: city/district/
  // school/grade; streak: district only — its sole context column).
  const ctxOf = (r: LbRow): string =>
    (board === "points"
      ? [
          r.city?.trim() || null,
          r.district?.trim() || null,
          r.school?.trim() || null,
          r.grade_level != null ? formatGradeLabel(r.grade_level, locale) : null,
        ]
      : [r.district?.trim() || null]
    )
      .filter((p): p is string => !!p)
      .join(" · ");

  // ---- ONE column config drives the single table for every board/scope ----
  // Points boards (all scopes): Sıra·İştirakçı·Şəhər·Rayon·Məktəb·Sinif·Xal
  // (district right after city, migration 058); the SUBJECT scope shows the
  // selected subject once in the caption instead of a redundant per-row
  // column. The streak board keeps its simpler layout + the district column.
  // Ranks are PLAIN NUMBERS 1..50 — no medal icons anywhere.
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
      render: (r) => String(r.rank),
    },
    {
      id: "participant",
      header: t("lb.colStudent"),
      render: (r) => {
        const ctx = ctxOf(r);
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
        ] satisfies Col[])
      : []),
    {
      id: "district",
      header: t("lb.colDistrict"),
      thClass: "lb-ctx-col",
      tdClass: "lb-ctx-col",
      render: (r) => r.district?.trim() || "—",
    },
    ...(board === "points"
      ? ([
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

          {/* District filter chips (migration 058) — the districts of the
              child's CITY; server-built whitelisted hrefs, first district
              auto-selected when ?district= is absent. */}
          {scope === "district" && cityDistricts.length > 0 && (
            <div className="arena-chips" role="group" aria-label={t("lb.colDistrict")}>
              {cityDistricts.map((d) => (
                <Link
                  key={d.id}
                  className={`arena-chip${districtId === d.id ? " active" : ""}`}
                  href={href({ ...cur, district: d.id })}
                >
                  {d.name}
                </Link>
              ))}
            </div>
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

      {/* Top-50 board — INTERNAL vertical scroll (≈10–12 rows) with a sticky
          header, so the page itself never stretches to 50 rows. */}
      <div className="arena-panel" style={{ padding: 8 }}>
        {rows.length === 0 ? (
          <p className="arena-muted" style={{ margin: 0, padding: 16 }}>
            {t(emptyKey)}
          </p>
        ) : (
          <div className="lb-scroll">
            <table className="arena-table lb-table">
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

      {/* Sticky "Your rank" card for the CURRENT board/scope/period — visible
          even when the child is outside the top-50. A null rank under a
          non-default filter gets the honest "not participating under this
          filter" state instead of the generic "not ranked yet". */}
      <aside className="lb-me-card" aria-label={t("lb.myRank.title")}>
        <div>
          <div className="lb-me-label">{t("lb.myRank.title")}</div>
          {me.rank !== null ? (
            <div className="lb-me-rank">
              #{me.rank} <span className="lb-me-total">/ {me.total}</span>
            </div>
          ) : (
            <div className="lb-me-none">
              {board === "points" && scope !== "global"
                ? t("lb.myRank.notInFilter")
                : t("lb.myRank.none")}
            </div>
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
