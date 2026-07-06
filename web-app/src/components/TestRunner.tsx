"use client";

// TEST ENGINE (T1) — the timed test player. Based on PracticeRunner's dumb
// component structure, extended with: server-synced countdown (ticks locally,
// re-synced from every autosave response — the SERVER deadline is the truth),
// question palette (answered/flagged/unanswered/current, click-to-jump),
// prev/next, flag-for-review, 30s autosave + save-on-navigation, confirmed
// submit/cancel through the shared Modal, beforeunload guard, and timer-zero
// auto-submit (the server keeps a 60s grace). All strings arrive translated
// via the dict; all writes go through the testActions server actions.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import {
  cancelTest,
  saveTestAnswers,
  submitTest,
  type AnswerItem,
} from "@/lib/auth/testActions";

export type TestOption = { option_id: string; text: string };
export type TestQuestion = {
  question_id: string;
  type: string;
  topic_id: string | null;
  body: string;
  prompt: string | null;
  selected_option_ids: string[];
  is_marked: boolean;
  options: TestOption[];
};
export type TestAttemptData = {
  attempt_id: string;
  status: string;
  kind: string;
  subject_id: string;
  deadline_at: string | null;
  duration_seconds: number | null;
  remaining_seconds: number | null;
  score: number | null;
  max_score: number | null;
  questions: TestQuestion[];
};

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const AUTOSAVE_MS = 30_000;

function fmtClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TestRunner({
  attemptId,
  data,
  resumed,
  dict,
}: {
  attemptId: string;
  data: TestAttemptData;
  resumed: boolean;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();
  const questions = data.questions;
  const total = questions.length;

  // ---- answers / flags (rehydrated from the saved rows for TRUE resume) ----
  const [answers, setAnswers] = useState<Record<string, string | null>>(() => {
    const init: Record<string, string | null> = {};
    for (const q of questions) init[q.question_id] = q.selected_option_ids[0] ?? null;
    return init;
  });
  const [flags, setFlags] = useState<Set<string>>(
    () => new Set(questions.filter((q) => q.is_marked).map((q) => q.question_id)),
  );
  const [idx, setIdx] = useState(0);

  // ---- countdown: rendered only after mount (no hydration mismatch); the
  // local deadline is re-synced from every save response. ----
  const [remaining, setRemaining] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);

  // ---- lifecycle guards / autosave bookkeeping (refs: no re-renders) ----
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const flagsRef = useRef(flags);
  flagsRef.current = flags;
  const dirtyRef = useRef<Set<string>>(new Set());
  const savingRef = useRef(false);
  const finishedRef = useRef(false); // submit/cancel completed → guards off
  const submittingRef = useRef(false);
  const spentRef = useRef<Map<string, number>>(new Map());
  const lastSwitchRef = useRef<number>(Date.now());
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [timeUp, setTimeUp] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.question_id]).length,
    [questions, answers],
  );
  const unanswered = total - answeredCount;

  function noteTimeSpent() {
    const now = Date.now();
    const q = questions[idxRef.current];
    if (q) {
      const cur = spentRef.current.get(q.question_id) ?? 0;
      spentRef.current.set(q.question_id, cur + (now - lastSwitchRef.current));
      dirtyRef.current.add(q.question_id);
    }
    lastSwitchRef.current = now;
  }

  const buildItems = useCallback((qids: string[]): AnswerItem[] => {
    return qids
      .map((qid) => {
        const sel = answersRef.current[qid];
        const item: AnswerItem = {
          question_id: qid,
          selected_option_ids: sel ? [sel] : [],
          is_marked: flagsRef.current.has(qid),
        };
        const ms = spentRef.current.get(qid);
        if (ms && ms > 0) item.time_spent_ms = Math.round(ms);
        return item;
      })
      .slice(0, 30);
  }, []);

  // ---- submit (manual confirm + timer-zero / deadline-signal auto path) ----
  const doSubmit = useCallback(async () => {
    if (submittingRef.current || finishedRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitOpen(false);
    try {
      const items = buildItems(questions.map((q) => q.question_id));
      const res = await submitTest(attemptId, items);
      if (res.ok) {
        finishedRef.current = true;
        router.replace(`/child/test/result/${attemptId}`);
        return;
      }
      setFatal(res.error);
    } catch {
      setFatal(tt("test.err.generic"));
    }
    submittingRef.current = false;
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, questions, buildItems, router]);
  const doSubmitRef = useRef(doSubmit);
  doSubmitRef.current = doSubmit;

  // ---- autosave ----
  const flush = useCallback(async () => {
    if (savingRef.current || submittingRef.current || finishedRef.current) return;
    const qids = Array.from(dirtyRef.current);
    if (qids.length === 0) return;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const res = await saveTestAnswers(attemptId, buildItems(qids));
      if (res.ok) {
        for (const q of qids) dirtyRef.current.delete(q);
        if (typeof res.remaining === "number") {
          deadlineRef.current = Date.now() + res.remaining * 1000;
        }
        setSaveState("saved");
      } else if (res.deadline) {
        // Server says time is over → auto-submit (60s grace server-side).
        setTimeUp(true);
        savingRef.current = false;
        void doSubmitRef.current();
        return;
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
    savingRef.current = false;
  }, [attemptId, buildItems]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // ---- mount: start the clock + autosave interval + beforeunload guard ----
  useEffect(() => {
    const initial = Math.max(0, Math.floor(data.remaining_seconds ?? 0));
    deadlineRef.current = Date.now() + initial * 1000;
    setRemaining(initial);

    const tick = window.setInterval(() => {
      if (deadlineRef.current === null) return;
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
    }, 500);
    const saver = window.setInterval(() => void flushRef.current(), AUTOSAVE_MS);

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (finishedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(saver);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 0:00 → auto-submit once ----
  useEffect(() => {
    if (remaining === 0 && !finishedRef.current && !submittingRef.current) {
      setTimeUp(true);
      void doSubmitRef.current();
    }
  }, [remaining]);

  // ---- interactions ----
  function goTo(i: number) {
    if (i < 0 || i >= total || i === idx) return;
    noteTimeSpent();
    setIdx(i);
    void flushRef.current();
  }

  function select(qid: string, oid: string) {
    setAnswers((p) => ({ ...p, [qid]: p[qid] === oid ? null : oid }));
    dirtyRef.current.add(qid);
    setSaveState("idle");
  }

  function toggleFlag(qid: string) {
    setFlags((p) => {
      const n = new Set(p);
      if (n.has(qid)) n.delete(qid);
      else n.add(qid);
      return n;
    });
    dirtyRef.current.add(qid);
    // Persist flags promptly (spec: save on flag change).
    window.setTimeout(() => void flushRef.current(), 0);
  }

  async function doCancel() {
    if (canceling || finishedRef.current) return;
    setCanceling(true);
    try {
      const res = await cancelTest(attemptId);
      if (res.ok) {
        finishedRef.current = true;
        router.replace("/child/test");
        return;
      }
      setFatal(res.error);
    } catch {
      setFatal(tt("test.err.generic"));
    }
    setCanceling(false);
    setCancelOpen(false);
  }

  const q = questions[idx];
  const timerCls =
    remaining !== null && remaining <= 60
      ? " crit"
      : remaining !== null && remaining <= 300
        ? " warn"
        : "";
  const isLast = idx === total - 1;

  return (
    <>
      {/* ---- Top bar: title + save state + timer ---- */}
      <div className="tst-topbar">
        <div className="tst-topbar-left">
          <span className="tst-run-title">{tt("test.run.title")}</span>
          <span className="arena-quiz-count mono">
            {tt("arena.quizQuestion")} {String(idx + 1).padStart(2, "0")} {tt("arena.quizOf")}{" "}
            {String(total).padStart(2, "0")}
          </span>
        </div>
        <div className="tst-topbar-right">
          <span className="tst-savestate" aria-live="polite">
            {saveState === "saving" && tt("test.run.saving")}
            {saveState === "saved" && tt("test.run.saved")}
            {saveState === "error" && <span className="err">{tt("test.run.saveError")}</span>}
          </span>
          <span
            className={`tst-timer mono${timerCls}`}
            title={tt("test.run.timeLeft")}
            aria-label={tt("test.run.timeLeft")}
          >
            {remaining === null ? "--:--" : fmtClock(remaining)}
          </span>
        </div>
      </div>

      {resumed && <div className="tst-notice">{tt("test.run.resumed")}</div>}
      {timeUp && <div className="tst-notice warn">{tt("test.run.timeUp")}</div>}
      {fatal && <p className="arena-error">{fatal}</p>}

      <div className="tst-run-grid">
        {/* ---- Question card ---- */}
        <div>
          {q && (
            <div className="arena-q-card">
              <div className="tst-q-head">
                <div className="arena-q-code mono">Q{String(idx + 1).padStart(2, "0")}</div>
                <button
                  type="button"
                  className={`tst-flag${flags.has(q.question_id) ? " on" : ""}`}
                  aria-pressed={flags.has(q.question_id)}
                  onClick={() => toggleFlag(q.question_id)}
                >
                  ⚑ {flags.has(q.question_id) ? tt("test.run.unflag") : tt("test.run.flag")}
                </button>
              </div>
              <div className="arena-q-body">{q.body}</div>
              {q.prompt && <p className="arena-q-prompt">{q.prompt}</p>}
              <div className="arena-options" role="radiogroup" aria-label={q.body}>
                {q.options.map((o, i) => {
                  const selected = answers[q.question_id] === o.option_id;
                  return (
                    <button
                      type="button"
                      key={o.option_id}
                      role="radio"
                      aria-checked={selected}
                      className={`arena-opt${selected ? " selected" : ""}`}
                      onClick={() => select(q.question_id, o.option_id)}
                    >
                      <span className="arena-opt-key">{LETTERS[i] ?? i + 1}</span>
                      <span>{o.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="arena-quiz-actions">
            <button
              type="button"
              className="arena-btn-ghost"
              disabled={idx === 0 || submitting}
              onClick={() => goTo(idx - 1)}
            >
              {tt("arena.quizPrev")}
            </button>
            {!isLast ? (
              <button
                type="button"
                className="arena-btn"
                disabled={submitting}
                onClick={() => goTo(idx + 1)}
              >
                {tt("test.run.next")}
              </button>
            ) : (
              <button
                type="button"
                className="arena-btn"
                disabled={submitting}
                onClick={() => setSubmitOpen(true)}
              >
                {submitting ? tt("test.run.submitting") : tt("test.run.submit")}
              </button>
            )}
          </div>
        </div>

        {/* ---- Palette + actions sidebar ---- */}
        <aside className="tst-side">
          <div className="arena-panel">
            <p className="tst-side-h">{tt("test.run.palette")}</p>
            <div className="tst-palette">
              {questions.map((qq, i) => {
                const cls = [
                  "tst-cell",
                  i === idx ? "current" : "",
                  answers[qq.question_id] ? "answered" : "",
                  flags.has(qq.question_id) ? "flagged" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={qq.question_id}
                    type="button"
                    className={cls}
                    aria-current={i === idx ? "true" : undefined}
                    onClick={() => goTo(i)}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="tst-legend">
              <span>
                <i className="tst-dot answered" /> {tt("test.run.answered")}
              </span>
              <span>
                <i className="tst-dot flagged" /> {tt("test.run.flagged")}
              </span>
              <span>
                <i className="tst-dot" /> {tt("test.run.unanswered")}
              </span>
              <span>
                <i className="tst-dot current" /> {tt("test.run.current")}
              </span>
            </div>
          </div>
          <div className="tst-side-actions">
            <button
              type="button"
              className="arena-btn"
              disabled={submitting}
              onClick={() => setSubmitOpen(true)}
            >
              {submitting ? tt("test.run.submitting") : tt("test.run.submit")}
            </button>
            <button
              type="button"
              className="arena-btn-ghost tst-cancel"
              disabled={canceling || submitting}
              onClick={() => setCancelOpen(true)}
            >
              {tt("test.run.cancel")}
            </button>
          </div>
        </aside>
      </div>

      {/* ---- Submit confirm ---- */}
      <Modal
        isOpen={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title={tt("test.run.submitTitle")}
        closeLabel={tt("test.run.back")}
      >
        <p className="modal-message">
          {tt("test.run.submitMsg").replace("{n}", String(unanswered))}
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setSubmitOpen(false)}
            disabled={submitting}
          >
            {tt("test.run.back")}
          </button>
          <button type="button" className="btn" onClick={() => void doSubmit()} disabled={submitting}>
            {submitting ? tt("test.run.submitting") : tt("test.run.submitConfirm")}
          </button>
        </div>
      </Modal>

      {/* ---- Cancel confirm (counts for nothing) ---- */}
      <Modal
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={tt("test.run.cancelTitle")}
        closeLabel={tt("test.run.keepGoing")}
      >
        <p className="modal-message">{tt("test.run.cancelMsg")}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCancelOpen(false)}
            disabled={canceling}
          >
            {tt("test.run.keepGoing")}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => void doCancel()}
            disabled={canceling}
          >
            {canceling ? tt("test.run.canceling") : tt("test.run.cancelConfirm")}
          </button>
        </div>
      </Modal>
    </>
  );
}
