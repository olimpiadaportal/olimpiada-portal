import Link from "next/link";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { getChildSubjectAccess } from "@/lib/childSubjects";
import { subjectLabel } from "@/lib/subjectLabel";
import { startDailyRound } from "@/lib/auth/testActions";
import { DailyRoundStart } from "@/components/DailyRoundStart";

// DAILY ROUNDS (Round 38, migration 083) — test home in three sections:
//   1. Today's Rounds  — one RATED daily round per accessible subject (timed
//      25q/25min, PER-STUDENT random set). The day is consumed ONLY by
//      SUBMIT (DB-enforced): a live in_progress attempt resumes; an expired/
//      abandoned one costs nothing and the next Start draws a FRESH set.
//   2. Previous Day's Rounds — unlimited UNTIMED practice on the student's
//      LOCKED yesterday set (own submitted set → a peer's set → generated);
//      never affects points/percentage/streak.
//   3. Recent Rounds — the attempt history (daily + practice, rated badge).
// The old topic/subtopic setup flow stays as the per-subject PRACTICE entry —
// but once today's round is SUBMITTED the card dims and the practice CTA
// shows the "already completed today" alert instead of navigating.
//
// Completed detection: a GRADED own kind='daily' is_rated attempt started
// inside today's Baku-local day (UTC+4, fixed — Azerbaijan has no DST).
// Non-graded attempts never lock the card. The RPC's unique_violation is
// mapped to ?err=already as the race fallback; startDailyRound stays the
// real gate for access/pool errors (?err= notices).

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
  // under RLS; olympiads live on their own page).
  const [{ data: todayRated }, { data: attempts }] =
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
    ]);

  // Card state (Round 42): ONLY a graded attempt consumes the day; rounds are
  // UNTIMED, so ANY open in_progress attempt resumes (Continue) until it is
  // submitted; expired/abandoned/canceled leave Start available.
  const gradedBySubject = new Map<string, DailyAttempt>();
  const liveBySubject = new Map<string, DailyAttempt>();
  for (const a of (todayRated ?? []) as DailyAttempt[]) {
    if (a.status === "graded") {
      if (!gradedBySubject.has(a.subject_id)) gradedBySubject.set(a.subject_id, a);
    } else if (a.status === "in_progress") {
      if (!liveBySubject.has(a.subject_id)) liveBySubject.set(a.subject_id, a);
    }
  }

  const recent = (attempts ?? []) as any[];

  const dateFmt = new Intl.DateTimeFormat(
    locale === "az" ? "az-Latn-AZ" : locale === "ru" ? "ru-RU" : "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  );

  // Rules-gate strings for the fresh-round Başla button (Round 43). Built here
  // so the client island stays i18n-free; facts reuse the shared test keys.
  const roundStartDict = {
    start: t("test.rounds.start"),
    rulesTitle: t("test.rounds.rulesTitle"),
    factQuestions: t("test.setup.qCount"),
    factNoLimit: t("test.setup.noLimit"),
    factRated: t("test.rounds.rated"),
    ruleRated: t("test.rounds.rulesRated"),
    ruleOnce: t("test.rounds.rulesOnce"),
    ruleNoLimit: t("test.rounds.rulesNoLimit"),
    ruleSaved: t("test.rounds.rulesSaved"),
    consent: t("test.setup.consent"),
    cancel: t("profile.cancel"),
  };

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
      {err === "already" && <div className="tst-notice">{t("test.rounds.usedToday")}</div>}
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
            const done = gradedBySubject.get(s.id) ?? null;
            const live = done ? null : liveBySubject.get(s.id) ?? null;
            const label = subjectLabel(t, s.code, s.name);
            return (
              <div className={`tst-daily${done ? " done" : ""}`} key={s.id}>
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
                  {done ? (
                    <>
                      <span className="tst-pill off">{t("test.rounds.attempted")}</span>
                      <Link href={`/child/test/result/${done.id}`} className="arena-pts mono">
                        {Math.round(Number(done.score ?? 0))}/
                        {Math.round(Number(done.max_score ?? 0))}
                      </Link>
                    </>
                  ) : live ? (
                    <Link href={`/child/test/run/${live.id}`} className="arena-btn arena-btn-sm">
                      {t("test.home.continueCta")}
                    </Link>
                  ) : (
                    // Round 43: fresh Başla opens the rules + consent gate; the
                    // confirm submits startDailyRound (day="today"). No topic
                    // selection anymore.
                    <DailyRoundStart subjectId={s.id} dict={roundStartDict} />
                  )}
                </div>
                {/* Round 43: a used-up day shows the "come back tomorrow" note
                    (the practice CTA was removed from the today cards). */}
                {done && (
                  <div className="tst-daily-used">{t("test.rounds.usedToday")}</div>
                )}
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
