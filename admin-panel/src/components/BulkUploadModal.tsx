"use client";

// Bulk question import as a modal (general question bank + olympiad private
// pools). The modal REQUIRES a Subject (general mode only — olympiad pools
// inherit the package's subject), a Grade and a JSON file; the submit button
// stays disabled until everything is chosen and the file passes the
// client-side pre-checks. Client validation is UX only — the SECURITY DEFINER
// bulk RPCs remain the authority (assert_question_type_rules etc.).
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { bulkImportQuestions, type BulkImportState } from "@/lib/admin/questions";
import { bulkImportOlympiadQuestions } from "@/lib/admin/olympiad";

type Opt = { value: string; label: string };
type RowIssue = { row: number; message: string };

const MAX_FILE_BYTES = 2 * 1024 * 1024;

// The downloadable template: per-item meta intentionally has NO subject and NO
// grade_level — the modal supplies both for the whole batch. Multiple choice
// (the only ACTIVE type at launch) requires exactly 5 options with exactly 1
// correct; the template models exactly that shape.
const TEMPLATE = [
  {
    primary_locale: "az",
    meta: {
      type: "Multiple choice",
      olympiad_type: "School",
      topic: "Toplama",
      subtopic: "Birrəqəmli ədədlər",
      source: "Nümunə",
    },
    translations: {
      az: { body: "2 + 2 = ?", prompt: "Düzgün cavabı seçin", explanation: "2 + 2 = 4" },
      en: { body: "2 + 2 = ?", prompt: "Choose the correct answer" },
      ru: { body: "2 + 2 = ?", prompt: "Выберите правильный ответ" },
    },
    options: [
      { is_correct: true, order_index: 0, text: { az: "4", en: "4", ru: "4" } },
      { is_correct: false, order_index: 1, text: { az: "3", en: "3", ru: "3" } },
      { is_correct: false, order_index: 2, text: { az: "5", en: "5", ru: "5" } },
      { is_correct: false, order_index: 3, text: { az: "6", en: "6", ru: "6" } },
      { is_correct: false, order_index: 4, text: { az: "7", en: "7", ru: "7" } },
    ],
  },
];

// MCQ detection mirror of the server rule: the item is treated as multiple
// choice when meta.type is omitted/empty OR names the MCQ type
// ("Multiple choice" / "multiple_choice", case-insensitive).
function isMcqType(typeRaw: unknown): boolean {
  if (typeRaw == null) return true;
  if (typeof typeRaw !== "string") return false;
  const norm = typeRaw.trim().toLowerCase().replace(/\s+/g, "_");
  return norm === "" || norm === "multiple_choice";
}

export function BulkUploadModal({
  dict,
  grades,
  subjects,
  packageId,
  subjectName,
  typeNames,
  triggerClassName = "btn-ghost",
}: {
  dict: Record<string, string>;
  grades: Opt[];
  // General mode: selectable subject list (active subjects).
  subjects?: Opt[];
  // Olympiad mode: the private pool's package id (+ read-only subject label).
  packageId?: string;
  subjectName?: string | null;
  // Active question-type names, for the short reference hint.
  typeNames?: string[];
  triggerClassName?: string;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const router = useRouter();
  const olympiad = Boolean(packageId);

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
    if (f.size > MAX_FILE_BYTES) {
      setFileError(tt("bulk.tooLarge"));
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await f.text());
    } catch {
      setFileError(tt("bulk.invalidJson"));
      return;
    }
    if (!Array.isArray(data)) {
      setFileError(tt("bulk.notArray"));
      return;
    }
    if (data.length === 0) {
      setFileError(tt("bulk.emptyArray"));
      return;
    }

    const issues: RowIssue[] = [];
    data.forEach((item, i) => {
      const row = i + 1;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        issues.push({ row, message: tt("bulk.rowNotObject") });
        return;
      }
      const it = item as {
        meta?: { type?: unknown };
        translations?: { az?: { body?: unknown } };
        options?: unknown;
      };
      const body = it.translations?.az?.body;
      if (typeof body !== "string" || body.trim() === "") {
        issues.push({ row, message: tt("bulk.rowNeedAzBody") });
      }
      if (!Array.isArray(it.options)) {
        issues.push({ row, message: tt("bulk.rowNeedOptions") });
        return;
      }
      // Client-side mirror of assert_question_type_rules for the MCQ type:
      // exactly 5 options, exactly 1 correct.
      if (isMcqType(it.meta?.type)) {
        const opts = it.options as { is_correct?: unknown }[];
        const correct = opts.filter((o) => o && o.is_correct === true).length;
        if (opts.length !== 5) {
          issues.push({
            row,
            message: tt("qval.exactOptions").replace("{n}", "5"),
          });
        }
        if (correct !== 1) {
          issues.push({
            row,
            message: tt("qval.exactCorrect").replace("{n}", "1"),
          });
        }
      }
    });
    setRowIssues(issues);
    setItemCount(data.length);
  }

  function downloadTemplate() {
    const blob = new Blob([JSON.stringify(TEMPLATE, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = olympiad
      ? "olympiad-questions-template.json"
      : "questions-template.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const fileReady = fileName !== "" && fileError === "" && rowIssues.length === 0;
  const canSubmit =
    !pending && fileReady && gradeId !== "" && (olympiad || subjectId !== "");

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
          {olympiad && <input type="hidden" name="__id" value={packageId} />}

          <div className="form-grid">
            {olympiad ? (
              <div className="field">
                <span className="field-label">{tt("qfield.subject")}</span>
                <input type="text" value={subjectName || "—"} disabled readOnly />
                <span className="hint">{tt("olybulk.subjectFromPkg")}</span>
              </div>
            ) : (
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
            )}

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
                {grades.map((o) => (
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
          <p className="hint">
            {olympiad ? tt("bulk.batchNoteGrade") : tt("bulk.batchNote")}
          </p>

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
          <p className="hint">{tt("bulk.mcqRule")}</p>
          <p className="hint">{codesHint}</p>
          <p className="hint">{tt("bulk.overrideHint")}</p>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" type="submit" disabled={!canSubmit}>
              {pending ? tt("bulk.submitting") : tt("bulk.submit")}
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={downloadTemplate}
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
