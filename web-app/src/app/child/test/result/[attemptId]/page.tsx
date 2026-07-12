import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { isUuid } from "@/lib/uuid";
import { ChildNavActive } from "@/components/ChildNav";

type TopicRow = { topic_id: string | null; name: string | null; total: number; correct: number };
type ResultPayload = {
  attempt_id: string;
  status: string;
  score: number | null;
  max: number | null;
  submitted_at: string | null;
  results: { question_id: string; is_correct: boolean | null }[];
  topics: TopicRow[];
};

// TEST ENGINE (T2) — results: big score + per-topic breakdown + time context.
// submit_test_attempt is idempotent: for a graded attempt it simply returns
// the stored result; for an in-progress attempt PAST its deadline it finalizes
// (the timer-zero fallback when the client never got to auto-submit). A live
// in-progress attempt is sent back to the player — visiting this URL early
// must never end a running test.
export default async function TestResultPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const child = await requireChild();
  const { attemptId } = await params;
  if (!isUuid(attemptId)) redirect("/child/test");

  const [t, supabase] = await Promise.all([getT(), createClient()]);

  // Own row under RLS; also provides the time context the RPC payload lacks.
  const { data: att } = await supabase
    .from("test_attempts")
    .select(
      "id, kind, status, deadline_at, started_at, submitted_at, duration_seconds, subjects(name)",
    )
    .eq("id", attemptId)
    .eq("student_profile_id", child.profileId)
    .maybeSingle();
  if (!att) notFound();
  const a = att as any;
  // Both timed kinds share this page since migration 047; olympiad attempts
  // exit back to the olympiads list instead of the test home.
  if (a.kind !== "test" && a.kind !== "olympiad") notFound();
  const isOlympiad = a.kind === "olympiad";
  const homeHref = isOlympiad ? "/child/olympiads" : "/child/test";

  if (a.status === "in_progress") {
    const live = a.deadline_at && new Date(a.deadline_at).getTime() > Date.now();
    if (live) redirect(`/child/test/run/${attemptId}`);
  } else if (a.status !== "graded") {
    redirect(`${homeHref}?notice=closed`);
  }

  const { data, error } = await supabase.rpc("submit_test_attempt", {
    p_attempt_id: attemptId,
    p_answers: null,
  });
  if (error || !data) redirect(`${homeHref}?err=1`);
  const result = data as ResultPayload;

  const score = Math.round(Number(result.score ?? 0));
  const max = Math.round(Number(result.max ?? 0));
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;

  // Time context: minutes actually used, clamped to the test duration.
  const durationMin = Math.round(Number(a.duration_seconds ?? 1500) / 60);
  let usedMin: number | null = null;
  const endIso = a.submitted_at ?? result.submitted_at;
  if (a.started_at && endIso) {
    const ms = new Date(endIso).getTime() - new Date(a.started_at).getTime();
    if (Number.isFinite(ms) && ms >= 0) {
      usedMin = Math.min(Math.max(1, Math.round(ms / 60_000)), durationMin);
    }
  }

  const topics = (result.topics ?? []).filter((tp) => tp.total > 0);

  return (
    <>
      {/* Kind-aware nav highlight (shared route — see ChildNav). */}
      <ChildNavActive href={homeHref} />
      <section style={{ marginBottom: 22 }}>
        <p className="arena-eyebrow">{t("test.result.eyebrow")}</p>
        {/* Olympiad sessions use olympiad wording, not test wording. */}
        <h1>{isOlympiad ? t("test.result.olympiadTitle") : t("test.result.title")}</h1>
        <p className="arena-muted" style={{ margin: "8px 0 0" }}>
          {isOlympiad && (
            <>
              <span>{t("test.run.olympiad")}</span>
              {a.subjects?.name ? <span aria-hidden="true"> · </span> : null}
            </>
          )}
          {a.subjects?.name ?? ""}
        </p>
      </section>

      <div className="arena-result" style={{ maxWidth: 640 }}>
        <div className="arena-result-score mono">
          {score}
          <small> / {max}</small>
        </div>
        <p className="tst-percent mono">{pct}%</p>
        {usedMin !== null && (
          <p className="arena-muted" style={{ margin: "6px 0 0" }}>
            {t("test.result.timeSpent")}: {usedMin} {t("test.result.minutes")} / {durationMin}{" "}
            {t("test.result.minutes")}
          </p>
        )}
        <div className="tst-result-actions">
          <Link className="arena-btn" href={`/child/test/review/${attemptId}`}>
            {t("test.result.review")}
          </Link>
          <Link className="arena-btn-ghost" href={homeHref}>
            {isOlympiad ? t("test.result.backToOlympiads") : t("test.result.newTest")}
          </Link>
        </div>
      </div>

      <h3 className="arena-section-h" style={{ marginTop: 30 }}>
        {t("test.result.topics")}
      </h3>
      <div className="arena-panel" style={{ maxWidth: 640 }}>
        {topics.length === 0 ? (
          <p className="arena-muted" style={{ margin: 0 }}>
            {t("test.result.noTopics")}
          </p>
        ) : (
          topics.map((tp, i) => {
            const tpct = tp.total > 0 ? Math.round((tp.correct / tp.total) * 100) : 0;
            return (
              <div className="arena-strength" key={tp.topic_id ?? `t${i}`}>
                <div className="arena-strength-top">
                  <span>{tp.name ?? "—"}</span>
                  <span className="pct mono">
                    {tp.correct}/{tp.total}
                  </span>
                </div>
                <div className="arena-bar">
                  <i style={{ width: `${tpct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
