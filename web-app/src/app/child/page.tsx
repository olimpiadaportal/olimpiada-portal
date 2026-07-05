import Link from "next/link";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isGiveawayActive } from "@/lib/paymentMode";
import { ChildNewsPanel } from "@/components/ChildNewsPanel";
import { startPractice } from "@/lib/auth/childActions";

export default async function ChildDashboard() {
  const child = await requireChild();
  const t = await getT();
  const supabase = await createClient();
  // Round 11: during an active giveaway window the whole platform is free —
  // the DB RPCs (start_practice_attempt) already allow it; this mirrors it.
  const giveawayActive = await isGiveawayActive();

  const { data: student } = await supabase
    .from("students")
    .select("first_name, access_status")
    .eq("profile_id", child.profileId)
    .maybeSingle();
  const access = (student as any)?.access_status ?? "inactive";
  const hasAccess = access === "trialing" || access === "active" || giveawayActive;

  // Subjects this child is subscribed to (for practice).
  const { data: subs } = await supabase
    .from("child_subscriptions")
    .select("status, subscription_subjects(subjects(id, name))")
    .eq("student_profile_id", child.profileId)
    .in("status", ["trialing", "active"]);
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
  if (giveawayActive) {
    const { data: priced } = await supabase
      .from("subjects_pricing")
      .select("subjects(id, name)")
      .eq("status", "active");
    for (const row of (priced ?? []) as any[]) {
      if (row.subjects) subjMap.set(row.subjects.id, row.subjects.name);
    }
  }
  const subjects = Array.from(subjMap, ([id, name]) => ({ id, name }));

  // Graded attempts → real mini-stats + per-subject strength (no fabrication;
  // all 0 / empty until the child actually finishes rounds).
  const { data: attempts } = await supabase
    .from("test_attempts")
    .select("id, kind, score, max_score, subject_id, subjects(name)")
    .eq("student_profile_id", child.profileId)
    .eq("status", "graded")
    .order("submitted_at", { ascending: false })
    .limit(200);
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
                <form action={startPractice}>
                  <input type="hidden" name="subject_id" value={subjects[0].id} />
                  <button className="arena-btn" type="submit">
                    {t("arena.startRound")}
                  </button>
                </form>
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
          <span className="arena-rank-num mono">—</span>
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
              &nbsp;·&nbsp; <b>{t("arena.tickerToday")}</b> · OlimpIQ &nbsp;·&nbsp;{" "}
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

      {/* ---- Two-column: rounds + subject strength ---- */}
      <section className="arena-cols">
        <div>
          <h3 className="arena-section-h">{t("arena.todaysRounds")}</h3>
          {hasAccess && subjects.length > 0 ? (
            <div className="arena-panel">
              {subjects.map((s) => (
                <div className="arena-round" key={s.id}>
                  <span className="arena-round-icon">{s.name.trim()[0]?.toUpperCase() ?? "?"}</span>
                  <div className="arena-round-body">
                    <div className="arena-round-title">{s.name}</div>
                    <div className="arena-round-meta">25 {t("arena.questionsShort")}</div>
                  </div>
                  <form action={startPractice}>
                    <input type="hidden" name="subject_id" value={s.id} />
                    <button className="arena-btn arena-btn-sm" type="submit">
                      {t("arena.go")}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <div className="arena-panel arena-muted">
              {hasAccess ? t("child.noSubjects") : t("child.lockedNote")}
            </div>
          )}

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
        </div>

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

          {/* ---- News ---- */}
          <h3 className="arena-section-h" style={{ marginTop: 26 }}>
            {t("news.latest")}
          </h3>
          <ChildNewsPanel />
        </div>
      </section>
    </>
  );
}
