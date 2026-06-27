"use client";

import { deleteRow } from "@/lib/admin/actions";

export function DeleteButton({
  slug,
  id,
  label,
  confirmText,
}: {
  slug: string;
  id: string;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={deleteRow}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="__slug" value={slug} />
      <input type="hidden" name="__id" value={id} />
      <button className="link-danger" type="submit">
        {label}
      </button>
    </form>
  );
}
