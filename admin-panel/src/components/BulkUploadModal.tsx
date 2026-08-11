"use client";

// Bulk question import as a modal for the GENERAL question bank. The import
// type decides the FILE TYPE: text-only takes the JSON array, mixed takes a ZIP
// holding questions.json plus the images it references. A Subject + Grade are
// chosen at batch level and rows carry meta.topic + meta.subtopic + meta.term
// (1..4) (bulk import v3); meta.type is optional (single_choice by default) and
// meta.media_asset_id may reference a pre-uploaded question image. The submit
// button stays disabled until the file passes the client-side pre-checks.
// Client validation is UX only — the SECURITY DEFINER bulk RPC remains the
// authority (assert_question_type_rules etc.).
//
// OLYMPIAD MODE IS GONE. This modal used to take a `packageId` and post to
// bulkImportOlympiadQuestions, but it is mounted only on /questions and never
// with a package. Olympiad pools are uploaded from their own surfaces
// (OlympiadCreateForm at creation, OlympiadGradeBulkAppend per grade after it),
// and the dead branch kept an authenticated server action POST-able for a UI
// nobody could reach.
//
// Round 52 (§4/§6/§7):
//   * The batch-level Rüb selector is REMOVED. In the 2026 curriculum a term
//     belongs to the topic (constant per grade+subject+topic), so one term per
//     file was wrong for any file spanning topics from different quarters. Each
//     row declares meta.term and it must equal its topic's term.
//   * When a curriculum exists for the chosen subject + grade, rows naming an
//     unknown topic/subtopic are flagged HERE, before the upload.
//   * The AI prompt block (BulkPromptBlock) embeds that same curriculum so the
//     model cannot invent a name in the first place.
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { Modal } from "@/components/Modal";
import { BulkPromptBlock } from "@/components/BulkPromptBlock";
import { bulkImportQuestions, type BulkImportState } from "@/lib/admin/questions";
import type { QuestionTaxonomy } from "@/lib/admin/question-options";
import {
  buildClientCurriculumIndex,
  downloadBulkTemplate,
  type ClientTypeRule,
} from "@/lib/bulk-client";
import { useBulkFilePicker } from "@/lib/useBulkFilePicker";

type Opt = { value: string; label: string };

