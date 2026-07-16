import Link from "next/link";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { getChildSubjectAccess } from "@/lib/childSubjects";
import { subjectLabel } from "@/lib/subjectLabel";
import { startDailyRound } from "@/lib/auth/testActions";

// DAILY ROUNDS (migration 056) — test home restructured into three sections:
//   1. Today's Rounds  — one RATED daily round per accessible subject (timed
//      25q/25min; ONE attempt per day — DB-enforced, the UI only mirrors it);
//   2. Previous Day's Rounds — unlimited UNTIMED practice replays of
//      yesterday's stored rounds (never affect points/streak);
//   3. Recent Rounds — the attempt history (daily + practice, rated badge).
// The old topic/subtopic setup flow stays as the per-subject PRACTICE entry
// (start_topic_test_attempt is untimed/unrated since migration 057).
//
// "Already attempted today" detection: own kind='daily' is_rated attempts with
// started_at inside today's Baku-local day (UTC+4, fixed — Azerbaijan has no
// DST). Any such attempt (graded/expired/canceled OR a lazily-expired
// in_progress) consumes the day; a live in_progress one resumes. The RPC's
// unique_violation is additionally mapped to ?err=already as a race fallback.
//
// Round 21 pre-flight: get_my_round_readiness() (migration 065) says, per
// active subject for THIS student's grade, whether today's round exists or the
// pool can generate one. A not-ready subject shows an honest disabled state
// instead of a Start button that click-bounces into ?err=nopool. The ?err=
// notices stay as the race fallback (midnight/term changes between render and
// click); a missing readiness row (no grade / transient error) fails OPEN to
// the Start button — startDailyRound remains the real gate.

const BAKU_OFFSET_MS = 4 * 3_600_000; // Asia/Baku is UTC+4 year-round.
const DAY_MS = 86_400_000;

type DailyAttempt = {
  id: string;
  subject_id: string;
  status: string;
  score: number | null;
  max_score: number | null;
  deadline_at: string | null;
  started_at: string;
};

type RoundReadiness = {
  subject_id: string;
  round_exists: boolean;
  attempted: boolean;
  ready: boolean;
};

