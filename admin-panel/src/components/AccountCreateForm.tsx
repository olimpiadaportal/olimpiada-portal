"use client";

import { useActionState, useState } from "react";
import { createParent, type CreateParentState } from "@/lib/admin/accounts";
import { PasswordInput } from "@/components/PasswordInput";

type Strings = {
  open: string;
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordHint: string;
  submit: string;
  submitting: string;
  done: string;
  cancel: string;
  showPassword: string;
  hidePassword: string;
};

export function AccountCreateForm({ strings }: { strings: Strings }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CreateParentState, FormData>(
    createParent,
    null,
  );

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {strings.open}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="card"
      style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <h3>{strings.title}</h3>
      <div className="form-grid">
        <label className="field">
          <span>{strings.firstName}</span>
          <input name="first_name" required autoComplete="off" />
        </label>
        <label className="field">
          <span>{strings.lastName}</span>
          <input name="last_name" required autoComplete="off" />
        </label>
        <label className="field">
          <span>{strings.email}</span>
          <input type="email" name="email" required autoComplete="off" />
        </label>
        <label className="field">
          <span>{strings.password}</span>
          <PasswordInput
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            strings={{ show: strings.showPassword, hide: strings.hidePassword }}
          />
          <small className="muted">{strings.passwordHint}</small>
        </label>
      </div>
      <div className="row-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? strings.submitting : strings.submit}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setOpen(false)}
        >
          {strings.cancel}
        </button>
        {state?.error && <span className="form-error">{state.error}</span>}
        {state?.ok && <span className="form-ok">{strings.done}</span>}
      </div>
    </form>
  );
}
