"use client";

import { deleteSchool } from "@/lib/admin/schools";

// Delete a school. schools has no inbound RESTRICT references in this scope, so
// (unlike cities) deletion does not need a friendly FK-error path.
export function SchoolDeleteButton({
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
      action={deleteSchool}
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
