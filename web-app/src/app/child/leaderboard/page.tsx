import Link from "next/link";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { getChildSubjectAccess } from "@/lib/childSubjects";

// L1 — REAL leaderboard consuming the live DB engine (migration 039) through
// the child's own authenticated client (SECURITY DEFINER RPCs; NOT service
// role). Everything is server-rendered: board/scope/period come from
// searchParams and are validated against server-side whitelists — the client
// never fetches or aggregates anything.
//
// searchParams contract (all optional, all whitelist-validated):
//   ?board=points|streak      (default points; streak is GLOBAL-only)
//   ?scope=global|subject|grade|city|school   (points only; default global;
//          a scope is offered ONLY when the child actually has that id)
//   ?period=month|all         (points only; default month; all → 'all_time')
//   ?subject=<uuid>           (only honored when it is one of the child's own
//          subjects; defaults to the first subject)

type Board = "points" | "streak";
type Scope = "global" | "subject" | "grade" | "city" | "school";
type PeriodUrl = "month" | "all";

type LbRow = {
  rank: number;
  display_name: string | null; // null → anonymized (render lb.anon + anon_tag)
  anon_tag: string | null;
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

  // The child's OWN scope ids: subjects via the shared resolver, grade/city/
  // school from their students row (RLS lets a child read its own row).
  const [{ data: student }, subjAccess] = await Promise.all([
    supabase
      .from("students")
      .select("grade_id, district_id, school_id")
      .eq("profile_id", child.profileId)
      .maybeSingle(),
    getChildSubjectAccess(child.profileId),
  ]);
  const subjects = subjAccess.subjects;
  const gradeId: string | null = (student as any)?.grade_id ?? null;
  const cityId: string | null = (student as any)?.district_id ?? null;
  const schoolId: string | null = (student as any)?.school_id ?? null;

  // ---- server-side whitelists (never pass raw client strings to the RPC) ----
  const board: Board = raw.board === "streak" ? "streak" : "points";
  const periodUrl: PeriodUrl = raw.period === "all" ? "all" : "month";
  // A scope tab exists ONLY when the child has the corresponding id.
  const scopeTabs: { key: Scope; id: string | null }[] = [
    { key: "global", id: null },
    ...(subjects.length > 0 ? [{ key: "subject" as Scope, id: null }] : []),
    ...(gradeId ? [{ key: "grade" as Scope, id: gradeId }] : []),
    ...(cityId ? [{ key: "city" as Scope, id: cityId }] : []),
    ...(schoolId ? [{ key: "school" as Scope, id: schoolId }] : []),
  ];
  const requestedScope: Scope =
    scopeTabs.find((s) => s.key === raw.scope)?.key ?? "global";
  // The STREAK board is GLOBAL-ONLY — the RPC rejects any other scope, so we
  // never even build one.
  const scope: Scope = board === "streak" ? "global" : requestedScope;
  const subjectId =
    subjects.find((s) => s.id === raw.subject)?.id ?? subjects[0]?.id ?? null;
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
  const defaultSubject = subjects[0]?.id ?? null;
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

          {/* Subject picker chips (only when several subjects). */}
          {scope === "subject" && subjects.length > 1 && (
            <div className="arena-chips lb-subchips" role="group" aria-label={t("lb.scope.subject")}>
              {subjects.map((s) => (
                <Link
                  key={s.id}
                  className={`arena-chip${subjectId === s.id ? " active" : ""}`}
                  href={href({ ...cur, subject: s.id })}
                >
                  {s.name}
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

      {/* Top-50 board */}
      <div className="arena-panel" style={{ padding: 8 }}>
        {rows.length === 0 ? (
          <p className="arena-muted" style={{ margin: 0, padding: 16 }}>
            {t(emptyKey)}
          </p>
        ) : (
          <table className="arena-table">
            <thead>
              <tr>
                <th>{t("lb.colRank")}</th>
                <th>{t("lb.colStudent")}</th>
                <th className="num">
                  {board === "points" ? t("lb.colPoints") : t("lb.colStreak")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name =
                  r.display_name && r.display_name.trim()
                    ? r.display_name
                    : `${t("lb.anon")} •${r.anon_tag ?? "0000"}`;
                return (
                  <tr key={r.rank} className={r.is_self ? "me" : undefined}>
                    <td className="arena-rank-cell">
                      {r.rank <= 3 ? (
                        <span className="lb-medal" aria-label={String(r.rank)}>
                          {MEDALS[r.rank - 1]}
                        </span>
                      ) : (
                        String(r.rank).padStart(2, "0")
                      )}
                    </td>
                    <td>
                      <span className="arena-part-name">{name}</span>
                      {r.is_self && (
                        <span className="arena-pts"> · {t("lb.you")}</span>
                      )}
                    </td>
                    <td className="num arena-pts">{fmtValue(r.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
