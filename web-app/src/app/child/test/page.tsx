import Link from "next/link";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT, getLocale } from "@/i18n/server";
import { getChildSubjectAccess } from "@/lib/childSubjects";

// TEST ENGINE (T1) — test home: the child's available subjects as arena cards
// + recent timed-test attempts (own rows via RLS). An in-progress attempt whose
// server deadline hasn't passed surfaces as a prominent "Continue" card.
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

  // Recent timed tests (kind='test'; own rows under RLS). deadline_at lets us
  // render a still-running attempt as "continue" vs a lazily-expired one.
  const { data: attempts } = await supabase
    .from("test_attempts")
    .select("id, status, score, max_score, started_at, submitted_at, deadline_at, subjects(name)")
    .eq("student_profile_id", child.profileId)
    .eq("kind", "test")
    .order("started_at", { ascending: false })
    .limit(15);

  const rows = (attempts ?? []) as any[];
  const now = Date.now();
  const live = rows.find(
    (r) => r.status === "in_progress" && r.deadline_at && new Date(r.deadline_at).getTime() > now,
  );
  const recent = rows.filter((r) => r.id !== live?.id).slice(0, 10);

  const dateFmt = new Intl.DateTimeFormat(
    locale === "az" ? "az-Latn-AZ" : locale === "ru" ? "ru-RU" : "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  );

  return (
    <>
      <section style={{ marginBottom: 26 }}>
        <p className="arena-eyebrow">{t("test.home.eyebrow")}</p>
        <h1>{t("test.home.title")}</h1>
        <p className="arena-muted" style={{ margin: "10px 0 0", maxWidth: 560 }}>
          {t("test.home.sub")}
        </p>
      </section>

      {notice === "closed" && <div className="tst-notice">{t("test.home.noticeClosed")}</div>}
      {err === "noaccess" && <div className="tst-notice warn">{t("test.err.noAccess")}</div>}
      {err && err !== "noaccess" && <div className="tst-notice warn">{t("test.err.generic")}</div>}

      {live && (
        <Link href={`/child/test/run/${live.id}`} className="tst-continue">
          <div className="tst-continue-body">
            <strong>{t("test.home.continueTitle")}</strong>
            <span className="arena-muted">
              {live.subjects?.name ?? "—"} · {t("test.home.continueSub")}
            </span>
          </div>
          <span className="arena-btn arena-btn-sm">{t("test.home.continueCta")}</span>
        </Link>
      )}

      <h3 className="arena-section-h">{t("test.home.subjects")}</h3>
      {hasAccess && subjects.length > 0 ? (
        <div className="tst-grid">
          {subjects.map((s) => (
            <Link key={s.id} href={`/child/test/${s.id}`} className="tst-subject">
              <span className="arena-round-icon">{s.name.trim()[0]?.toUpperCase() ?? "?"}</span>
              <div className="tst-subject-body">
                <div className="arena-round-title">{s.name}</div>
                <div className="arena-round-meta">
                  {t("test.setup.qCount")} · {t("test.setup.duration")}
                </div>
              </div>
              <span className="arena-btn arena-btn-sm">{t("arena.go")}</span>
            </Link>
          ))}
        </div>
      ) : hasAccess ? (
        <div className="arena-panel arena-muted">{t("child.noSubjects")}</div>
      ) : (
        // Locked: same "ask your parent" hint style as the dashboard.
        <div className="arena-locked">
          <strong>{t(`child.locked.${access}`)}</strong>
          <p className="arena-muted" style={{ margin: "6px 0 0" }}>
            {t("child.lockedNote")}
          </p>
        </div>
      )}

      <h3 className="arena-section-h" style={{ marginTop: 26 }}>
        {t("test.home.recent")}
      </h3>
      <div className="arena-panel">
        {recent.length === 0 ? (
          <p className="arena-muted" style={{ margin: 0 }}>
            {t("test.home.noAttempts")}
          </p>
        ) : (
          recent.map((r) => {
            const stale =
              r.status === "in_progress" &&
              (!r.deadline_at || new Date(r.deadline_at).getTime() <= now);
            const status = stale ? "expired" : r.status;
            const when = r.submitted_at ?? r.started_at;
            return (
              <div className="arena-round" key={r.id}>
                <div className="arena-round-body">
                  <div className="arena-round-title">{r.subjects?.name ?? "—"}</div>
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
