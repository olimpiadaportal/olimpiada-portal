"use client";

import Link from "next/link";
import { useState } from "react";
import {
  bulkAssignTopic,
  bulkDeleteQuestions,
  bulkTransitionQuestions,
} from "@/lib/admin/questions";

export type QuestionRow = {
  id: string;
  subject: string;
  grade: string;
  lang: string;
  type: string;
  body: string;
  status: string;
};

export type Taxonomy = {
  subjects: { id: string; name: string }[];
  topics: { id: string; subject_id: string; name: string }[];
  subtopics: { id: string; topic_id: string; name: string }[];
};

// Lifecycle actions a user may apply in bulk; perm gates which appear.
const ACTIONS: { action: string; perm?: string }[] = [
  { action: "submit" },
  { action: "approve", perm: "content.review" },
  { action: "reject", perm: "content.review" },
  { action: "publish", perm: "content.publish" },
  { action: "unpublish", perm: "content.publish" },
  { action: "archive", perm: "content.archive" },
];

function statusPill(s: string): string {
  if (s === "published") return "pill-ok";
  if (s === "archived" || s === "rejected") return "pill-warn";
  return "pill-muted";
}

export function QuestionsTable({
  rows,
  taxonomy,
  dict,
  isAdmin,
  perms,
}: {
  rows: QuestionRow[];
  taxonomy: Taxonomy;
  dict: Record<string, string>;
  isAdmin: boolean;
  perms: string[];
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [action, setAction] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [aSubject, setASubject] = useState("");
  const [aTopic, setATopic] = useState("");
  const [aSubtopic, setASubtopic] = useState("");

  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const ids = Array.from(sel).join(",");
  const allowed = ACTIONS.filter((a) => !a.perm || isAdmin || perms.includes(a.perm));

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
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted">
              {sel.size} {tt("qbulk.selected")}
            </span>
            <form
              action={bulkTransitionQuestions}
              onSubmit={(e) => {
                if (!action || !confirm(tt("qbulk.confirmAction"))) e.preventDefault();
              }}
              style={{ display: "flex", gap: 8, alignItems: "center" }}
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
              className="btn-ghost"
              onClick={() => setShowAssign((v) => !v)}
            >
              {tt("qbulk.assignTopic")}
            </button>
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
              action={bulkAssignTopic}
              onSubmit={(e) => {
                if (!aTopic || !confirm(tt("qbulk.confirmAssign"))) e.preventDefault();
              }}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 10,
              }}
            >
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
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 32 }}>
              <input
                type="checkbox"
                checked={allOnPage}
                onChange={toggleAll}
                aria-label={tt("qbulk.selectAll")}
              />
            </th>
            <th>{tt("qfield.subject")}</th>
            <th>{tt("qfield.grade")}</th>
            <th>{tt("qfield.language")}</th>
            <th>{tt("qfield.type")}</th>
            <th>{tt("qfield.bodyAz")}</th>
            <th>{tt("qfield.status")}</th>
            <th aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                {tt("questions.none")}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <input
                  type="checkbox"
                  checked={sel.has(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label="select"
                />
              </td>
              <td>{r.subject}</td>
              <td>{r.grade}</td>
              <td>{r.lang}</td>
              <td>{r.type}</td>
              <td>{r.body}</td>
              <td>
                <span className={`pill ${statusPill(r.status)}`}>
                  {tt(`qstatus.${r.status}`)}
                </span>
              </td>
              <td className="row-actions">
                <Link href={`/questions/${r.id}/edit`}>{tt("action.edit")}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
