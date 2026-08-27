"use client";

// FULL REPLACEMENT of one grade's olympiad pool (owner spec §5).
//
// Sibling of OlympiadGradeBulkAppend, and deliberately so: the file format, the
// mode radio, the picker, the template download and the row-issue rendering are
// IDENTICAL, because they delegate to the same useBulkFilePicker hook. Building
// a second importer for this was explicitly ruled out (spec §10).
//
// WHAT IS DIFFERENT IS ONLY THE SEMANTICS, and every difference is visible:
//
//   * the panel states, before the file input, that this REMOVES the current
//     questions — with the owner's own arithmetic, because "replace" reads as
//     "update in place" to most people and the 100 -> 50 example is the one
//     sentence that cannot be misread;
//   * it demands the package CODE, like every other destructive olympiad
//     action. The server re-checks it under a row lock, so this field is a
//     speed bump for the admin, not the control;
//   * it is collapsed and ghost-styled, so the destructive path is never the
//     one a hurried admin hits by accident.
//
// It reports the outcome as ONE number — how many questions the grade now has —
// because that is the number the owner's acceptance test asks about, and
// because a partial result is impossible here: the action refuses a file with
// any bad row before touching the pool, and the RPC rolls back if the importer
// lands fewer rows than were sent.
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { OlympiadJsonFormat } from "@/components/OlympiadJsonFormat";
import {
  replaceOlympiadGradeQuestions,
  type OlympiadGradeState,
} from "@/lib/admin/olympiad";
import { downloadBulkTemplate, type ClientTypeRule } from "@/lib/bulk-client";
import { useBulkFilePicker } from "@/lib/useBulkFilePicker";

