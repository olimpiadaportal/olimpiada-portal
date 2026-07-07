"use client";

import { useActionState } from "react";
import {
  saveQuestionType,
  type QuestionTypeSaveState,
} from "@/lib/admin/question-types";

// Error codes returned by saveQuestionType mapped to localized strings passed
// from the server page (this client component holds no i18n dictionary itself
// — same pattern as CityForm).
//
// NOTE: the "exact number of answer options" editor was removed — options_required
// is now a FIXED business rule (MCQ = 4) preserved by the DB. This form only
// edits the name, status, correct-answers count and auto-grading flag.
export type QuestionTypeFormLabels = {
  code: string;
  codeHint: string;
  name: string;
  status: string;
  statusHint: string;
  statusActive: string;
  statusInactive: string;
  correctRequired: string;
  correctHint: string;
  autoGrading: string;
  submit: string;
  saving: string;
  errMissingName: string;
  errTooLong: string;
  errRangeCorrect: string;
  errDuplicate: string;
  errGeneric: string;
};

function mapError(
  code: string | undefined,
  l: QuestionTypeFormLabels,
): string | null {
  if (!code) return null;
  if (code === "missing.name") return l.errMissingName;
  if (code === "err.tooLong") return l.errTooLong;
  if (code === "range.correct") return l.errRangeCorrect;
  if (code === "duplicate") return l.errDuplicate;
  return l.errGeneric;
}

export function QuestionTypeForm({
  labels,
  defaultValues,
  id,
}: {
  labels: QuestionTypeFormLabels;
  defaultValues?: {
    code?: string;
    name?: string;
    status?: string;
    options_required?: number | null;
    correct_required?: number | null;
    supports_auto_grading?: boolean;
  };
  id?: string;
}) {
  const [state, formAction, pending] = useActionState<
    QuestionTypeSaveState,
    FormData
  >(saveQuestionType, null);

  const err = mapError(state?.error, labels);

  return (
    <form action={formAction} className="form">
      {id && <input type="hidden" name="__id" value={id} />}

      <div className="form-grid">
        {id && (
          <label className="field">
            <span className="field-label">{labels.code}</span>
            <input type="text" value={defaultValues?.code ?? ""} disabled />
            <span className="hint muted">{labels.codeHint}</span>
          </label>
        )}

        <label className="field">
          <span className="field-label">
            {labels.name}
            <span className="req"> *</span>
          </span>
          <input
            type="text"
            name="name"
            maxLength={120}
            defaultValue={defaultValues?.name ?? ""}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">{labels.status}</span>
          <select name="status" defaultValue={defaultValues?.status ?? "active"}>
            <option value="active">{labels.statusActive}</option>
            <option value="inactive">{labels.statusInactive}</option>
          </select>
          <span className="hint muted">{labels.statusHint}</span>
        </label>

        <label className="field">
          <span className="field-label">{labels.correctRequired}</span>
          <input
            type="number"
            name="correct_required"
            min={1}
            max={10}
            step={1}
            defaultValue={
              defaultValues?.correct_required != null
                ? String(defaultValues.correct_required)
                : ""
            }
          />
          <span className="hint muted">{labels.correctHint}</span>
        </label>

        <label className="field">
          <span className="field-label">{labels.autoGrading}</span>
          <input
            type="checkbox"
            name="supports_auto_grading"
            defaultChecked={defaultValues?.supports_auto_grading ?? false}
          />
        </label>
      </div>

      {err && <p className="form-error">{err}</p>}

      <button className="btn" type="submit" disabled={pending}>
        {pending ? labels.saving : labels.submit}
      </button>
    </form>
  );
}
