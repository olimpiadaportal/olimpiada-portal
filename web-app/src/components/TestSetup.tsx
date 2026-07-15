"use client";

// TEST ENGINE (T1) — topic → subtopic picker + the instructions consent gate.
// Owner fix (2026-07): Topic AND Subtopic are MANDATORY before starting — the
// old tri-state multi-select ("nothing = whole subject") is retired in favor
// of two single-select dropdowns:
//   - Topic is always required;
//   - Subtopic is required WHEN the chosen topic has subtopics (a topic with
//     no subtopics may start on the topic alone);
//   - changing the Topic resets the chosen Subtopic.
// Start stays disabled until the selection (and the consent tick) is complete;
// a click on the disabled button (or an Enter-key submit) surfaces a trilingual
// warning and highlights the missing field(s). Client checks are UX only —
// startTopicTest re-enforces the same rule server-side.
// Dumb component: taxonomy + strings arrive via props; Start submits the
// startTopicTest server action (useActionState) with the selection encoded as
// hidden JSON fields (arrays of exactly one id, matching the RPC contract).
import { useActionState, useState } from "react";
import { startTopicTest, type StartTestState } from "@/lib/auth/testActions";

export type SetupSubtopic = { id: string; name: string };
export type SetupTopic = { id: string; name: string; subtopics: SetupSubtopic[] };

export function TestSetup({
  subjectId,
  topics,
  dict,
}: {
  subjectId: string;
  topics: SetupTopic[];
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<StartTestState, FormData>(
    startTopicTest,
    null,
  );
  const [topicId, setTopicId] = useState("");
  const [subId, setSubId] = useState("");
  const [consent, setConsent] = useState(false);
  // Set when the child tries to start with an incomplete selection; cleared as
  // soon as the selection becomes valid (computed below, not stored stale).
  const [warned, setWarned] = useState(false);

  const topic = topics.find((tp) => tp.id === topicId) ?? null;
  const hasSubs = (topic?.subtopics.length ?? 0) > 0;
  // Valid = topic chosen AND (subtopic chosen OR the topic has no subtopics).
  const selectionValid = topicId !== "" && (!hasSubs || subId !== "");

  const showWarn = warned && !selectionValid;
  const topicInvalid = showWarn && topicId === "";
  const subInvalid = showWarn && topicId !== "" && hasSubs && subId === "";

  const startDisabled = pending || !consent || !selectionValid;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        // Enter-key / programmatic submits take the same gate as the button.
        if (!selectionValid) {
          e.preventDefault();
          setWarned(true);
        }
      }}
    >
      <input type="hidden" name="subject_id" value={subjectId} />
      <input type="hidden" name="topic_ids" value={JSON.stringify(topicId ? [topicId] : [])} />
      <input type="hidden" name="subtopic_ids" value={JSON.stringify(subId ? [subId] : [])} />

      {/* ---- Topic + subtopic picker (both mandatory) ---- */}
      <h3 className="arena-section-h">{tt("test.setup.topicsTitle")}</h3>
      <div className="arena-panel tst-topics">
        <p className="arena-muted" style={{ margin: "0 0 14px" }}>
          {tt("test.setup.pickHint")}
        </p>
        {topics.length === 0 ? (
          <p className="arena-muted" style={{ margin: 0 }}>
            {tt("test.setup.noTopics")}
          </p>
        ) : (
          <div style={{ display: "grid", gap: 14, maxWidth: 480 }}>
            <div className="arena-field">
              <label className="arena-label" htmlFor="tst-topic">
                {tt("test.setup.topic")}
              </label>
              <select
                id="tst-topic"
                className="arena-input"
                value={topicId}
                aria-invalid={topicInvalid || undefined}
                style={{
                  width: "100%",
                  ...(topicInvalid ? { borderColor: "var(--red)" } : null),
                }}
                onChange={(e) => {
                  setTopicId(e.target.value);
                  // Changing the topic always resets the chosen subtopic.
                  setSubId("");
                }}
              >
                <option value="">{tt("test.setup.topicPh")}</option>
                {topics.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="arena-field">
              <label className="arena-label" htmlFor="tst-subtopic">
                {tt("test.setup.subtopic")}
              </label>
              <select
                id="tst-subtopic"
                className="arena-input"
                value={subId}
                disabled={!topic || !hasSubs}
                aria-invalid={subInvalid || undefined}
                style={{
                  width: "100%",
                  ...(subInvalid ? { borderColor: "var(--red)" } : null),
                }}
                onChange={(e) => setSubId(e.target.value)}
              >
                <option value="">
                  {topic && !hasSubs
                    ? tt("test.setup.noSubtopics")
                    : tt("test.setup.subtopicPh")}
                </option>
                {(topic?.subtopics ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {topic && !hasSubs && (
                <p className="arena-muted" style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>
                  {tt("test.setup.noSubtopics")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---- Instructions gate ---- */}
      <h3 className="arena-section-h" style={{ marginTop: 26 }}>
        {tt("test.setup.rulesTitle")}
      </h3>
      <div className="arena-panel">
        {/* Practice mode (migration 057): untimed, never rated. */}
        <div className="tst-facts">
          <span className="tst-fact mono">{tt("test.setup.qCount")}</span>
          <span className="tst-fact mono">∞ {tt("test.setup.noLimit")}</span>
          <span className="tst-fact mono">{tt("test.setup.noPoints")}</span>
        </div>
        <ul className="tst-rules">
          <li>{tt("test.setup.rulePractice1")}</li>
          <li>{tt("test.setup.rulePractice2")}</li>
          <li>{tt("test.setup.rule3")}</li>
          <li>{tt("test.setup.rule4")}</li>
        </ul>
        <p className="tst-scoring">
          <b>{tt("test.setup.scoringTitle")}:</b> {tt("test.setup.practiceScoring")}
        </p>

        <label className="tst-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span className={`tst-box ${consent ? "all" : "none"}`} aria-hidden />
          <span>{tt("test.setup.consent")}</span>
        </label>

        {showWarn && (
          <p className="arena-error" role="alert" style={{ marginTop: 12 }}>
            {tt("test.setup.selectWarn")}
          </p>
        )}
        {state?.error && (
          <p className="arena-error" style={{ marginTop: 12 }}>
            {state.error}
          </p>
        )}

        <div style={{ marginTop: 18 }}>
          {/* Disabled buttons swallow clicks, so the wrapper catches the tap
              and surfaces the "select topic + subtopic" warning (the disabled
              button gets pointer-events:none to let the click through). */}
          <span
            style={{ display: "inline-block" }}
            onClick={() => {
              if (!selectionValid) setWarned(true);
            }}
          >
            <button
              className="arena-btn"
              type="submit"
              disabled={startDisabled}
              style={startDisabled ? { pointerEvents: "none" } : undefined}
            >
              {pending ? tt("test.setup.starting") : tt("test.setup.start")}
            </button>
          </span>
        </div>
      </div>
    </form>
  );
}
