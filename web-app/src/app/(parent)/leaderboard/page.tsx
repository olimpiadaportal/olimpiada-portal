import Link from "next/link";
import type { ReactNode } from "react";
import { requireParent } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { subjectLabel } from "@/lib/subjectLabel";
import { LeaderboardSubjectSelect } from "@/components/LeaderboardSubjectSelect";

// Parent-panel leaderboard — the SAME board the student arena shows (points |
// streak, month | all_time, global/subject/grade/city/district/school scopes),
// but with catalog-driven filters: a parent is not scoped to one child, so the
// grade list comes from the grades catalog, the city list from the cities
// catalog, and district/school cascade from the selected city. Everything is
// server-rendered; all ids arriving in the URL are clamped against the ACTIVE
// catalogs before touching an RPC (never pass raw client strings).
//
// Below the top-50 board: "Övladlarınızın mövqeyi" — one card per linked child
// with its #rank/total + value under the CURRENT filters, via the
// get_child_leaderboard_position RPC (authorization re-verified in-body: only
// a linked parent/admin/self may ask about a student). The children list is
// loaded server-side from the parent's own students rows — the same source the
// dashboard/analytics pages use — so client-forged ids never enter the flow.
//
// searchParams contract (all optional, all whitelist-validated):
//   ?board=points|streak       (default points; streak is GLOBAL-only)
//   ?scope=global|subject|grade|city|district|school   (points only)
//   ?period=month|all          (points only; default month)
//   ?subject=<uuid>            (subject scope; clamped to active subjects)
//   ?grade=<uuid>              (grade scope; clamped to the grades catalog)
//   ?city=<uuid>               (city/district/school scopes; clamped to active cities)
//   ?district=<uuid>           (district scope; clamped to the city's districts)
//   ?school=<uuid>             (school scope; clamped to the city's schools)

type Board = "points" | "streak";
type Scope = "global" | "subject" | "grade" | "city" | "district" | "school";
type PeriodUrl = "month" | "all";

type LbRow = {
  rank: number;
  display_name: string; // "Firstname L." (server-formatted)
  city: string | null;
  district: string | null;
  school: string | null;
  grade_level: number | null;
  value: number;
  is_self: boolean;
};
type ChildPos = { rank: number | null; total: number; value: number };
type Kid = {
  profile_id: string;
  first_name: string;
  last_name: string;
  gradeLevel: number | null;
  gradeName: string | null;
  schoolName: string | null;
};

