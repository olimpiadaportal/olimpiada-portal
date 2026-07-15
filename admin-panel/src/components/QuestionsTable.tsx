"use client";

import { useActionState, useState } from "react";
import {
  bulkAssignTopic,
  bulkDeleteQuestions,
  bulkTransitionQuestions,
  transitionQuestion,
} from "@/lib/admin/questions";
import {
  EditQuestionModal,
  rowTransitions,
  statusPill,
} from "@/components/EditQuestionModal";
import type { QuestionTaxonomy } from "@/lib/admin/question-options";

export type QuestionRow = {
  id: string;
  subject: string;
  grade: string;
  lang: string;
  topic: string;
  // Pre-localized Rüb label ("2-ci rüb"); needsTerm marks a NULL term (legacy
  // "needs review" — excluded from daily-round generation).
  term: string;
  needsTerm: boolean;
  body: string;
  status: string;
};

export type Taxonomy = {
  subjects: { id: string; name: string }[];
  topics: { id: string; subject_id: string; name: string }[];
  subtopics: { id: string; topic_id: string; name: string }[];
};

// Lifecycle actions a user may apply in bulk; perm gates which appear.
// Three-state model: publish / reject / to_review.
// (Per-row quick actions + status pill styling now live in EditQuestionModal —
// rowTransitions / statusPill — shared between the table rows and the modal.)
const ACTIONS: { action: string; perm?: string }[] = [
  { action: "publish", perm: "content.publish" },
  { action: "reject", perm: "content.review" },
  { action: "to_review", perm: "content.review" },
];

