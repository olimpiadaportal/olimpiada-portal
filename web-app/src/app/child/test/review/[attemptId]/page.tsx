import Link from "next/link";
import { redirect } from "next/navigation";
import { requireChild } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/i18n/server";
import { isUuid } from "@/lib/uuid";

type ReviewOption = { option_id: string; text: string | null; is_correct: boolean };
type ReviewQuestion = {
  question_id: string;
  body: string | null;
  prompt: string | null;
  is_correct: boolean | null;
  selected_option_ids: string[];
  explanation: string | null;
  options: ReviewOption[];
};
type ReviewPayload = {
  attempt_id: string;
  score: number | null;
  max: number | null;
  questions: ReviewQuestion[];
};

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// TEST ENGINE (T2) — post-grading answer review. get_test_review is the ONLY
// RPC that reveals answer keys, and only for the owner's GRADED attempt (it
// raises otherwise → we bounce to the test home). Pure server rendering.
export default async function TestReviewPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  await requireChild();
  const { attemptId } = await params;
  if (!isUuid(attemptId)) redirect("/child/test");

  const [locale, t, supabase] = await Promise.all([getLocale(), getT(), createClient()]);

  const { data, error } = await supabase.rpc("get_test_review", {
    p_attempt_id: attemptId,
    p_locale: locale,
  });
  if (error || !data) redirect("/child/test");
  const payload = data as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { questions?: unknown }).questions)
  ) {
    redirect("/child/test");
  }
  const review = payload as ReviewPayload;

  const score = Math.round(Number(review.score ?? 0));
  const max = Math.round(Number(review.max ?? 0));

  return (
    <>
      <section style={{ marginBottom: 22 }}>
        <p className="arena-eyebrow">{t("test.result.eyebrow")}</p>
        <h1>{t("test.review.title")}</h1>
        <p className="arena-muted" style={{ margin: "8px 0 0" }}>
          <span className="mono">
            {score}/{max}
          </span>
        </p>
      </section>

      <div className="tst-review-list">
        {review.questions.map((q, qi) => {
          const selected = new Set(q.selected_option_ids ?? []);
          const skipped = selected.size === 0;
          const state = skipped ? "skipped" : q.is_correct ? "correct" : "wrong";
          return (
            <div className={`arena-q-card tst-review-q ${state}`} key={q.question_id}>
              <div className="tst-q-head">
                <div className="arena-q-code mono">Q{String(qi + 1).padStart(2, "0")}</div>
                <span className={`tst-pill ${state === "correct" ? "ok" : state === "wrong" ? "bad" : "off"}`}>
                  {t(`test.review.${state}`)}
                </span>
              </div>
              <div className="arena-q-body">{q.body}</div>
              {q.prompt && <p className="arena-q-prompt">{q.prompt}</p>}
              <div className="tst-review-opts">
                {q.options.map((o, i) => {
                  const isSel = selected.has(o.option_id);
                  const cls = [
                    "tst-review-opt",
                    o.is_correct ? "correct" : "",
                    isSel && !o.is_correct ? "wrong" : "",
                    isSel ? "chosen" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div className={cls} key={o.option_id}>
                      <span className="arena-opt-key">{LETTERS[i] ?? i + 1}</span>
                      <span className="tst-review-opt-text">{o.text}</span>
                      <span className="tst-review-tags mono">
                        {isSel && <em>{t("test.review.your")}</em>}
                        {o.is_correct && <b>✓ {t("test.review.correctAnswer")}</b>}
                      </span>
                    </div>
                  );
                })}
              </div>
              {q.explanation && (
                <div className="tst-explain">
                  <b>{t("test.review.explanation")}</b>
                  <p>{q.explanation}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="arena-btn" href={`/child/test/result/${attemptId}`}>
          {t("test.review.backToResult")}
        </Link>
        <Link className="arena-btn-ghost" href="/child/test">
          {t("test.result.newTest")}
        </Link>
      </div>
    </>
  );
}
