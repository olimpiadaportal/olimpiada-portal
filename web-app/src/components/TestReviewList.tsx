"use client";

// TEST ENGINE (T2) — client-side filterable answer-review list. The server
// review page (get_test_review, the only RPC that reveals answer keys, owner +
// GRADED only) shapes each question and hands it here already computed; this
// component only adds the FILTER TABS (All · Correct · Wrong · Skipped) and the
// per-state client filtering. The per-question rendering is unchanged from the
// original server markup (states, chosen/correct tags, explanation).
import { useMemo, useState } from "react";
import { QuestionImage } from "@/components/QuestionImage";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export type ReviewState = "correct" | "wrong" | "skipped";

export type ReviewListOption = {
  option_id: string;
  text: string | null;
  is_correct: boolean;
  is_selected: boolean;
};

export type ReviewListQuestion = {
  question_id: string;
  body: string | null;
  prompt: string | null;
  /** Public URL of the question figure (resolved server-side; migration 057). */
  image_url?: string | null;
  state: ReviewState;
  explanation: string | null;
  options: ReviewListOption[];
};

type Filter = "all" | ReviewState;

export function TestReviewList({
  questions,
  dict,
}: {
  questions: ReviewListQuestion[];
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    for (const q of questions) {
      if (q.state === "correct") correct += 1;
      else if (q.state === "wrong") wrong += 1;
      else skipped += 1;
    }
    return { all: questions.length, correct, wrong, skipped };
  }, [questions]);

  const tabs: { id: Filter; labelKey: string; count: number }[] = [
    { id: "all", labelKey: "test.review.filterAll", count: counts.all },
    { id: "correct", labelKey: "test.review.filterCorrect", count: counts.correct },
    { id: "wrong", labelKey: "test.review.filterWrong", count: counts.wrong },
    { id: "skipped", labelKey: "test.review.filterSkipped", count: counts.skipped },
  ];

  // Keep the original numbering: filtering hides cards but the Q-code shows the
  // question's REAL position in the attempt (index into the full list).
  const visible = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => filter === "all" || q.state === filter);

  return (
    <>
      <div className="tst-filter" role="tablist" aria-label={tt("test.review.filterAll")}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            className={`tst-filter-tab${filter === tab.id ? " active" : ""}`}
            onClick={() => setFilter(tab.id)}
          >
            <span>{tt(tab.labelKey)}</span>
            <span className="tst-filter-count mono">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="tst-review-list">
        {visible.map(({ q, i }) => (
          <div className={`arena-q-card tst-review-q ${q.state}`} key={q.question_id}>
            <div className="tst-q-head">
              <div className="arena-q-code mono">Q{String(i + 1).padStart(2, "0")}</div>
              <span
                className={`tst-pill ${
                  q.state === "correct" ? "ok" : q.state === "wrong" ? "bad" : "off"
                }`}
              >
                {tt(`test.review.${q.state}`)}
              </span>
            </div>
            <div className="arena-q-body">{q.body}</div>
            {q.image_url && (
              <QuestionImage
                url={q.image_url}
                alt={tt("test.img.alt")}
                hint={tt("test.img.hint")}
                closeLabel={tt("test.img.close")}
              />
            )}
            {q.prompt && <p className="arena-q-prompt">{q.prompt}</p>}
            <div className="tst-review-opts">
              {q.options.map((o, oi) => {
                const cls = [
                  "tst-review-opt",
                  o.is_correct ? "correct" : "",
                  o.is_selected && !o.is_correct ? "wrong" : "",
                  o.is_selected ? "chosen" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div className={cls} key={o.option_id}>
                    <span className="arena-opt-key">{LETTERS[oi] ?? oi + 1}</span>
                    <span className="tst-review-opt-text">{o.text}</span>
                    <span className="tst-review-tags mono">
                      {o.is_selected && <em>{tt("test.review.your")}</em>}
                      {o.is_correct && <b>✓ {tt("test.review.correctAnswer")}</b>}
                    </span>
                  </div>
                );
              })}
            </div>
            {q.explanation && (
              <div className="tst-explain">
                <b>{tt("test.review.explanation")}</b>
                <p>{q.explanation}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