export function QuestionsTable({
  rows,
  taxonomy,
  dict,
  isAdmin,
  perms,
  editorOptions,
  editorTaxonomy,
}: {
  rows: QuestionRow[];
  taxonomy: Taxonomy;
  dict: Record<string, string>;
  isAdmin: boolean;
  perms: string[];
  // Inputs for the edit modal's QuestionForm (same objects the create modal
  // uses): subject/grade selects + exam topic/subtopic cascade.
  editorOptions: Record<string, { value: string; label: string }[]>;
  editorTaxonomy: QuestionTaxonomy;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [action, setAction] = useState("");
  // Round 22: editing happens in a modal on this page (no edit route). One
  // modal instance serves every row; the Edit button sets the target id.
  const [editId, setEditId] = useState<string | null>(null);
  // Bulk transition returns { updated, skipped } so we can show real feedback
  // (the owner reported bulk actions felt like silent no-ops).
  const [bulkState, bulkAction] = useActionState(bulkTransitionQuestions, null);
  const [showAssign, setShowAssign] = useState(false);
  const [aSubject, setASubject] = useState("");
  const [aTopic, setATopic] = useState("");
  const [aSubtopic, setASubtopic] = useState("");

  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const ids = Array.from(sel).join(",");
  const can = (p: string) => isAdmin || perms.includes(p);
  const allowed = ACTIONS.filter((a) => !a.perm || can(a.perm!));

  const topicsForSubject = taxonomy.topics.filter((t) => t.subject_id === aSubject);
  const subtopicsForTopic = taxonomy.subtopics.filter((s) => s.topic_id === aTopic);

  function toggle(id: string) {
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSel(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
  }

  return (
    <section className="card">
      {sel.size > 0 && (
        <>
          <div className="bulk-bar">
            <span className="bulk-count">
              {sel.size} {tt("qbulk.selected")}
            </span>
            <form
              className="bulk-group"
              action={bulkAction}
              onSubmit={(e) => {
                if (!action || !confirm(tt("qbulk.confirmAction"))) e.preventDefault();
              }}
            >
              <input type="hidden" name="ids" value={ids} />
              <select name="__action" value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="">{tt("qbulk.chooseAction")}</option>
                {allowed.map((a) => (
                  <option key={a.action} value={a.action}>
                    {tt(`qact.${a.action}`)}
                  </option>
                ))}
              </select>
              <button className="btn-ghost" type="submit" disabled={!action}>
                {tt("qbulk.apply")}
              </button>
            </form>
            <button
              type="button"
              className={`btn-ghost${showAssign ? " active" : ""}`}
              aria-expanded={showAssign}
              onClick={() => setShowAssign((v) => !v)}
            >
              {tt("qbulk.assignTopic")}
            </button>
            <span className="bulk-spacer" />
            {isAdmin && (
              <form
                action={bulkDeleteQuestions}
                onSubmit={(e) => {
                  if (!confirm(tt("qbulk.confirmDelete"))) e.preventDefault();
                }}
              >
                <input type="hidden" name="ids" value={ids} />
                <button className="link-danger" type="submit">
                  {tt("action.delete")}
                </button>
              </form>
            )}
          </div>

          {showAssign && (
            <form
              className="bulk-assign"
              action={bulkAssignTopic}
              onSubmit={(e) => {
                if (!aTopic || !confirm(tt("qbulk.confirmAssign"))) e.preventDefault();
              }}
            >
              <span className="bulk-assign-label">{tt("qbulk.assignTopic")}</span>
              <input type="hidden" name="ids" value={ids} />
              <select
                name="subject_id"
                value={aSubject}
                onChange={(e) => {
                  setASubject(e.target.value);
                  setATopic("");
                  setASubtopic("");
                }}
              >
                <option value="">{tt("qfield.subject")}</option>
                {taxonomy.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                name="topic_id"
                value={aTopic}
                disabled={!aSubject}
                onChange={(e) => {
                  setATopic(e.target.value);
                  setASubtopic("");
                }}
              >
                <option value="">{tt("qfield.topic")}</option>
                {topicsForSubject.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.name}
                  </option>
                ))}
              </select>
              <select
                name="subtopic_id"
                value={aSubtopic}
                disabled={!aTopic}
                onChange={(e) => setASubtopic(e.target.value)}
              >
                <option value="">{tt("qfield.subtopic")} ({tt("qbulk.optional")})</option>
                {subtopicsForTopic.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
              <button className="btn-ghost" type="submit" disabled={!aTopic}>
                {tt("qbulk.assign")}
              </button>
            </form>
          )}
        </>
      )}

      {bulkState && (
        <p className="form-ok" role="status">
          {tt("qbulk.applied")}{" "}
          {tt("qbulk.updated").replace("{n}", String(bulkState.updated))} ·{" "}
          {tt("qbulk.skipped").replace("{m}", String(bulkState.skipped))}
        </p>
      )}

      <div className="table-wrap">
        <table className="table table-compact">
          <thead>
            <tr>
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={toggleAll}
                  aria-label={tt("qbulk.selectAll")}
                />
              </th>
              <th>{tt("qfield.subject")}</th>
              <th className="col-narrow">{tt("qfield.grade")}</th>
              <th className="col-narrow">{tt("qfield.language")}</th>
              <th>{tt("qfield.topic")}</th>
              <th className="col-narrow">{tt("qfield.term")}</th>
              <th>{tt("qfield.bodyAz")}</th>
              <th className="col-narrow">{tt("qfield.status")}</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  {tt("questions.none")}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="col-check">
                  <input
                    type="checkbox"
                    checked={sel.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label="select"
                  />
                </td>
                <td>{r.subject}</td>
                <td className="col-narrow">{r.grade}</td>
                <td className="col-narrow">{r.lang}</td>
                <td className="cell-topic" title={r.topic}>
                  {r.topic}
                </td>
                <td className="col-narrow">
                  {r.needsTerm ? (
                    <span className="pill pill-sm pill-warn">{r.term}</span>
                  ) : (
                    r.term
                  )}
                </td>
                <td className="cell-body" title={r.body}>
                  {r.body}
                </td>
                <td className="col-narrow">
                  <span className={`pill pill-sm ${statusPill(r.status)}`}>
                    {tt(`qstatus.${r.status}`)}
                  </span>
                </td>
                <td className="row-actions">
                  <span className="qrow-quick">
                    {rowTransitions(r.status, can).map((a) => (
                      <form key={a.action} action={transitionQuestion}>
                        <input type="hidden" name="__id" value={r.id} />
                        <input type="hidden" name="__action" value={a.action} />
                        <button className="btn-ghost btn-xs" type="submit">
                          {tt(a.key)}
                        </button>
                      </form>
                    ))}
                  </span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setEditId(r.id)}
                  >
                    {tt("action.edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EditQuestionModal
        id={editId}
        onClose={() => setEditId(null)}
        dict={dict}
        options={editorOptions}
        taxonomy={editorTaxonomy}
        isAdmin={isAdmin}
        perms={perms}
      />
    </section>
  );
}
