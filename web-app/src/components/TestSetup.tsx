"use client";

// TEST ENGINE (T1) — tri-state topic → nested subtopic picker + the
// instructions consent gate. Dumb component: taxonomy + strings arrive via
// props; the only "logic" is selection bookkeeping. Start submits the
// startTopicTest server action (useActionState) with the selection encoded as
// hidden JSON fields.
//
// Selection contract (matches the start RPC's AND semantics):
//   - nothing selected = whole subject (explained in the UI);
//   - a topic checkbox is tri-state: none / some (only some subtopics) / all;
//   - topic_ids sent = every topic with state != none;
//   - subtopic_ids sent ONLY when at least one topic is partially selected
//     (then fully-selected topics contribute all their subtopics so their
//     tagged questions stay in scope). All-full selections send topics only.
import { useActionState, useMemo, useState } from "react";
import { startTopicTest, type StartTestState } from "@/lib/auth/testActions";

export type SetupSubtopic = { id: string; name: string };
export type SetupTopic = { id: string; name: string; subtopics: SetupSubtopic[] };

type TopicState = "none" | "some" | "all";

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
  // checkedTopics: topics explicitly ticked (self or via all subtopics).
  const [checkedTopics, setCheckedTopics] = useState<Set<string>>(new Set());
  const [checkedSubs, setCheckedSubs] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  function topicState(tp: SetupTopic): TopicState {
    if (checkedTopics.has(tp.id)) return "all";
    if (tp.subtopics.length === 0) return "none";
    const n = tp.subtopics.filter((s) => checkedSubs.has(s.id)).length;
    if (n === 0) return "none";
    return n === tp.subtopics.length ? "all" : "some";
  }

  function toggleTopic(tp: SetupTopic) {
    const st = topicState(tp);
    const nextTopics = new Set(checkedTopics);
    const nextSubs = new Set(checkedSubs);
    if (st === "all") {
      // uncheck everything under it
      nextTopics.delete(tp.id);
      for (const s of tp.subtopics) nextSubs.delete(s.id);
    } else {
      // none/some → full
      nextTopics.add(tp.id);
      for (const s of tp.subtopics) nextSubs.add(s.id);
    }
    setCheckedTopics(nextTopics);
    setCheckedSubs(nextSubs);
  }

  function toggleSub(tp: SetupTopic, subId: string) {
    const nextSubs = new Set(checkedSubs);
    if (nextSubs.has(subId)) nextSubs.delete(subId);
    else nextSubs.add(subId);
    // Explicit topic tick follows the subtopic set (tri-state is derived).
    const nextTopics = new Set(checkedTopics);
    const allOn = tp.subtopics.every((s) => nextSubs.has(s.id));
    if (allOn) nextTopics.add(tp.id);
    else nextTopics.delete(tp.id);
    setCheckedTopics(nextTopics);
    setCheckedSubs(nextSubs);
  }

  function selectAll() {
    setCheckedTopics(new Set(topics.map((tp) => tp.id)));
    setCheckedSubs(new Set(topics.flatMap((tp) => tp.subtopics.map((s) => s.id))));
  }
  function clearAll() {
    setCheckedTopics(new Set());
    setCheckedSubs(new Set());
  }

  const { topicIds, subtopicIds, selectedCount } = useMemo(() => {
    const sel = topics
      .map((tp) => ({ tp, st: topicState(tp) }))
      .filter(({ st }) => st !== "none");
    const anyPartial = sel.some(({ st }) => st === "some");
    let tIds = sel.map(({ tp }) => tp.id);
    let sIds: string[] = [];
    if (anyPartial) {
      sIds = sel.flatMap(({ tp, st }) =>
        st === "some"
          ? tp.subtopics.filter((s) => checkedSubs.has(s.id)).map((s) => s.id)
          : tp.subtopics.map((s) => s.id),
      );
    }
    // Stay inside the server caps: an over-large narrowing quietly widens to
    // the topic (then subject) scope instead of erroring the child.
    if (sIds.length > 100) sIds = [];
    if (tIds.length > 50) {
      tIds = [];
      sIds = [];
    }
    return { topicIds: tIds, subtopicIds: sIds, selectedCount: sel.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, checkedTopics, checkedSubs]);

  const wholeSubject = selectedCount === 0;

  return (
    <form action={action}>
      <input type="hidden" name="subject_id" value={subjectId} />
      <input type="hidden" name="topic_ids" value={JSON.stringify(topicIds)} />
      <input type="hidden" name="subtopic_ids" value={JSON.stringify(subtopicIds)} />

      {/* ---- Topic picker ---- */}
      <h3 className="arena-section-h">{tt("test.setup.topicsTitle")}</h3>
      <div className="arena-panel tst-topics">
        <p className="arena-muted" style={{ margin: "0 0 14px" }}>
          {tt("test.setup.topicsHint")}
        </p>
        {topics.length === 0 ? (
          <p className="arena-muted" style={{ margin: 0 }}>
            {tt("test.setup.noTopics")}
          </p>
        ) : (
          <>
            <div className="tst-topics-actions">
              <button type="button" className="arena-chip" onClick={selectAll}>
                {tt("test.setup.selectAll")}
              </button>
              <button type="button" className="arena-chip" onClick={clearAll}>
                {tt("test.setup.clearAll")}
              </button>
              <span className="tst-topics-count mono">
                {wholeSubject
                  ? tt("test.setup.wholeSubject")
                  : tt("test.setup.selectedCount").replace("{n}", String(selectedCount))}
              </span>
            </div>
            <ul className="tst-topic-list">
              {topics.map((tp) => {
                const st = topicState(tp);
                const isOpen = open.has(tp.id);
                return (
                  <li key={tp.id} className="tst-topic">
                    <div className="tst-topic-row">
                      <label className="tst-check">
                        <input
                          type="checkbox"
                          checked={st === "all"}
                          ref={(el) => {
                            if (el) el.indeterminate = st === "some";
                          }}
                          onChange={() => toggleTopic(tp)}
                        />
                        <span className={`tst-box ${st}`} aria-hidden />
                        <span className="tst-topic-name">{tp.name}</span>
                      </label>
                      {tp.subtopics.length > 0 && (
                        <button
                          type="button"
                          className="tst-expand"
                          aria-expanded={isOpen}
                          onClick={() =>
                            setOpen((p) => {
                              const n = new Set(p);
                              if (n.has(tp.id)) n.delete(tp.id);
                              else n.add(tp.id);
                              return n;
                            })
                          }
                        >
                          <span className={`tst-caret${isOpen ? " open" : ""}`} aria-hidden>
                            ▾
                          </span>
                          <span className="mono">{tp.subtopics.length}</span>
                        </button>
                      )}
                    </div>
                    {isOpen && tp.subtopics.length > 0 && (
                      <ul className="tst-sub-list">
                        {tp.subtopics.map((s) => (
                          <li key={s.id}>
                            <label className="tst-check">
                              <input
                                type="checkbox"
                                checked={checkedSubs.has(s.id)}
                                onChange={() => toggleSub(tp, s.id)}
                              />
                              <span
                                className={`tst-box ${checkedSubs.has(s.id) ? "all" : "none"}`}
                                aria-hidden
                              />
                              <span>{s.name}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* ---- Instructions gate ---- */}
      <h3 className="arena-section-h" style={{ marginTop: 26 }}>
        {tt("test.setup.rulesTitle")}
      </h3>
      <div className="arena-panel">
        <div className="tst-facts">
          <span className="tst-fact mono">{tt("test.setup.qCount")}</span>
          <span className="tst-fact mono">{tt("test.setup.duration")}</span>
        </div>
        <ul className="tst-rules">
          <li>{tt("test.setup.rule1")}</li>
          <li>{tt("test.setup.rule2")}</li>
          <li>{tt("test.setup.rule3")}</li>
          <li>{tt("test.setup.rule4")}</li>
        </ul>
        <p className="tst-scoring">
          <b>{tt("test.setup.scoringTitle")}:</b> {tt("test.setup.scoring")}
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

        {state?.error && (
          <p className="arena-error" style={{ marginTop: 12 }}>
            {state.error}
          </p>
        )}

        <div style={{ marginTop: 18 }}>
          <button className="arena-btn" type="submit" disabled={!consent || pending}>
            {pending ? tt("test.setup.starting") : tt("test.setup.start")}
          </button>
        </div>
      </div>
    </form>
  );
}
