"use client";

// Bulk APPEND into ONE already-targeted grade's pool (migration 108). This is
// the only bulk path that reaches a package's OWN grade: that grade is targeted
// at creation together with its file, so it never appears in the add-grade form.
//
// Its own component rather than more state inside OlympiadGradesManager so each
// grade row owns an independent useActionState (pending / error / result) with
// no per-row keying.
//
// Everything about parsing, row validation and images is DELEGATED to
// useBulkFilePicker — the same hook BulkUploadModal uses, so the file-picking
// and media orchestration exist once rather than once per surface.
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { OlympiadJsonFormat } from "@/components/OlympiadJsonFormat";
import {
  appendOlympiadGradeQuestions,
  type OlympiadGradeState,
} from "@/lib/admin/olympiad";
import { downloadBulkTemplate, type ClientTypeRule } from "@/lib/bulk-client";
import { useBulkFilePicker } from "@/lib/useBulkFilePicker";

export function OlympiadGradeBulkAppend({
  dict,
  packageId,
  gradeId,
  gradeName,
  typeRules,
}: {
  dict: Record<string, string>;
  packageId: string;
  gradeId: string;
  gradeName: string;
  typeRules: ClientTypeRule[];
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();

  // Collapsed by default so a package with many grades stays scannable.
  const [open, setOpen] = useState(false);
  // MANDATORY import type, starting unset with no default — a default of "text"
  // would import a mixed file with every image dropped and still look
  // successful. Everything below it stays unrendered until one is chosen.
  const [questionMode, setQuestionMode] = useState<"" | "text" | "mixed">("");
  const modeChosen = questionMode !== "";

  const picker = useBulkFilePicker({
    dict,
    questionMode,
    mode: "olympiad",
    typeRules,
  });

  const [state, action, pending] = useActionState<OlympiadGradeState, FormData>(
    appendOlympiadGradeQuestions,
    null,
  );

  // After a completed append: refresh the server-rendered pool count behind
  // this panel and force a fresh file choice before any re-submit. `reset`
  // alone, never the whole picker — the hook returns a new object each render.
  const { reset: resetPicker } = picker;
  const lastHandled = useRef<OlympiadGradeState>(null);
  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      resetPicker();
      router.refresh();
    }
  }, [state, router, resetPicker]);

  const canSubmit = !pending && !picker.uploading && modeChosen && picker.fileReady;

  if (!open) {
    return (
      <div style={{ marginTop: 6 }}>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
          {tt("oly2.bulkAppend")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong>
          {tt("oly2.bulkAppend")} — {gradeName}
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
      <p className="hint">{tt("oly2.bulkAppendHint")}</p>

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
          {!modeChosen && <p className="hint">{tt("bulk.mode.required")}</p>}
          {questionMode === "mixed" && <p className="hint">{tt("bulk.mode.mixedNote")}</p>}
        </fieldset>

        {/* Hidden rather than disabled until a type is chosen: a disabled file
            input still reads as "the next step", while an absent one makes the
            single required action obvious. */}
        {modeChosen && (
          <>
            {/* The exact JSON this grade's file must contain, and the download
                that produces it. The create form offers both next to every
                grade slot; an append surface without them left the admin
                guessing at a format the importer rejects silently-looking. */}
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
                    // Safe: the button only renders once a mode is chosen.
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

            {/* File-level problems carry no row number, so they sit above the
                numbered lists rather than inside them. */}
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
            <p className="hint">{tt("olybulk.optionalMeta")}</p>

            <ActionButton
              pending={pending || picker.uploading}
              pendingLabel={tt(picker.uploading ? "bulk.uploadingMedia" : "oly2.appending")}
              disabled={!canSubmit}
            >
              {tt("oly2.bulkAppendBtn")}
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
        <div>
          <p className="form-ok">
            {state.result.failed > 0
              ? tt("oly2.bulkAppendPartial")
                  .replace("{n}", String(state.result.successful))
                  .replace("{m}", String(state.result.failed))
              : tt("oly2.bulkAppendOk").replace("{n}", String(state.result.successful))}
          </p>
          {state.result.errors.length > 0 && (
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
    </div>
  );
}
