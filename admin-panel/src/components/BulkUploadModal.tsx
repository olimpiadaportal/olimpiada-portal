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
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { Modal } from "@/components/Modal";
import { BulkPromptBlock } from "@/components/BulkPromptBlock";
import { bulkImportQuestions, type BulkImportState } from "@/lib/admin/questions";
import { bulkImportOlympiadQuestions } from "@/lib/admin/olympiad";
import type { QuestionTaxonomy } from "@/lib/admin/question-options";
import {
  buildClientCurriculumIndex,
  downloadBulkTemplate,
  parseBulkFile,
  validateBulkRowsClient,
  type ClientTypeRule,
  type RowIssue,
} from "@/lib/bulk-client";

type Opt = { value: string; label: string };

export function BulkUploadModal({
  dict,
  locale,
  grades,
  subjects,
  taxonomy,
  packageId,
  typeNames,
  typeRules,
  triggerClassName = "btn-ghost",
}: {
  dict: Record<string, string>;
  // Panel locale — the language the AI prompt asks the model to write in.
  locale?: string;
  // General mode: selectable grade + subject lists (active subjects).
  grades?: Opt[];
  subjects?: Opt[];
  // General mode: the EXAM curriculum (topics + terms + subtopics). Drives the
  // per-row "Topic not found" pre-check and the AI prompt's embedded list.
  taxonomy?: QuestionTaxonomy;
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
  // Parsed rows are KEPT so the issue list can be recomputed when the subject
  // or grade changes (a different pair means a different curriculum).
  const [items, setItems] = useState<unknown[]>([]);
  // Bumping the key remounts the file input (the reliable way to clear it).
  const [fileKey, setFileKey] = useState(0);
  // Round 53 — MANDATORY import type. Intentionally starts unset with no
  // default: defaulting to "text" would let a mixed file import with every
  // image silently dropped, which looks like success. Everything below the
  // selector stays hidden until one is chosen, so there is no partially-usable
  // state to misread. The server re-checks it (a hidden field is editable).
  const [questionMode, setQuestionMode] = useState<"" | "text" | "mixed">("");
  const modeChosen = questionMode !== "";

  // Curriculum for the chosen (subject, grade): a topic belongs to the subject
  // and either to this grade or to no grade at all (shared). Null in olympiad
  // mode, before a selection, or when the tree is empty — the row checks then
  // fall back to schema-only validation instead of rejecting everything.
  const curriculum = useMemo(() => {
    if (olympiad || !taxonomy || !subjectId || !gradeId) return null;
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
  }, [olympiad, taxonomy, subjectId, gradeId]);

  const rowIssues: RowIssue[] = useMemo(
    () =>
      items.length === 0
        ? []
        : validateBulkRowsClient(items, tt, rules, mode, curriculum, {
            mixed: questionMode === "mixed",
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, curriculum, mode, dict, questionMode],
  );
  const itemCount = items.length;

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
      setItems([]);
      setFileKey((k) => k + 1);
      router.refresh();
    }
  }, [state, router]);

  function resetFileState() {
    setFileError("");
    setItems([]);
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
    setItems(parsed.items);
  }

  const fileReady = fileName !== "" && fileError === "" && rowIssues.length === 0;
  const canSubmit =
    !pending &&
    modeChosen &&
    fileReady &&
    (olympiad || (gradeId !== "" && subjectId !== ""));

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
              {/* Round 52: no batch Rüb select — meta.term is per row and must
                  match its curriculum topic's term. */}
              <p className="hint">{tt("bulk.termNote")}</p>

              {/* §7 — the ready-made AI prompt, built from the selection above. */}
              <BulkPromptBlock
                dict={dict}
                locale={locale ?? "az"}
                subjects={subjects ?? []}
                grades={grades ?? []}
                subjectId={subjectId}
                gradeId={gradeId}
                taxonomy={taxonomy ?? { topics: [], subtopics: [] }}
              />
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
            <ActionButton
              className="btn"
              pending={pending}
              pendingLabel={tt("bulk.submitting")}
              disabled={!canSubmit}
            >
              {tt("bulk.submit")}
            </ActionButton>
            <button
              className="btn-ghost"
              type="button"
              onClick={() =>
                downloadBulkTemplate(
                  `${olympiad ? "olympiad-questions" : "questions"}-${questionMode}-template.json`,
                  mode,
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
