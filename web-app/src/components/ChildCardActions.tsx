"use client";

import { useActionState, useRef, useState } from "react";
import {
  resetChildPasswordAction,
  deleteChild,
  type ChildOpState,
} from "@/lib/auth/parentService";
import { ConfirmModal } from "@/components/Modal";

export function ChildCardActions({
  studentProfileId,
  dict,
}: {
  studentProfileId: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [show, setShow] = useState(false);
  // R9 (T5): delete confirmation moved from browser confirm() to the shared
  // ConfirmModal; the same deleteChild server action still does the work.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ChildOpState, FormData>(
    resetChildPasswordAction,
    null,
  );
  // The delete goes through useActionState too — same hook, same ChildOpState,
  // same inline .form-error line as the password reset beside it. It replaces a
  // local `deleting` boolean that was set on confirm and cleared NOWHERE: on a
  // refusal the dialog stayed open with both of its buttons disabled forever,
  // so the only way out of a failed deletion was reloading the page.
  const [delState, deleteAction, deleting] = useActionState<ChildOpState, FormData>(
    deleteChild,
    null,
  );

  return (
    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn-ghost" onClick={() => setShow((v) => !v)}>
        {tt("child.resetPw")}
      </button>
      <form ref={deleteFormRef} action={deleteAction}>
        <input type="hidden" name="student_profile_id" value={studentProfileId} />
        {/* R9: proper button (ghost geometry, danger tint) — the old bare
            .link-danger text link looked broken next to the .btn-ghost row. */}
        <button
          type="button"
          className="btn-ghost danger"
          onClick={() => setConfirmOpen(true)}
          disabled={deleting}
        >
          {tt("child.deleteChild")}
        </button>
      </form>
      <ConfirmModal
        isOpen={confirmOpen}
        message={tt("child.deleteConfirm")}
        confirmLabel={tt("child.deleteChild")}
        cancelLabel={tt("profile.cancel")}
        pending={deleting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          // Close FIRST, then submit — same order as the other confirm-then-
          // requestSubmit widgets (ManageSubjects, DeleteAccountButton). The
          // outcome belongs on the card, not in a dialog nobody can dismiss:
          // on success the revalidate takes the card and this component with
          // it, and on a refusal the line below is what stays behind.
          setConfirmOpen(false);
          deleteFormRef.current?.requestSubmit();
        }}
      />
      {/* A refused deletion, in the parent's language. role="alert" because by
          the time this appears the dialog has closed and focus has returned to
          the trigger, so a screen-reader user would otherwise never hear that
          anything happened. The `childNotFound` wording normally never renders
          at all — the child really is gone, so the revalidate takes the whole
          card — which leaves it saying the right thing for the one refusal
          where the card SURVIVES: an id the server could not match. */}
      {delState?.error && (
        <span className="form-error" role="alert" style={{ flexBasis: "100%" }}>
          {delState.error}
        </span>
      )}

      {show && (
        <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexBasis: "100%" }}>
          <input type="hidden" name="student_profile_id" value={studentProfileId} />
          <input
            name="new_password"
            type="password"
            minLength={8}
            required
            className="inline-input"
            placeholder={tt("child.newPassword")}
          />
          <button type="submit" className="btn-ghost" disabled={pending}>
            {tt("child.resetPwSubmit")}
          </button>
          {state?.ok && <span className="muted">{tt("child.resetPwOk")}</span>}
          {state?.error && <span className="form-error">{state.error}</span>}
        </form>
      )}
    </div>
  );
}