export function OlympiadGradeBulkReplace({
  dict,
  packageId,
  packageCode,
  gradeId,
  gradeName,
  currentCount,
  typeRules,
}: {
  dict: Record<string, string>;
  packageId: string;
  /** Demanded by the form; the RPC compares it again under its row lock. */
  packageCode: string;
  gradeId: string;
  gradeName: string;
  /** Published questions in this grade's pool right now — the "100" in the warning. */
  currentCount: number;
  typeRules: ClientTypeRule[];
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [questionMode, setQuestionMode] = useState<"" | "text" | "mixed">("");
  const [code, setCode] = useState("");
  const modeChosen = questionMode !== "";

  const picker = useBulkFilePicker({
    dict,
    questionMode,
    mode: "olympiad",
    typeRules,
  });

  const [state, action, pending] = useActionState<OlympiadGradeState, FormData>(
    replaceOlympiadGradeQuestions,
    null,
  );

  // After a completed replacement: refresh the server-rendered pool behind this
  // panel, and force a fresh file choice so a second click cannot re-post the
  // same file against a pool that no longer contains what it replaced.
  const { reset: resetPicker } = picker;
  const lastHandled = useRef<OlympiadGradeState>(null);
  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      resetPicker();
      setCode("");
      router.refresh();
    }
  }, [state, router, resetPicker]);

  const codeOk = code.trim() === packageCode;
  const canSubmit =
    !pending && !picker.uploading && modeChosen && picker.fileReady && codeOk;

  if (!open) {
    return (
      <div style={{ marginTop: 6 }}>
        <button
          type="button"
          className="btn-ghost btn-sm btn-danger-ghost"
          onClick={() => setOpen(true)}
        >
          {tt("olyq.replace.open")}
        </button>
      </div>
    );
  }

  const incoming = picker.fileReady ? picker.items.length : null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong>
          {tt("olyq.replace.title")} — {gradeName}
        </strong>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setOpen(false)}
          disabled={pending || picker.uploading}
        >
          {tt("modal.close")}
        </button>
      </div>

      {/* THE WARNING COMES BEFORE THE FILE INPUT, not next to the submit button.
          An admin who reads only the first line must still learn that this
          removes what is there now. */}
      <div className="bulk-issues" role="note">
        <span className="bulk-issues-title">{tt("olyq.replace.warnTitle")}</span>
        <p>{tt("olyq.replace.warnBody")}</p>
        <p>
          {tt("olyq.replace.warnMath")
            .replace("{current}", String(currentCount))
            .replace("{example}", String(Math.max(1, Math.floor(currentCount / 2) || 50)))}
        </p>
        {/* The live version of the same sentence, once a file is chosen. This is
            the owner's acceptance test stated back to the admin in their own
            numbers before they commit to it. */}
        {incoming !== null && (
          <p className="form-error">
            {tt("olyq.replace.warnLive")
              .replace("{current}", String(currentCount))
              .replace("{incoming}", String(incoming))}
          </p>
        )}
        <p className="hint">{tt("olyq.replace.warnKeeps")}</p>
      </div>

      <form
        action={action}
        onSubmit={(e) =>
          void picker.handleSubmit(e, (fd) => startTransition(() => action(fd)))
        }
        className="form"
      >
        <input type="hidden" name="__id" value={packageId} />
        <input type="hidden" name="grade_id" value={gradeId} />

        <fieldset className="bulk-mode">
          <legend className="field-label">
            {tt("bulk.mode.label")}
            <span className="req"> *</span>
          </legend>
          <div className="bulk-mode-options">
            {(
              [
                { v: "text", label: "bulk.mode.text", hint: "bulk.mode.textHint" },
                { v: "mixed", label: "bulk.mode.mixed", hint: "bulk.mode.mixedHint" },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className={`bulk-mode-opt${questionMode === o.v ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="question_mode"
                  value={o.v}
                  checked={questionMode === o.v}
                  onChange={() => setQuestionMode(o.v)}
                  disabled={pending}
                />
                <span className="bulk-mode-opt-body">
                  <span className="bulk-mode-opt-title">{tt(o.label)}</span>
                  <span className="hint">{tt(o.hint)}</span>
                </span>
              </label>
            ))}
          </div>
          {questionMode === "mixed" && <p className="hint">{tt("bulk.mode.mixedNote")}</p>}
        </fieldset>

        {modeChosen && (
          <>
            <OlympiadJsonFormat
              gradeLabel={gradeName}
              dict={dict}
              questionMode={questionMode === "mixed" ? "mixed" : "text"}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="btn-ghost btn-sm"
                type="button"
                onClick={() =>
                  downloadBulkTemplate(
                    `olympiad-questions-${questionMode}-template.${
                      questionMode === "mixed" ? "zip" : "json"
                    }`,
                    "olympiad",
                    questionMode === "mixed" ? "mixed" : "text",
                  )
                }
                disabled={pending || picker.uploading}
              >
                {tt("bulk.template")}
              </button>
            </div>

            <label className="field">
              <span className="field-label">
                {tt(questionMode === "mixed" ? "bulk.fileLabelZip" : "bulk.fileLabel")}
                <span className="req"> *</span>
              </span>
              <input
                key={picker.fileKey}
                type="file"
                name="file"
                accept={
                  questionMode === "mixed" ? ".zip,application/zip" : "application/json,.json"
                }
                required
                disabled={pending || picker.uploading}
                onChange={(e) => void picker.onFileChange(e)}
              />
            </label>
            {questionMode === "mixed" && (
              <pre className="bulk-zip-layout">{tt("bulk.zipLayout")}</pre>
            )}
            {picker.fileName !== "" && <p className="hint">{picker.fileName}</p>}
            {picker.fileError !== "" && <p className="form-error">{picker.fileError}</p>}
            {picker.fileReady && (
              <p className="hint">
                {tt("bulk.itemsFound").replace("{n}", String(picker.items.length))}
              </p>
            )}

            {picker.zipIssues.length > 0 && (
              <div className="bulk-issues" role="alert">
                <span className="bulk-issues-title">{tt("bulk.fileProblems")}</span>{" "}
                — {tt("bulk.fixFile")}
                <ul>
                  {picker.zipIssues.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
            {[...picker.mediaIssues, ...picker.rowIssues].length > 0 && (
              <div className="bulk-issues" role="alert">
                <span className="bulk-issues-title">{tt("bulk.fileProblems")}</span>{" "}
                — {tt("bulk.fixFile")}
                <ul>
                  {[...picker.mediaIssues, ...picker.rowIssues].map((is, i) => (
                    <li key={i}>
                      {tt("bulk.row")} {is.row}: {is.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="hint">
              {tt(questionMode === "mixed" ? "bulk.fileHintZip" : "bulk.fileHint")}
            </p>
            <p className="hint">{tt("bulk.fiveRule")}</p>
            <p className="hint">{tt("bulk.explanationRule")}</p>

            {/* Last, and required. Deliberately after the file: typing the code
                is the admin's final acknowledgement, not their first step. */}
            <label className="field">
              <span className="field-label">
                {tt("olyq.replace.codeLabel").replace("{code}", packageCode)}
                <span className="req"> *</span>
              </span>
              <input
                type="text"
                name="confirm_code"
                value={code}
                autoComplete="off"
                spellCheck={false}
                disabled={pending || picker.uploading}
                onChange={(e) => setCode(e.target.value)}
              />
              <span className="hint">{tt("olyq.replace.codeHint")}</span>
            </label>

            <ActionButton
              pending={pending || picker.uploading}
              pendingLabel={tt(picker.uploading ? "bulk.uploadingMedia" : "olyq.replace.working")}
              disabled={!canSubmit}
            >
              {tt("olyq.replace.submit")}
            </ActionButton>
          </>
        )}
      </form>

      {state?.error && (
        <div>
          <p className="form-error">{state.error}</p>
          {state.result && state.result.errors.length > 0 && (
            <ul className="muted">
              {state.result.errors.map((er, i) => (
                <li key={i}>
                  {tt("bulk.row")} {er.index}: {er.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state?.ok && state.result && (
        <p className="form-ok">
          {tt("olyq.replace.ok").replace("{n}", String(state.result.successful))}
        </p>
      )}
    </div>
  );
}
