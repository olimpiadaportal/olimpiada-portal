"use client";

// Bulk question import as a modal (general question bank + olympiad private
// pools). GENERAL mode requires a Subject + Grade (batch-level selects) and a
// JSON file whose rows carry meta.topic + meta.subtopic + meta.term (1..4)
// (bulk import v3); meta.type is optional (single_choice by default) and
// meta.media_asset_id may reference a pre-uploaded question image. OLYMPIAD
// mode asks for the FILE ONLY: the package's own Subject and Grade are applied
// server-side to every imported row (topic/subtopic/term stay optional), and
// the DB accepts pool uploads ONLY while the package is being created — a
// package that already has questions rejects the import. The submit button
// stays disabled until the file passes the client-side pre-checks. Client
// validation is UX only — the SECURITY DEFINER bulk RPCs remain the authority
// (assert_question_type_rules etc.).
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { bulkImportQuestions, type BulkImportState } from "@/lib/admin/questions";
import { bulkImportOlympiadQuestions } from "@/lib/admin/olympiad";
import {
  downloadBulkTemplate,
  parseBulkFile,
  validateBulkRowsClient,
  type ClientTypeRule,
  type RowIssue,
} from "@/lib/bulk-client";

type Opt = { value: string; label: string };

export function BulkUploadModal({
  dict,
  grades,
  subjects,
  packageId,
  typeNames,
  typeRules,
  triggerClassName = "btn-ghost",
}: {
  dict: Record<string, string>;
  // General mode: selectable grade + subject lists (active subjects).
  grades?: Opt[];
  subjects?: Opt[];
  // Olympiad mode: the private pool's package id (subject/grade come from the
  // package row server-side — no selectors on this surface).
  packageId?: string;
  // Active question-type names, for the short reference hint.
  typeNames?: string[];
  // Active question types + their structure rules (options_required /
  // correct_required) for the client-side pre-validation mirror. The server is
  // the authority; this only spares the admin an obviously-broken upload.
  typeRules?: ClientTypeRule[];
  triggerClassName?: string;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();
  const olympiad = Boolean(packageId);
  const mode = olympiad ? ("olympiad" as const) : ("general" as const);
  const rules = typeRules ?? [];

  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [rowIssues, setRowIssues] = useState<RowIssue[]>([]);
  const [itemCount, setItemCount] = useState(0);
  // Bumping the key remounts the file input (the reliable way to clear it).
  const [fileKey, setFileKey] = useState(0);

  // Both server actions share the same state shape.
  const serverAction = olympiad ? bulkImportOlympiadQuestions : bulkImportQuestions;
  const [state, action, pending] = useActionState<BulkImportState, FormData>(
    serverAction,
    null,
  );

  // After a completed import: refresh the server-rendered list behind the
  // modal and force a fresh file choice before any re-submit (prevents an
  // accidental duplicate import of the same file).
  const lastHandled = useRef<BulkImportState>(null);
  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      setFileName("");
      setRowIssues([]);
      setItemCount(0);
      setFileKey((k) => k + 1);
      router.refresh();
    }
  }, [state, router]);

  function resetFileState() {
    setFileError("");
    setRowIssues([]);
    setItemCount(0);
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    resetFileState();
    const f = e.target.files?.[0];
    if (!f) {
      setFileName("");
      return;
    }
    setFileName(f.name);
    const parsed = await parseBulkFile(f, tt);
    if ("error" in parsed) {
      setFileError(parsed.error);
      return;
    }
    setRowIssues(validateBulkRowsClient(parsed.items, tt, rules, mode));
    setItemCount(parsed.items.length);
  }

  const fileReady = fileName !== "" && fileError === "" && rowIssues.length === 0;
  const canSubmit =
    !pending && fileReady && (olympiad || (gradeId !== "" && subjectId !== ""));

  const codesHint = tt("bulk.codesHint").replace(
    "{types}",
    (typeNames ?? []).join(", ") || "—",
  );

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {tt("bulk.title")}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={tt("bulk.title")}
        closeLabel={tt("modal.close")}
        busy={pending}
      >
        {olympiad && <p className="muted">{tt("olybulk.note")}</p>}

        <form action={action} className="form">
          {olympiad ? (
            <>
              <input type="hidden" name="__id" value={packageId} />
              {/* Subject + Grade are inherited from the package server-side —
                  this surface intentionally has NO selectors for them. */}
              <p className="hint">{tt("olybulk.fromPackage")}</p>
            </>
          ) : (
            <>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">
                    {tt("qfield.subject")}
                    <span className="req"> *</span>
                  </span>
                  <select
                    name="subject_id"
                    required
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                  >
                    <option value="">{tt("manage.select")}</option>
                    {(subjects ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {subjectId === "" && (
                    <span className="hint">{tt("bulk.chooseSubject")}</span>
                  )}
                </label>

                <label className="field">
                  <span className="field-label">
                    {tt("qfield.grade")}
                    <span className="req"> *</span>
                  </span>
                  <select
                    name="grade_id"
                    required
                    value={gradeId}
                    onChange={(e) => setGradeId(e.target.value)}
                  >
                    <option value="">{tt("manage.select")}</option>
                    {(grades ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {gradeId === "" && (
                    <span className="hint">{tt("bulk.chooseGrade")}</span>
                  )}
                </label>
              </div>
              <p className="hint">{tt("bulk.batchNote")}</p>
            </>
          )}

          <label className="field">
            <span className="field-label">
              {tt("bulk.fileLabel")}
              <span className="req"> *</span>
            </span>
            <input
              key={fileKey}
              type="file"
              name="file"
              accept="application/json,.json"
              required
              onChange={onFileChange}
            />
          </label>
          {fileError !== "" && <p className="form-error">{fileError}</p>}
          {fileReady && itemCount > 0 && (
            <p className="hint">
              {tt("bulk.itemsFound").replace("{n}", String(itemCount))}
            </p>
          )}

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

          <p className="hint">{tt("bulk.fileHint")}</p>
          {/* v3 format rules: five A–E options / one correct everywhere; the
              general bank additionally requires topic + subtopic + term and
              may reference a pre-uploaded image. */}
          <p className="hint">{tt("bulk.fiveRule")}</p>
          {!olympiad && <p className="hint">{tt("bulk.generalMeta")}</p>}
          {!olympiad && <p className="hint">{tt("bulk.mediaHint")}</p>}
          {olympiad && <p className="hint">{tt("olybulk.optionalMeta")}</p>}
          <p className="hint">{codesHint}</p>
          {/* Olympiad mode: olybulk.fromPackage above already explains that
              legacy meta.subject / meta.grade_level values are ignored. */}
          {!olympiad && <p className="hint">{tt("bulk.overrideHint")}</p>}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" type="submit" disabled={!canSubmit}>
              {pending ? tt("bulk.submitting") : tt("bulk.submit")}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={() =>
                downloadBulkTemplate(
                  olympiad
                    ? "olympiad-questions-template.json"
                    : "questions-template.json",
                  mode,
                )
              }
              disabled={pending}
            >
              {tt("bulk.template")}
            </button>
          </div>
        </form>

        {state?.error && <p className="form-error">{state.error}</p>}

        {state?.ok && state.result && (
          <div style={{ marginTop: 16 }}>
            <h3>{tt("bulk.resultTitle")}</h3>
            <p>
              {tt("bulk.total")}: <b>{state.result.total}</b> ·{" "}
              {tt("bulk.successful")}: <b>{state.result.successful}</b> ·{" "}
              {tt("bulk.failed")}: <b>{state.result.failed}</b>
            </p>
            {state.result.errors.length > 0 ? (
              <ul className="muted">
                {state.result.errors.map((er, i) => (
                  <li key={i}>
                    {tt("bulk.row")} {er.index}: {er.error}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{tt("bulk.noErrors")}</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
