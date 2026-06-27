"use client";

import { useActionState } from "react";
import { createPanelUser, type CreateUserState } from "@/lib/admin/users";

type Strings = {
  email: string;
  name: string;
  role: string;
  password: string;
  passwordHint: string;
  submit: string;
  submitting: string;
  created: string;
  select: string;
};

export function CreateUserForm({
  strings,
  roles,
}: {
  strings: Strings;
  roles: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(
    createPanelUser,
    null,
  );

  return (
    <form action={action} className="form">
      <div className="form-grid">
        <label className="field">
          <span className="field-label">
            {strings.email}
            <span className="req"> *</span>
          </span>
          <input type="email" name="email" required autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">{strings.name}</span>
          <input type="text" name="display_name" autoComplete="off" />
        </label>
        <label className="field">
          <span className="field-label">
            {strings.role}
            <span className="req"> *</span>
          </span>
          <select name="role" required defaultValue="">
            <option value="">{strings.select}</option>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">
            {strings.password}
            <span className="req"> *</span>
          </span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
      </div>

      <p className="hint">{strings.passwordHint}</p>
      {state?.error && <p className="form-error">{state.error}</p>}
      {state?.ok && <p className="form-ok">{strings.created}</p>}

      <button className="btn" type="submit" disabled={pending}>
        {pending ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}
