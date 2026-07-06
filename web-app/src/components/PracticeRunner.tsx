"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { gradePractice, type GradeState } from "@/lib/auth/childActions";

// L7: exported so the practice page can type the get_practice_attempt RPC
// payload instead of passing `as any`.
export type PracticeOption = { option_id: string; text: string };
export type PracticeQuestion = {
  question_id: string;
  type: string;
  body: string;
  prompt: string | null;
  options: PracticeOption[];
};
export type PracticeAttemptData = {
  attempt_id: string;
  status: string;
  questions: PracticeQuestion[];
};

type Q = PracticeQuestion;
type Data = PracticeAttemptData;

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// Arena-styled round runner: one question at a time, progress bar, A/B/C/D
// option buttons (lime selected). Grading logic (gradePractice + the answers
// JSON contract) is unchanged. No difficulty tags (removed from the platform).
export function PracticeRunner({
  attemptId,
  data,
  dict,
}: {
  attemptId: string;
  data: Data;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<GradeState, FormData>(
    gradePractice,
    null,
  );
  const [answers, setAnswers] = useState<Record<string, Set<string>>>({});
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const questions = data.questions;
  const total = questions.length;

  function toggle(qid: string, oid: string, multi: boolean) {
    setAnswers((p) => {
      const cur = new Set(p[qid] ?? []);
      if (multi) {
        if (cur.has(oid)) cur.delete(oid);
        else cur.add(oid);
      } else {
        cur.clear();
        cur.add(oid);
      }
      return { ...p, [qid]: cur };
    });
  }

  if (state?.ok) {
    return (
      <div className="arena-result">
        <p className="arena-eyebrow">{tt("practice.result")}</p>
        <div className="arena-result-score mono">
          {state.score}
          <small> / {state.max}</small>
        </div>
        <p style={{ marginTop: 20 }}>
          <Link className="arena-btn" href="/child">
            {tt("practice.back")}
          </Link>
        </p>
      </div>
    );
  }

  const answersJson = JSON.stringify(
    questions.map((q) => ({
      question_id: q.question_id,
      selected_option_ids: Array.from(answers[q.question_id] ?? []),
    })),
  );

  const q = questions[step];
  const multi = q?.type === "multiple_choice";
  const isLast = step === total - 1;
  const progress = total > 0 ? Math.round(((step + 1) / total) * 100) : 0;

  return (
    <form action={action} ref={formRef}>
      <input type="hidden" name="attempt_id" value={attemptId} />
      <input type="hidden" name="answers" value={answersJson} />

      <div className="arena-quiz-top">
        <span>{tt("practice.title")}</span>
        <span className="arena-quiz-count mono">
          {tt("arena.quizQuestion")} {String(step + 1).padStart(2, "0")} {tt("arena.quizOf")}{" "}
          {String(total).padStart(2, "0")}
        </span>
      </div>
      <div className="arena-progress">
        <i style={{ width: `${progress}%` }} />
      </div>

      {q && (
        <div className="arena-q-card">
          <div className="arena-q-code mono">Q{String(step + 1).padStart(2, "0")}</div>
          <div className="arena-q-body">{q.body}</div>
          {q.prompt && <p className="arena-q-prompt">{q.prompt}</p>}
          <div className="arena-options">
            {q.options.map((o, i) => {
              const selected = (answers[q.question_id] ?? new Set()).has(o.option_id);
              return (
                <button
                  type="button"
                  key={o.option_id}
                  className={`arena-opt${selected ? " selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => toggle(q.question_id, o.option_id, multi)}
                >
                  <span className="arena-opt-key">{LETTERS[i] ?? i + 1}</span>
                  <span>{o.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {state?.error && <p className="arena-error" style={{ marginTop: 14 }}>{tt("practice.error")}</p>}

      <div className="arena-quiz-actions">
        <button
          type="button"
          className="arena-btn-ghost"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          {tt("arena.quizPrev")}
        </button>
        {isLast ? (
          <button className="arena-btn" type="submit" disabled={pending}>
            {pending ? tt("practice.submitting") : tt("practice.submit")}
          </button>
        ) : (
          <button
            type="button"
            className="arena-btn"
            onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
          >
            {tt("arena.quizConfirm")}
          </button>
        )}
      </div>
    </form>
  );
}
