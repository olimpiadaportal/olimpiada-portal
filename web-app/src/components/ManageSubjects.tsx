"use client";

// Batch H — edit the subjects covered by an existing child's live subscription.
// Add/remove call the server actions (server-side re-pricing via the subscription
// RPCs); at least one subject must remain. Amounts are never client-set.
import { useActionState, useState } from "react";
import {
  addSubjectAction,
  removeSubjectAction,
  type SubjectEditState,
} from "@/lib/auth/subscriptionService";

type Subj = { id: string; name: string; prices: Record<string, number> };

export function ManageSubjects({
  studentId,
  subjects,
  coveredIds,
  dict,
}: {
  studentId: string;
  subjects: Subj[];
  coveredIds: string[];
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const covered = new Set(coveredIds);
  const current = subjects.filter((s) => covered.has(s.id));
  const available = subjects.filter((s) => !covered.has(s.id));

  const [addState, addAction, adding] = useActionState<SubjectEditState, FormData>(
    addSubjectAction,
    null,
  );
  const [removeState, removeAction, removing] = useActionState<SubjectEditState, FormData>(
    removeSubjectAction,
    null,
  );
  const [toAdd, setToAdd] = useState("");

  return (
    <div className="form" style={{ maxWidth: 560 }}>
      <h2 style={{ marginBottom: 4 }}>{tt("subjedit.title")}</h2>

      <span className="field-label">{tt("subjedit.current")}</span>
      {current.length === 0 ? (
        <p className="muted">{tt("subjedit.none")}</p>
      ) : (
        <ul className="clean">
          {current.map((s) => (
            <li
              key={s.id}
              style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0" }}
            >
              <span>{s.name}</span>
              <form action={removeAction}>
                <input type="hidden" name="student_id" value={studentId} />
                <input type="hidden" name="subject_id" value={s.id} />
                <button
                  type="submit"
                  className="link-danger"
                  disabled={removing || current.length <= 1}
                  title={current.length <= 1 ? tt("subjedit.minOne") : undefined}
                >
                  {tt("subjedit.remove")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {current.length <= 1 && <p className="hint">{tt("subjedit.minOne")}</p>}
      {removeState?.error && <p className="form-error">{removeState.error}</p>}

      {available.length > 0 && (
        <form
          action={addAction}
          style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}
        >
          <input type="hidden" name="student_id" value={studentId} />
          <select
            name="subject_id"
            value={toAdd}
            onChange={(e) => setToAdd(e.target.value)}
            required
          >
            <option value="">{tt("subjedit.addPick")}</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-ghost" disabled={adding || !toAdd}>
            {tt("subjedit.add")}
          </button>
        </form>
      )}
      {addState?.error && <p className="form-error">{addState.error}</p>}
    </div>
  );
}
