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
  const [deleting, setDeleting] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ChildOpState, FormData>(
    resetChildPasswordAction,
    null,
  );

  return (
    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn-ghost" onClick={() => setShow((v) => !v)}>
        {tt("child.resetPw")}
      </button>
      <form ref={deleteFormRef} action={deleteChild}>
        <input type="hidden" name="student_profile_id" value={studentProfileId} />
        {/* R9: proper button (ghost geometry, danger tint) — the old bare
            .link-danger text link looked broken next to the .btn-ghost row. */}
        <button
          type="button"
          className="btn-ghost danger"
          onClick={() => setConfirmOpen(true)}
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
          setDeleting(true);
          deleteFormRef.current?.requestSubmit();
        }}
      />

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
