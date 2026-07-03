"use client";

// Parent account deletion — R9 (T5): the browser confirm() became a proper
// ConfirmModal (shared Modal underneath) so destructive confirmations look and
// behave like every other dialog. The actual deletion still goes through the
// same deleteParentAccount server action via the hidden form.
import { useRef, useState } from "react";
import { deleteParentAccount } from "@/lib/auth/parentService";
import { ConfirmModal } from "@/components/Modal";

export function DeleteAccountButton({
  label,
  confirmText,
  cancelLabel = "✕",
  confirmLabel,
}: {
  label: string;
  confirmText: string;
  // Translated button labels; confirmLabel falls back to the trigger label.
  cancelLabel?: string;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={deleteParentAccount}>
        <button
          className="btn-ghost danger"
          type="button"
          onClick={() => setOpen(true)}
        >
          {label}
        </button>
      </form>
      <ConfirmModal
        isOpen={open}
        message={confirmText}
        confirmLabel={confirmLabel ?? label}
        cancelLabel={cancelLabel}
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setPending(true);
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}