export function BulkUploadModal({
  dict,
  locale,
  grades,
  subjects,
  taxonomy,
  typeNames,
  typeRules,
  triggerClassName = "btn-ghost",
}: {
  dict: Record<string, string>;
  // Panel locale — the language the AI prompt asks the model to write in.
  locale?: string;
  // Selectable grade + subject lists (active subjects).
  grades?: Opt[];
  subjects?: Opt[];
  // The EXAM curriculum (topics + terms + subtopics). Drives the per-row
  // "Topic not found" pre-check and the AI prompt's embedded list.
  taxonomy?: QuestionTaxonomy;
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

  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [gradeId, setGradeId] = useState("");
  // Round 53 — MANDATORY import type. Intentionally starts unset with no
  // default: defaulting to "text" would let a mixed file import with every
  // image silently dropped, which looks like success. Everything below the
  // selector stays hidden until one is chosen, so there is no partially-usable
  // state to misread. The server re-checks it (a hidden field is editable).
  const [questionMode, setQuestionMode] = useState<"" | "text" | "mixed">("");
  const modeChosen = questionMode !== "";

  // Curriculum for the chosen (subject, grade): a topic belongs to the subject
  // and either to this grade or to no grade at all (shared). Null before a
  // selection or when the tree is empty — the row checks then fall back to
  // schema-only validation instead of rejecting everything.
  const curriculum = useMemo(() => {
    if (!taxonomy || !subjectId || !gradeId) return null;
    const topics = taxonomy.topics
      .filter(
        (tp) =>
          tp.subject_id === subjectId &&
          (tp.grade_id == null || tp.grade_id === gradeId),
      )
      .map((tp) => ({
        name: tp.name,
        term: tp.term,
        subtopics: taxonomy.subtopics
          .filter((st) => st.topic_id === tp.id)
          .map((st) => st.name),
      }));
    return topics.length > 0 ? buildClientCurriculumIndex(topics) : null;
  }, [taxonomy, subjectId, gradeId]);

  // Parse + row validation + the mixed media phase, shared with the two
  // olympiad upload surfaces (lib/useBulkFilePicker.ts).
  const picker = useBulkFilePicker({
    dict,
    questionMode,
    mode: "general",
    typeRules: typeRules ?? [],
    curriculum,
  });

  const [state, action, pending] = useActionState<BulkImportState, FormData>(
    bulkImportQuestions,
    null,
  );

  // After a completed import: refresh the server-rendered list behind the
  // modal and force a fresh file choice before any re-submit (prevents an
  // accidental duplicate import of the same file).
  const lastHandled = useRef<BulkImportState>(null);
  // `reset` alone, never the whole picker: the hook returns a fresh object each
  // render, so depending on it would re-run this effect forever.
  const { reset: resetPicker } = picker;
  useEffect(() => {
    if (state?.ok && state !== lastHandled.current) {
      lastHandled.current = state;
      resetPicker();
      router.refresh();
    }
  }, [state, router, resetPicker]);

  const canSubmit =
    !pending &&
    !picker.uploading &&
    modeChosen &&
    picker.fileReady &&
    gradeId !== "" &&
    subjectId !== "";

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
        <form
          action={action}
          onSubmit={(e) =>
            void picker.handleSubmit(e, (fd) => startTransition(() => action(fd)))
          }
          className="form"
        >
          {/* ---- MANDATORY import type — before every other control -------- */}
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
            {questionMode === "mixed" && (
              <p className="hint">{tt("bulk.mode.mixedNote")}</p>
            )}
          </fieldset>

          {/* Everything below is INACCESSIBLE until a type is chosen. Hidden
              rather than merely disabled: a disabled file input still reads as
              "the next step", while an absent one makes the single required
              action obvious. */}
          {!modeChosen ? null : (
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
          {/* Round 52: no batch Rüb select — meta.term is per row and must
              match its curriculum topic's term. */}
          <p className="hint">{tt("bulk.termNote")}</p>

          {/* §7 — the ready-made AI prompt, built from the selection above.
              questionMode is passed because the prompt DESCRIBES the format:
              without it the mixed-mode admin was handed a prompt forbidding
              images and omitting the ZIP layout the mode requires. */}
          <BulkPromptBlock
            dict={dict}
            locale={locale ?? "az"}
            subjects={subjects ?? []}
            grades={grades ?? []}
            subjectId={subjectId}
            gradeId={gradeId}
            taxonomy={taxonomy ?? { topics: [], subtopics: [] }}
            questionMode={questionMode}
          />

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
              onChange={(e) => void picker.onFileChange(e)}
            />
          </label>
          {questionMode === "mixed" && (
            <pre className="bulk-zip-layout">{tt("bulk.zipLayout")}</pre>
          )}
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
          {/* v3 format rules: five A–E options / one correct everywhere; the
              general bank additionally requires topic + subtopic + term and
              may reference a pre-uploaded image. */}
          <p className="hint">{tt("bulk.fiveRule")}</p>
          <p className="hint">{tt("bulk.generalMeta")}</p>
          <p className="hint">{tt("bulk.mediaHint")}</p>
          <p className="hint">{codesHint}</p>
          <p className="hint">{tt("bulk.overrideHint")}</p>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ActionButton
              className="btn"
              pending={pending || picker.uploading}
              pendingLabel={tt(picker.uploading ? "bulk.uploadingMedia" : "bulk.submitting")}
              disabled={!canSubmit}
            >
              {tt("bulk.submit")}
            </ActionButton>
            <button
              className="btn-ghost"
              type="button"
              onClick={() =>
                downloadBulkTemplate(
                  `questions-${questionMode}-template.${
                    questionMode === "mixed" ? "zip" : "json"
                  }`,
                  "general",
                  // Safe: the button only renders once a mode is chosen.
                  questionMode === "mixed" ? "mixed" : "text",
                )
              }
              disabled={pending}
            >
              {tt("bulk.template")}
            </button>
          </div>
          </>
          )}
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
