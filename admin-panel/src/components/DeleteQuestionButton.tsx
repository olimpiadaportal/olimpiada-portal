"use client";

import { deleteQuestion } from "@/lib/admin/questions";

export function DeleteQuestionButton({
  id,
  label,
  confirmText,
}: {
  id: string;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={deleteQuestion}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="__id" value={id} />
      <button className="link-danger" type="submit">
        {label}
      </button>
    </form>
  );
}
