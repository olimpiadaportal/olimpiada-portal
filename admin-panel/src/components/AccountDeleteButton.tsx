"use client";

import { useActionState, useState } from "react";
import {
  deleteParent,
  deleteChild,
  type DeleteState,
} from "@/lib/admin/accounts";

type Strings = {
  open: string;
  title: string;
  warn: string;
  confirmLabel: string;
  confirmWord: string;
  confirmHint: string;
  submit: string;
  submitting: string;
  done: string;
  cancel: string;
};

// A typed-confirm delete control. `kind` selects the parent vs. child server
// action; the matching hidden id field is sent. The submit button stays
// disabled until the operator types the confirm word exactly.
export function AccountDeleteButton({
  kind,
  targetId,
  strings,
}: {
  kind: "parent" | "child";
  targetId: string;
  strings: Strings;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const actionFn = kind === "parent" ? deleteParent : deleteChild;
  const [state, action, pending] = useActionState<DeleteState, FormData>(
    actionFn,
    null,
  );

  const idField =
    kind === "parent" ? "parent_profile_id" : "student_profile_id";
  const matches = typed === strings.confirmWord;

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost"
        style={{ color: "var(--warn-fg)" }}
        onClick={() => setOpen(true)}
      >
        {strings.open}
      </button>
    );
  }

  return (
    <form
      action={action}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <input type="hidden" name={idField} value={targetId} />
      <input type="hidden" name="confirm" value={typed} />
      <strong>{strings.title}</strong>
      <p className="muted" style={{ margin: 0 }}>
        {strings.warn}
      </p>
      <label className="field">
        <span>{strings.confirmLabel}</span>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={strings.confirmWord}
          autoComplete="off"
          aria-label={strings.confirmLabel}
        />
        <small className="muted">{strings.confirmHint}</small>
      </label>
      <div className="row-actions">
        <button
          className="btn"
          type="submit"
          disabled={pending || !matches}
        >
          {pending ? strings.submitting : strings.submit}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
        >
          {strings.cancel}
        </button>
        {state?.error && <span className="form-error">{state.error}</span>}
        {state?.ok && <span className="form-ok">{strings.done}</span>}
      </div>
    </form>
  );
}