export default async function TestHomePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; notice?: string }>;
}) {
  const child = await requireChild();
  const [{ err, notice }, t, locale, supabase, accessInfo] = await Promise.all([
    searchParams,
    getT(),
    getLocale(),
    createClient(),
    getChildSubjectAccess(child.profileId),
  ]);
  const { access, hasAccess, subjects } = accessInfo;

  const now = Date.now();
  const todayStartUtc = new Date(
    Math.floor((now + BAKU_OFFSET_MS) / DAY_MS) * DAY_MS - BAKU_OFFSET_MS,
  );

  // Today's rated attempts (per-subject state) + the recent history (own rows
  // under RLS; olympiads live on their own page) + the round-readiness
  // pre-flight (booleans about the caller's own grade only).
  const [{ data: todayRated }, { data: attempts }, { data: readinessRows }] =
    await Promise.all([
      supabase
        .from("test_attempts")
        .select("id, subject_id, status, score, max_score, deadline_at, started_at")
        .eq("student_profile_id", child.profileId)
        .eq("kind", "daily")
        .eq("is_rated", true)
        .gte("started_at", todayStartUtc.toISOString())
        .order("started_at", { ascending: false }),
      supabase
        .from("test_attempts")
        .select(
          "id, kind, is_rated, status, score, max_score, started_at, submitted_at, deadline_at, subjects(code, name)",
        )
        .eq("student_profile_id", child.profileId)
        .in("kind", ["daily", "test"])
        .order("started_at", { ascending: false })
        .limit(10),
      supabase.rpc("get_my_round_readiness"),
    ]);

  // Latest rated attempt per subject decides the card state.
  const ratedBySubject = new Map<string, DailyAttempt>();
  for (const a of (todayRated ?? []) as DailyAttempt[]) {
    if (!ratedBySubject.has(a.subject_id)) ratedBySubject.set(a.subject_id, a);
  }

  const readinessBySubject = new Map<string, RoundReadiness>();
  for (const r of (readinessRows ?? []) as RoundReadiness[]) {
    readinessBySubject.set(r.subject_id, r);
  }

  const recent = (attempts ?? []) as any[];

  const dateFmt = new Intl.DateTimeFormat(
    locale === "az" ? "az-Latn-AZ" : locale === "ru" ? "ru-RU" : "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  );

  const lockedPanel = (
    <div className="arena-locked">
      <strong>{t(`child.locked.${access}`)}</strong>
      <p className="arena-muted" style={{ margin: "6px 0 0" }}>
        {t("child.lockedNote")}
      </p>
    </div>
  );

  return (
    <>
      <section style={{ marginBottom: 26 }}>
        <p className="arena-eyebrow">{t("test.home.eyebrow")}</p>
        <h1>{t("test.home.title")}</h1>
        <p className="arena-muted" style={{ margin: "10px 0 0", maxWidth: 560 }}>
          {t("test.home.sub2")}
        </p>
      </section>

      {notice === "closed" && <div className="tst-notice">{t("test.home.noticeClosed")}</div>}
      {err === "noaccess" && <div className="tst-notice warn">{t("test.err.noAccess")}</div>}
      {err === "nograde" && <div className="tst-notice warn">{t("test.rounds.noGrade")}</div>}
      {err === "nopool" && <div className="tst-notice">{t("test.rounds.noRoundYet")}</div>}
      {err === "already" && <div className="tst-notice">{t("test.rounds.alreadyNote")}</div>}
      {err && !["noaccess", "nograde", "nopool", "already", "noyest"].includes(err) && (
        <div className="tst-notice warn">{t("test.err.generic")}</div>
      )}

      {/* ============ 1) Today's Rounds — RATED, one per subject/day ============ */}
      <h3 className="arena-section-h">{t("test.rounds.today")}</h3>
      {!hasAccess ? (
        lockedPanel
      ) : subjects.length === 0 ? (
        <div className="arena-panel arena-muted">{t("child.noSubjects")}</div>
      ) : (
        <div className="tst-daily-grid">
          {subjects.map((s) => {
            const a = ratedBySubject.get(s.id) ?? null;
            // A live rated attempt resumes; ANY other rated attempt today
            // (graded/expired/canceled/lazily-expired) consumes the day.
            const live =
              a?.status === "in_progress" &&
              !!a.deadline_at &&
              new Date(a.deadline_at).getTime() > now;
            const attempted = !!a && !live;
            // Pre-flight: round can't exist/generate yet → disabled notice
            // instead of a Start that bounces. Missing row = fail open (the
            // start action still guards and maps to ?err= codes).
            const readiness = readinessBySubject.get(s.id);
            const notReady = !!readiness && !readiness.ready;
            const label = subjectLabel(t, s.code, s.name);
            return (
              <div className="tst-daily" key={s.id}>
                <div className="tst-daily-head">
                  <span className="arena-round-icon">
                    {label.trim()[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div className="tst-daily-titles">
                    <div className="arena-round-title">{label}</div>
                    <div className="arena-round-meta">
                      {t("test.rounds.timedBadge")} · {t("test.rounds.rated")}
                    </div>
                  </div>
                </div>
                <div className="tst-daily-actions">
                  {live ? (
                    <Link href={`/child/test/run/${a!.id}`} className="arena-btn arena-btn-sm">
                      {t("test.home.continueCta")}
                    </Link>
                  ) : attempted ? (
                    <>
                      <span className="tst-pill off">{t("test.rounds.attempted")}</span>
                      {a!.status === "graded" && (
                        <Link href={`/child/test/result/${a!.id}`} className="arena-pts mono">
                          {Math.round(Number(a!.score ?? 0))}/
                          {Math.round(Number(a!.max_score ?? 0))}
                        </Link>
                      )}
                    </>
                  ) : notReady ? (
                    <span className="tst-pill off">{t("test.rounds.notReady")}</span>
                  ) : (
                    <form action={startDailyRound}>
                      <input type="hidden" name="subject_id" value={s.id} />
                      <input type="hidden" name="day" value="today" />
                      <button type="submit" className="arena-btn arena-btn-sm">
                        {t("test.rounds.start")}
                      </button>
                    </form>
                  )}
                </div>
                {/* PRACTICE entry — the R19 topic/subtopic setup flow
                    (untimed, unrated since migration 057). */}
                <div className="tst-daily-practice">
                  <Link href={`/child/test/${s.id}`} className="arena-btn-ghost arena-btn-sm">
                    {t("test.rounds.practiceCta")}
                  </Link>
                  <span className="arena-muted">{t("test.rounds.practiceMeta")}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ 2) Previous Day's Rounds — unlimited practice replay ============ */}
      <h3 className="arena-section-h" style={{ marginTop: 26 }}>
        {t("test.rounds.yesterday")}
      </h3>
      {hasAccess && subjects.length > 0 ? (
        <>
          <p className="tst-replay-note">{t("test.rounds.practiceNote")}</p>
          {err === "noyest" && (
            <div className="tst-notice">{t("test.rounds.noYesterday")}</div>
          )}
          <div className="tst-daily-grid">
            {subjects.map((s) => (
              <div className="tst-daily ghost" key={s.id}>
                <div className="tst-daily-head">
                  <span className="arena-round-icon">
                    {subjectLabel(t, s.code, s.name).trim()[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div className="tst-daily-titles">
                    <div className="arena-round-title">{subjectLabel(t, s.code, s.name)}</div>
                    <div className="arena-round-meta">
                      {t("kind.practice")} · {t("test.rounds.practiceMeta")}
                    </div>
                  </div>
                </div>
                <div className="tst-daily-actions">
                  <form action={startDailyRound}>
                    <input type="hidden" name="subject_id" value={s.id} />
                    <input type="hidden" name="day" value="yesterday" />
                    <button type="submit" className="arena-btn-ghost arena-btn-sm">
                      {t("test.rounds.replay")}
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="arena-panel arena-muted">
          {hasAccess ? t("child.noSubjects") : t("child.lockedNote")}
        </div>
      )}

      {/* ============ 3) Recent Rounds — daily + practice history ============ */}
      <h3 className="arena-section-h" style={{ marginTop: 26 }}>
        {t("test.rounds.recent")}
      </h3>
      <div className="arena-panel">
        {recent.length === 0 ? (
          <p className="arena-muted" style={{ margin: 0 }}>
            {t("test.home.noAttempts")}
          </p>
        ) : (
          recent.map((r) => {
            // Untimed practice attempts have NO deadline — an in_progress one
            // is always resumable; only a timed attempt past its deadline is
            // lazily expired.
            const stale =
              r.status === "in_progress" &&
              r.deadline_at !== null &&
              new Date(r.deadline_at).getTime() <= now;
            const status = stale ? "expired" : r.status;
            const when = r.submitted_at ?? r.started_at;
            const kindLabel = r.kind === "daily" ? t("kind.daily") : t("kind.practice");
            return (
              <div className="arena-round" key={r.id}>
                <div className="arena-round-body">
                  <div className="arena-round-title">
                    {subjectLabel(t, r.subjects?.code, r.subjects?.name)} · {kindLabel}
                    {r.is_rated && (
                      <span className="tst-rated-chip">{t("test.rounds.ratedChip")}</span>
                    )}
                  </div>
                  <div className="arena-round-meta">{when ? dateFmt.format(new Date(when)) : ""}</div>
                </div>
                {status === "graded" ? (
                  <Link href={`/child/test/result/${r.id}`} className="arena-pts mono">
                    {Math.round(Number(r.score ?? 0))}/{Math.round(Number(r.max_score ?? 0))}
                  </Link>
                ) : status === "in_progress" ? (
                  <Link href={`/child/test/run/${r.id}`} className="tst-pill run">
                    {t("test.status.in_progress")}
                  </Link>
                ) : (
                  <span className={`tst-pill ${status === "canceled" ? "off" : "bad"}`}>
                    {t(`test.status.${status === "canceled" ? "canceled" : "expired"}`)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
