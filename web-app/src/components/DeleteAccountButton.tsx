"use client";

import { deleteParentAccount } from "@/lib/auth/parentService";

export function DeleteAccountButton({
  label,
  confirmText,
}: {
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={deleteParentAccount}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <button className="link-danger" type="submit">
        {label}
      </button>
    </form>
  );
}
