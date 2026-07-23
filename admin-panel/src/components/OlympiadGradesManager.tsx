"use client";

// Grades & Pools manager on the package EDIT page (Round 34). Shows every
// target grade with its REAL published pool count; a grade is only ever ADDED
// together with its validated question file (per-grade creation-only import),
// and REMOVED through the guarded RPC — the server blocks removal while any
// purchase entitles that grade and archives (never deletes) the pool.
import { useActionState, useState } from "react";
import {
  addOlympiadPackageGrade,
  removeOlympiadPackageGradeAction,
  type OlympiadGradeState,
} from "@/lib/admin/olympiad";
import { ActionButton } from "@/components/ActionButton";
import {
  parseBulkFile,
  validateBulkRowsClient,
  type ClientTypeRule,
  type RowIssue,
} from "@/lib/bulk-client";

type GradeRow = { id: string; name: string; level: number; questions: number };
type Opt = { value: string; label: string };

export function OlympiadGradesManager({
  dict,
  packageId,
  targetGrades,
  addableGrades,
  typeRules,
}: {
  dict: Record<string, string>;
  packageId: string;
  targetGrades: GradeRow[];
  /** Grades NOT yet targeted (candidates for the add form). */
  addableGrades: Opt[];
  typeRules: ClientTypeRule[];
}) {
  const tt = (k: string) => dict[k] ?? k;

  const [addState, addAction, addPending] = useActionState<OlympiadGradeState, FormData>(
    addOlympiadPackageGrade,
    null,
  );
  const [rmState, rmAction, rmPending] = useActionState<OlympiadGradeState, FormData>(
    removeOlympiadPackageGradeAction,
    null,
  );
  // Scope the remove spinner to the ONE row being removed.
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [addGrade, setAddGrade] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [rowIssues, setRowIssues] = useState<RowIssue[]>([]);
  const [itemCount, setItemCount] = useState(0);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileName("");
    setFileError("");
    setRowIssues([]);
    setItemCount(0);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const parsed = await parseBulkFile(file, tt);
    if ("error" in parsed) {
      setFileError(parsed.error);
      return;
    }
    setRowIssues(validateBulkRowsClient(parsed.items, tt, typeRules, "olympiad"));
    setItemCount(parsed.items.length);
  }

  const fileReady = fileName !== "" && fileError === "" && rowIssues.length === 0 && itemCount > 0;
  const canAdd = !addPending && addGrade !== "" && fileReady;

  return (
    <div>
      <h3>{tt("oly2.grades")}</h3>
      <p className="hint">{tt("oly2.perGradeNote")}</p>

      <div>
        {targetGrades.map((g) => (
          <div key={g.id} className="oly-grade-row">
            <strong>{g.name}</strong>
            <span className="muted">
              {g.questions} {tt("olyq.col.body").toLowerCase()}
            </span>
            <span className="grow" />
            <form
              action={rmAction}
              onSubmit={() => setRemovingId(g.id)}
            >
              <input type="hidden" name="__id" value={packageId} />
              <input type="hidden" name="grade_id" value={g.id} />
              <ActionButton
                pending={rmPending && removingId === g.id}
                pendingLabel={tt("oly2.removing")}
                className="btn-ghost btn-sm"
                disabled={rmPending || targetGrades.length <= 1}
              >
                {tt("oly2.removeGrade")}
              </ActionButton>
            </form>
          </div>
        ))}
      </div>
      {rmState?.error && <p className="form-error">{rmState.error}</p>}
      {rmState?.ok && <p className="form-ok">{tt("oly2.gradeRemoved")}</p>}

      {addableGrades.length > 0 && (
        <form action={addAction} className="form" style={{ marginTop: 14 }}>
          <input type="hidden" name="__id" value={packageId} />
          <h4>{tt("oly2.addGrade")}</h4>
          <p className="hint">{tt("oly2.addGradeHint")}</p>
          <label className="field">
            <span className="field-label">{tt("oly2.grade")} *</span>
            <select
              name="grade_id"
              value={addGrade}
              required
              onChange={(e) => setAddGrade(e.target.value)}
            >
              <option value="">{tt("manage.select")}</option>
              {addableGrades.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">
              {tt("bulk.fileLabel")}
              <span className="req"> *</span>
            </span>
            <input
              type="file"
              name="file"
              accept="application/json,.json"
              required
              disabled={addPending}
              onChange={(e) => void onFileChange(e)}
            />
          </label>
          {fileName !== "" && <p className="hint">{fileName}</p>}
          {fileError !== "" && <p className="form-error">{fileError}</p>}
          {rowIssues.length > 0 && (
            <div className="bulk-issues" role="alert">
              <span className="bulk-issues-title">{tt("bulk.fileProblems")}</span>{" "}
              — {tt("bulk.fixFile")}
              <ul>
                {rowIssues.map((is, i) => (
                  <li key={i}>
                    {tt("bulk.row")} {is.row}: {is.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {addState?.error && (
            <div>
              <p className="form-error">{addState.error}</p>
              {addState.result && addState.result.errors.length > 0 && (
                <ul className="muted">
                  {addState.result.errors.map((er, i) => (
                    <li key={i}>
                      {tt("bulk.row")} {er.index}: {er.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <ActionButton
            pending={addPending}
            pendingLabel={tt("oly2.adding")}
            disabled={!canAdd}
          >
            {tt("oly2.addGradeBtn")}
          </ActionButton>
        </form>
      )}
    </div>
  );
}
