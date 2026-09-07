"use client";

// Parent account deletion — R9 (T5): the browser confirm() became a proper
// ConfirmModal (shared Modal underneath) so destructive confirmations look and
// behave like every other dialog. The actual deletion still goes through the
// same deleteParentAccount server action via the hidden form.
//
// The action is driven by useActionState, exactly like the child delete on the
// dashboard (ChildCardActions) and for exactly the same reason — this is the
// MORE destructive of the two, and it had the same defect for longer. The
// dialog used to set a local `pending` on confirm and clear it NOWHERE, which
// only ever looked correct because the success path navigates away and takes
// the dialog with it: deleteParentAccountCore refuses whenever an account would
// survive the "deletion", and on that path the parent was left with a dialog
// whose two buttons were disabled forever and not one word of explanation.
// Now the confirm closes the dialog, and whatever the server answers is either
// a redirect or the inline line below.
import { useActionState, useRef, useState } from "react";
import {
  deleteParentAccount,
  type AccountDeleteState,
} from "@/lib/auth/parentService";
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
  const formRef = useRef<HTMLFormElement>(null);
  // The server action returns an ALREADY-LOCALIZED sentence (the dictionary
  // lives on the server), so this component renders `state.error` verbatim and
  // needs no dictionary prop of its own.
  const [state, action, pending] = useActionState<AccountDeleteState, FormData>(
    deleteParentAccount,
    null,
  );

  return (
    <>
      <form ref={formRef} action={action}>
        <button
          className="btn-ghost danger"
          type="button"
          onClick={() => setOpen(true)}
          disabled={pending}
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
          // Close FIRST, then submit. The outcome belongs on the page, not in a
          // dialog nobody can dismiss: on success the redirect ends the session
          // and this whole screen, and on a refusal the line below is what
          // stays behind.
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
      {/* A refused deletion, in the parent's language. role="alert" because by
          the time this appears the dialog has closed and focus has returned to
          the trigger, so a screen-reader user would otherwise never hear that
          the account is still there. */}
      {state?.error && (
        // .prof2-error carries margin:0 for the password form, whose flex gap
        // spaces it; the danger zone is a plain block, so the gap is set here.
        <p className="prof2-error" role="alert" style={{ marginTop: 10 }}>
          {state.error}
        </p>
      )}
    </>
  );
}
