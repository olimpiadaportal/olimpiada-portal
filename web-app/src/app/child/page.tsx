import Link from "next/link";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { isGiveawayActive } from "@/lib/paymentMode";
import { getChildFreeAccessActive } from "@/lib/freeAccess";

export default async function ChildDashboard() {
  const child = await requireChild();
  const t = await getT();
  const supabase = await createClient();

  // M24: these reads are independent of each other — one concurrent batch
  // instead of five serial awaits. (The free-subjects merge below stays
  // sequential: it genuinely depends on freeNow.)
  const [
    giveawayActive,
    freeAccessActive,
    { data: student },
    { data: subs },
    { data: attempts },
    leaderboardOn,
    { data: lbRank },
    { data: lbRankAllTime },
    { data: streakStatus },
  ] = await Promise.all([
      // Round 11: during an active giveaway window the whole platform is free —
      // the DB RPCs (start_practice_attempt) already allow it; this mirrors it.
      isGiveawayActive(),
      // Round 12: a per-parent/child free-access interval also grants full access.
      getChildFreeAccessActive(),
      supabase
        .from("students")
        .select("first_name, access_status")
        .eq("profile_id", child.profileId)
        .maybeSingle(),
      // Subjects this child is subscribed to (for practice).
      supabase
        .from("child_subscriptions")
        .select("status, subscription_subjects(subjects(id, name))")
        .eq("student_profile_id", child.profileId)
        .in("status", ["trialing", "active"]),
      // Graded attempts → real mini-stats + per-subject strength (no
      // fabrication; all 0 / empty until the child actually finishes rounds).
      supabase
        .from("test_attempts")
        .select("id, kind, score, max_score, subject_id, subjects(name)")
        .eq("student_profile_id", child.profileId)
        .eq("status", "graded")
        .order("submitted_at", { ascending: false })
        .limit(200),
      // L-quick: leaderboard feature gate + GLOBAL rank (this-month for the
      // quick-look card, ALL-TIME for the hero rank panel) + streak, read
      // through the child's OWN RLS-scoped RPCs (never service role). All
      // resolve to { data: null } on any error, so the cards degrade to the
      // encouraging "not ranked yet" state and never throw.
      isFeatureEnabled("leaderboard"),
      supabase.rpc("get_my_leaderboard_rank", {
        p_board: "points",
        p_scope: "global",
        p_scope_id: null,
        p_period: "month",
      }),
      supabase.rpc("get_my_leaderboard_rank", {
        p_board: "points",
        p_scope: "global",
        p_scope_id: null,
        p_period: "all_time",
      }),
      supabase.rpc("get_streak_status"),
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
  // Giveaway: every subject with ACTIVE pricing becomes practicable, merged
  // over the subscribed set. RLS note: subjects_pricing active rows are
  // readable by everyone (public pricing page policy), so the child's
  // request-scoped client can query it directly.
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

  const graded = (attempts ?? []) as any[];

  let totalScore = 0;
  let totalMax = 0;
  const perSubject = new Map<string, { score: number; max: number }>();
  for (const a of graded) {
    const sc = Number(a.score ?? 0);
    const mx = Number(a.max_score ?? 0);
    totalScore += sc;
    totalMax += mx;
    if (a.subject_id) {
      const cur = perSubject.get(a.subject_id) ?? { score: 0, max: 0 };
      cur.score += sc;
      cur.max += mx;
      perSubject.set(a.subject_id, cur);
    }
  }
  const points = Math.round(totalScore);
  const accuracy = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const roundsCount = graded.length;

  const strength = subjects.map((s) => {
    const d = perSubject.get(s.id);
    const pct = d && d.max > 0 ? Math.round((d.score / d.max) * 100) : 0;
    return { ...s, pct };
  });

  const recent = graded.slice(0, 5);

  // L-quick — real leaderboard snapshot for the home card (safe on null/error).
  const lbMe = (lbRank ?? null) as
    | { rank: number | null; total: number; value: number }
    | null;
  // Hero rank panel — global ALL-TIME points rank (Round 21: replaces the old
  // static "—" placeholder; honest fallback when not ranked yet).
  const lbAllTime = (lbRankAllTime ?? null) as
    | { rank: number | null; total: number; value: number }
    | null;
  const streakInfo = (streakStatus ?? null) as
    | { current: number; best: number }
    | null;
  const lbRanked = !!lbMe && lbMe.rank !== null;
  const allTimeRanked = !!lbAllTime && lbAllTime.rank !== null;
  const lbMonthPoints = lbMe ? Math.round(Number(lbMe.value ?? 0)) : 0;
  const streakCurrent = Number(streakInfo?.current ?? 0) || 0;
  const streakBest = Number(streakInfo?.best ?? 0) || 0;

  // ---- Leaderboard quick-look (L-quick) ----
  // Gated by the `leaderboard` feature flag (hidden entirely when off).
  // Real this-month GLOBAL rank + month points + streak from the child's
  // own RLS-scoped RPCs; encouraging fallback when not ranked yet.
  const lbqCard = (
    <section className="lbq-card">
      <div className="lbq-head">
        <p className="arena-eyebrow" style={{ margin: 0 }}>
          {"\u{1F3C6}"} {t("plb.title")}
        </p>
        <Link className="lbq-link" href="/child/leaderboard">
          {t("plb.seeFull")} →
        </Link>
      </div>
      {lbRanked ? (
        <div className="lbq-stats">
          <div className="lbq-stat">
            <div className="lbq-val mono">
              #{lbMe!.rank}
              <span className="lbq-total"> / {lbMe!.total}</span>
            </div>
            <div className="lbq-key">{t("plb.rankThisMonth")}</div>
          </div>
          <div className="lbq-stat">
            <div className="lbq-val mono">{lbMonthPoints}</div>
            <div className="lbq-key">{t("plb.points")}</div>
          </div>
          <div className="lbq-stat">
            <div className="lbq-val mono">🔥 {streakCurrent}</div>
            <div className="lbq-key">
              {t("plb.streak")} · {t("plb.best")} {streakBest}
            </div>
          </div>
        </div>
      ) : (
        <div className="lbq-none-row">
          <p className="lbq-none">{t("plb.notRanked")}</p>
          <div className="lbq-stat">
            <div className="lbq-val mono">🔥 {streakCurrent}</div>
            <div className="lbq-key">
              {t("plb.streak")} · {t("plb.best")} {streakBest}
            </div>
          </div>
        </div>
      )}
    </section>
  );

  // ---- Subject strength panel (right column / full width when lbq is off) ----
  const strengthPanel = (
    <div>
      <h3 className="arena-section-h">{t("arena.subjectStrength")}</h3>
      <div className="arena-panel">
        {strength.length === 0 ? (
          <p className="arena-muted" style={{ margin: 0 }}>
            {t("arena.noStrength")}
          </p>
        ) : (
          strength.map((s) => (
            <div className="arena-strength" key={s.id}>
              <div className="arena-strength-top">
                <span>{s.name}</span>
                <span className="pct">{s.pct}%</span>
              </div>
              <div className="arena-bar">
                <i style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* ---- Hero ---- */}
      <section className="arena-hero">
        <div className="arena-hero-left">
          <p className="arena-eyebrow">
            {t("arena.heroEyebrow")}
            {giveawayActive && <span className="gvw-chip">{t("gvw.chip")}</span>}
          </p>
          <h1>
            {t("child.hello")}, {(student as any)?.first_name ?? ""} — {t("arena.heroTitle")}
          </h1>
          <div className="arena-hero-cta">
            {hasAccess && subjects.length > 0 ? (
              <>
                {/* Land on the tests tab — today's RATED daily rounds live
                    there (one per subject/day; the topic-picker flow is now
                    the untimed practice entry). */}
                <Link className="arena-btn" href="/child/test">
                  {t("arena.startRound")}
                </Link>
                <Link className="arena-btn-ghost" href="/child/leaderboard">
                  {t("arena.join")}
                </Link>
              </>
            ) : (
              <Link className="arena-btn-ghost" href="/child/leaderboard">
                {t("arena.nav.rank")}
              </Link>
            )}
          </div>
        </div>

        <div className="arena-rank-panel">
          <p className="arena-eyebrow">{t("arena.rankLabel")}</p>
          {/* Real global ALL-TIME points rank; "—" + note until first ranked. */}
          <span className="arena-rank-num mono">
            {allTimeRanked ? `#${lbAllTime!.rank}` : "—"}
          </span>
          {!allTimeRanked && (
            <p className="arena-muted" style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
              {t("plb.notRanked")}
            </p>
          )}
          <div className="arena-ministats">
            <div className="arena-ministat">
              <div className="v mono">{points}</div>
              <div className="k">{t("arena.statPoints")}</div>
            </div>
            <div className="arena-ministat">
              <div className="v mono">{accuracy}%</div>
              <div className="k">{t("arena.statAccuracy")}</div>
            </div>
            <div className="arena-ministat">
              <div className="v mono">{roundsCount}</div>
              <div className="k">{t("arena.statRounds")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Ticker (decorative) ---- */}
      <div className="arena-ticker" aria-hidden>
        <div className="arena-ticker-track">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i}>
              <b>{t("arena.tickerLive")}</b> · {t("arena.statPoints")} {points} &nbsp;·&nbsp;{" "}
              {t("arena.statAccuracy")} {accuracy}% &nbsp;·&nbsp; {t("arena.statRounds")} {roundsCount}{" "}
              &nbsp;·&nbsp; <b>{t("arena.tickerToday")}</b> · OlympIQ &nbsp;·&nbsp;{" "}
            </span>
          ))}
        </div>
      </div>

      {!hasAccess && (
        <div className="arena-locked" style={{ marginBottom: 26 }}>
          <strong>{t(`child.locked.${access}`)}</strong>
          <p className="arena-muted" style={{ margin: "6px 0 0" }}>
            {t("child.lockedNote")}
          </p>
        </div>
      )}

      {/* ---- Two-column row: monthly ranking | subject strength ----
          (Round 21 redesign: the old "today's rounds" list and the news panel
          left the dashboard — rounds live on /child/test, news on /child/news.)
          When the leaderboard flag is off the strength panel takes the full
          width instead of leaving an empty grid cell. */}
      {leaderboardOn ? (
        <section className="arena-cols">
          {lbqCard}
          {strengthPanel}
        </section>
      ) : (
        strengthPanel
      )}

      {/* ---- Recent rounds — full-width history strip ---- */}
      {recent.length > 0 && (
        <>
          <h3 className="arena-section-h" style={{ marginTop: 26 }}>
            {t("arena.recentRounds")}
          </h3>
          <div className="arena-panel">
            {recent.map((r) => (
              <div className="arena-round" key={r.id}>
                <div className="arena-round-body">
                  <div className="arena-round-title">
                    {r.subjects?.name ?? "—"} · {t(`kind.${r.kind}`)}
                  </div>
                </div>
                <span className="arena-pts mono">
                  {Math.round(Number(r.score ?? 0))}/{Math.round(Number(r.max_score ?? 0))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
