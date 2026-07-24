"use client";

import { useActionState } from "react";
import {
  deleteQuestionType,
  type QuestionTypeDeleteState,
} from "@/lib/admin/question-types";
import { SubmitButton } from "@/components/ActionButton";

// Delete a question type. Types that still have questions are never deleted —
// the server returns "inUse" and we surface a friendly suggestion to
// deactivate instead (same pattern as CityDeleteButton).
export function QuestionTypeDeleteButton({
  id,
  label,
  confirmText,
  pendingLabel,
  errInUse,
  errGeneric,
}: {
  id: string;
  label: string;
  confirmText: string;
  pendingLabel?: string;
  errInUse: string;
  errGeneric: string;
}) {
  const [state, formAction] = useActionState<QuestionTypeDeleteState, FormData>(
    deleteQuestionType,
    null,
  );

  const msg = state?.error
    ? state.error === "inUse"
      ? errInUse
      : errGeneric
    : null;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="__id" value={id} />
      <SubmitButton className="link-danger" pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
      {msg && (
        <span className="form-error" style={{ display: "block", marginTop: 4 }}>
          {msg}
        </span>
      )}
    </form>
  );
}