function initialsOf(first: string, last: string): string {
  const a = (first ?? "").trim()[0] ?? "";
  const b = (last ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export default async function ParentLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    board?: string;
    scope?: string;
    period?: string;
    subject?: string;
    grade?: string;
    city?: string;
    district?: string;
    school?: string;
  }>;
}) {
  const parent = await requireParent();
  const t = await getT();
  const locale = await getLocale();

  // Same `leaderboard` feature-flag gate as the student page (the nav tab is
  // hidden by the layout when off; a direct URL gets the trilingual notice).
  if (!(await isFeatureEnabled("leaderboard"))) {
    return (
      <section>
        <h1 style={{ marginBottom: 20 }}>{t("lb.title")}</h1>
        <div className="card">{t("gate.leaderboardOff")}</div>
      </section>
    );
  }

  const supabase = await createClient();
  const raw = await searchParams;

  // ---- catalogs (world-readable; same sources the Add-Child flow uses) ----
  // cities = active `districts` rows; grades = full grades catalog; subjects =
  // active subjects; plus a cheap head-count of active city_districts so the
  // district tab only exists when the catalog actually has districts.
  const [
    { data: subjectRows },
    { data: gradeRows },
    { data: cityRows },
    { count: districtCount },
  ] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, code, name")
      .eq("status", "active")
      .order("name", { ascending: true }),
    supabase.from("grades").select("id, level, name").order("level", { ascending: true }),
    supabase.from("districts").select("id, name").eq("status", "active").order("name"),
    supabase
      .from("city_districts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);
  const activeSubjects = (
    (subjectRows ?? []) as { id: string; code: string | null; name: string }[]
  ).filter((s) => !!s.id);
  const grades = ((gradeRows ?? []) as { id: string; level: number; name: string }[]).filter(
    (g) => !!g.id,
  );
  const cities = ((cityRows ?? []) as { id: string; name: string }[]).filter((c) => !!c.id);
  const hasDistricts = (districtCount ?? 0) > 0;

  // ---- server-side whitelists (mirrors the student page) ----
  const board: Board = raw.board === "streak" ? "streak" : "points";
  const periodUrl: PeriodUrl = raw.period === "all" ? "all" : "month";
  const scopeTabs: Scope[] = [
    "global",
    ...(activeSubjects.length > 0 ? (["subject"] as Scope[]) : []),
    ...(grades.length > 0 ? (["grade"] as Scope[]) : []),
    ...(cities.length > 0 ? (["city"] as Scope[]) : []),
    ...(cities.length > 0 && hasDistricts ? (["district"] as Scope[]) : []),
    ...(cities.length > 0 ? (["school"] as Scope[]) : []),
  ];
  const requestedScope: Scope = scopeTabs.find((s) => s === raw.scope) ?? "global";
  // The STREAK board is GLOBAL-ONLY — the RPC rejects any other scope.
  const scope: Scope = board === "streak" ? "global" : requestedScope;

  // Forged/unknown ids clamp to the FIRST catalog entry so a scoped board
  // never renders blank and no raw client string ever reaches an RPC.
  const subjectId =
    activeSubjects.find((s) => s.id === raw.subject)?.id ?? activeSubjects[0]?.id ?? null;
  const gradeId = grades.find((g) => g.id === raw.grade)?.id ?? grades[0]?.id ?? null;
  const cityId = cities.find((c) => c.id === raw.city)?.id ?? cities[0]?.id ?? null;

  // City → district / city → school cascades: the dependent catalogs are
  // fetched ONLY for their own scope, scoped to the clamped city.
  let cityDistricts: { id: string; name: string }[] = [];
  if (scope === "district" && cityId) {
    const { data: cdRows } = await supabase
      .from("city_districts")
      .select("id, name")
      .eq("city_id", cityId)
      .eq("status", "active")
      .order("name", { ascending: true });
    cityDistricts = ((cdRows ?? []) as { id: string; name: string }[]).filter((d) => !!d.id);
  }
  let citySchools: { id: string; name: string }[] = [];
  if (scope === "school" && cityId) {
    const { data: schRows } = await supabase
      .from("schools")
      .select("id, name")
      .eq("district_id", cityId)
      .eq("status", "active")
      .order("is_private", { ascending: false })
      .order("school_number", { ascending: true, nullsFirst: false })
      .order("name");
    citySchools = ((schRows ?? []) as { id: string; name: string }[]).filter((s) => !!s.id);
  }
  const districtId =
    cityDistricts.find((d) => d.id === raw.district)?.id ?? cityDistricts[0]?.id ?? null;
  const schoolId =
    citySchools.find((s) => s.id === raw.school)?.id ?? citySchools[0]?.id ?? null;

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

  // A non-global scope whose catalog turned out empty (e.g. a city without
  // districts) has no valid scope id — render the empty state without calling
  // the RPCs (lb_rows rejects a null id for scoped boards).
  const scopeUsable = scope === "global" || scopeId !== null;

  // ---- the parent's own linked children (server-trusted source: the same
  // students-by-created_by query the dashboard/analytics pages use) ----
  const { data: childRows } = await supabase
    .from("students")
    .select("profile_id, first_name, last_name, grade:grade_id(level, name), school:school_id(name)")
    .eq("created_by_parent_profile_id", parent.profileId)
    .order("created_at", { ascending: true });
  const kids: Kid[] = ((childRows ?? []) as any[]).map((c) => ({
    profile_id: c.profile_id,
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    gradeLevel: c.grade?.level ?? null,
    gradeName: c.grade?.name ?? null,
    schoolName: c.school?.name ?? null,
  }));

  // ---- one request computes BOTH the board and every child card: the top-50
  // list + one position RPC per linked child, all under the SAME clamped
  // filters (the RPC re-verifies the parent↔child link in-body) ----
  const baseArgs = { p_board: board, p_scope: scope, p_scope_id: scopeId, p_period: period };
  const [listRes, posEntries] = await Promise.all([
    scopeUsable
      ? supabase.rpc("get_leaderboard", { ...baseArgs, p_limit: 50 })
      : Promise.resolve({ data: [] } as { data: LbRow[] }),
    Promise.all(
      kids.map(async (k): Promise<readonly [string, ChildPos | null]> => {
        if (!scopeUsable) return [k.profile_id, null] as const;
        try {
          const { data, error } = await supabase.rpc("get_child_leaderboard_position", {
            p_student: k.profile_id,
            ...baseArgs,
          });
          if (error || !data) return [k.profile_id, null] as const;
          return [k.profile_id, data as ChildPos] as const;
        } catch {
          return [k.profile_id, null] as const;
        }
      }),
    ),
  ]);
  const rows = ((listRes.data ?? []) as LbRow[]).filter((r) => !!r);
  const posByChild = new Map<string, ChildPos | null>(posEntries);

  // Link builder — defaults omitted so canonical URLs stay clean; scope-owned
  // params are emitted ONLY for their own scope (switching scope drops them).
  const defaultSubject = activeSubjects[0]?.id ?? null;
  const defaultGrade = grades[0]?.id ?? null;
  const defaultCity = cities[0]?.id ?? null;
  const defaultDistrict = cityDistricts[0]?.id ?? null;
  const defaultSchool = citySchools[0]?.id ?? null;
  const href = (q: {
    board: Board;
    scope: Scope;
    period: PeriodUrl;
    subject: string | null;
    grade: string | null;
    city: string | null;
    district: string | null;
    school: string | null;
  }): string => {
    const p = new URLSearchParams();
    if (q.board !== "points") p.set("board", q.board);
    if (q.board === "points") {
      if (q.scope !== "global") p.set("scope", q.scope);
      if (q.period !== "month") p.set("period", q.period);
      if (q.scope === "subject" && q.subject && q.subject !== defaultSubject) {
        p.set("subject", q.subject);
      }
      if (q.scope === "grade" && q.grade && q.grade !== defaultGrade) {
        p.set("grade", q.grade);
      }
      if (
        (q.scope === "city" || q.scope === "district" || q.scope === "school") &&
        q.city &&
        q.city !== defaultCity
      ) {
        p.set("city", q.city);
      }
      if (q.scope === "district" && q.district && q.district !== defaultDistrict) {
        p.set("district", q.district);
      }
      if (q.scope === "school" && q.school && q.school !== defaultSchool) {
        p.set("school", q.school);
      }
    }
    const s = p.toString();
    return s ? `/leaderboard?${s}` : "/leaderboard";
  };
  const cur = {
    board,
    scope,
    period: periodUrl,
    subject: subjectId,
    grade: gradeId,
    city: cityId,
    district: districtId,
    school: schoolId,
  };

  const fmtValue = (v: number): string =>
    board === "points"
      ? `${Math.round(Number(v))}`
      : `${Number(v)} ${t("lb.days")}`;

  // Mobile context line under the participant name (≤760px hides the context
  // columns) — same composition as the student board.
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

  // Column config — points: Sıra·İştirakçı·Şəhər·Rayon·Məktəb·Sinif·Xal;
  // streak keeps the simpler layout (district context only). Ranks are PLAIN
  // NUMBERS — no medals.
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
      header: t("lb.colNo"),
      tdClass: "lb-rank",
      render: (r) => String(r.rank),
    },
    {
      id: "participant",
      header: t("lb.colStudent"),
      render: (r) => {
        const ctx = ctxOf(r);
        return (
          <>
            <span className="plb-part-name">{(r.display_name ?? "").trim() || "—"}</span>
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
      tdClass: "num plb-val",
      render: (r) => fmtValue(r.value),
    },
  ];

  return (
    <section>
      <h1 style={{ marginBottom: 18 }}>{t("lb.title")}</h1>

      {/* Board switch: Points | Streak */}
      <nav className="plb-chips" aria-label={t("lb.title")}>
        <Link
          className={`plb-chip${board === "points" ? " active" : ""}`}
          href={href({ ...cur, board: "points" })}
          aria-current={board === "points" ? "page" : undefined}
        >
          {t("lb.board.points")}
        </Link>
        <Link
          className={`plb-chip${board === "streak" ? " active" : ""}`}
          href={href({ ...cur, board: "streak" })}
          aria-current={board === "streak" ? "page" : undefined}
        >
          {"\u{1F525}"} {t("lb.board.streak")}
        </Link>
      </nav>

      {board === "points" && (
        <>
          {/* Scope tabs — catalog-driven (parents see every scope). */}
          <div className="plb-chips" role="group" aria-label={t("lb.scope.global")}>
            {scopeTabs.map((s) => (
              <Link
                key={s}
                className={`plb-chip${scope === s ? " active" : ""}`}
                href={href({ ...cur, scope: s })}
              >
                {t(`lb.scope.${s}`)}
              </Link>
            ))}
          </div>

          {/* Per-scope pickers — every option navigates through a server-built
              whitelisted href (the reused LeaderboardSubjectSelect only
              router.replace()s a server URL; it never builds query strings). */}
          {scope === "subject" && activeSubjects.length > 0 && (
            <div className="plb-filters">
              <LeaderboardSubjectSelect
                label={t("lb.subjectLabel")}
                value={subjectId ?? ""}
                options={activeSubjects.map((s) => ({
                  id: s.id,
                  name: subjectLabel(t, s.code, s.name),
                  href: href({ ...cur, subject: s.id }),
                }))}
              />
            </div>
          )}

          {scope === "grade" && grades.length > 0 && (
            <div className="plb-chips" role="group" aria-label={t("lb.colGrade")}>
              {grades.map((g) => (
                <Link
                  key={g.id}
                  className={`plb-chip${gradeId === g.id ? " active" : ""}`}
                  href={href({ ...cur, grade: g.id })}
                >
                  {formatGradeLabel(g.level, locale, g.name)}
                </Link>
              ))}
            </div>
          )}

          {(scope === "city" || scope === "district" || scope === "school") &&
            cities.length > 0 && (
              <div className="plb-filters">
                <LeaderboardSubjectSelect
                  label={t("lb.colCity")}
                  value={cityId ?? ""}
                  options={cities.map((c) => ({
                    id: c.id,
                    name: c.name,
                    // Switching city drops the dependent district/school so
                    // they re-clamp to the new city's catalog on arrival.
                    href: href({ ...cur, city: c.id, district: null, school: null }),
                  }))}
                />
                {scope === "district" && cityDistricts.length > 0 && (
                  <LeaderboardSubjectSelect
                    label={t("lb.colDistrict")}
                    value={districtId ?? ""}
                    options={cityDistricts.map((d) => ({
                      id: d.id,
                      name: d.name,
                      href: href({ ...cur, district: d.id }),
                    }))}
                  />
                )}
                {scope === "school" && citySchools.length > 0 && (
                  <LeaderboardSubjectSelect
                    label={t("lb.colSchool")}
                    value={schoolId ?? ""}
                    options={citySchools.map((s) => ({
                      id: s.id,
                      name: s.name,
                      href: href({ ...cur, school: s.id }),
                    }))}
                  />
                )}
              </div>
            )}

          {/* Period toggle: This month | All time */}
          <div className="plb-chips" role="group" aria-label={t("lb.period.month")}>
            <Link
              className={`plb-chip${periodUrl === "month" ? " active" : ""}`}
              href={href({ ...cur, period: "month" })}
            >
              {t("lb.period.month")}
            </Link>
            <Link
              className={`plb-chip${periodUrl === "all" ? " active" : ""}`}
              href={href({ ...cur, period: "all" })}
            >
              {t("lb.period.all")}
            </Link>
          </div>
        </>
      )}

      {/* Top-50 board — internal scroll + sticky header (reused .lb-* block). */}
      <div className="plb-panel">
        {rows.length === 0 ? (
          <p className="plb-empty">{t("plb.board.empty")}</p>
        ) : (
          <div className="lb-scroll">
            <table className="lb-table">
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
                  <tr key={r.rank}>
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

      {/* "Övladlarınızın mövqeyi" — one card per linked child, recomputed under
          the CURRENT filters in the same request as the board above. */}
      <h2 className="plb-kids-title">{t("plb.pos.title")}</h2>
      {kids.length === 0 ? (
        <div className="plb-kid plb-kid-empty">
          <p className="plb-kid-none" style={{ margin: 0 }}>
            {t("plb.pos.noChildren")}
          </p>
          <Link className="btn" href="/children/new">
            {t("parent.dash.addChild")}
          </Link>
        </div>
      ) : (
        <div className="plb-kids">
          {kids.map((k) => {
            const pos = posByChild.get(k.profile_id) ?? null;
            const meta = [
              formatGradeLabel(k.gradeLevel, locale, k.gradeName),
              k.schoolName?.trim() || null,
            ]
              .filter((x): x is string => !!x && x !== "—")
              .join(" · ");
            return (
              <div className="plb-kid" key={k.profile_id}>
                <span className="plb-kid-av" aria-hidden="true">
                  {initialsOf(k.first_name, k.last_name)}
                </span>
                <div className="plb-kid-body">
                  <div className="plb-kid-name">
                    {k.first_name} {k.last_name}
                  </div>
                  <div className="plb-kid-meta">{meta || "—"}</div>
                  {pos && pos.rank !== null ? (
                    <div className="plb-kid-pos">
                      <span className="plb-kid-rank">
                        #{pos.rank} <span className="plb-kid-total">/ {pos.total}</span>
                      </span>
                      <span className="plb-kid-val">
                        {board === "points"
                          ? `${Math.round(Number(pos.value))} ${t("lb.pointsUnit")}`
                          : `${Number(pos.value)} ${t("lb.days")}`}
                      </span>
                    </div>
                  ) : (
                    <div className="plb-kid-none">{t("plb.pos.notInFilter")}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
