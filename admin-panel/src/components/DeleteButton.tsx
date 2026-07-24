"use client";

import { deleteRow } from "@/lib/admin/actions";
import { SubmitButton } from "@/components/ActionButton";

export function DeleteButton({
  slug,
  id,
  label,
  confirmText,
  pendingLabel,
}: {
  slug: string;
  id: string;
  label: string;
  confirmText: string;
  pendingLabel?: string;
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
      <SubmitButton className="link-danger" pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
    </form>
  );
}
