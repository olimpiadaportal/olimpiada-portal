"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/login/actions";
import { PasswordInput } from "@/components/PasswordInput";

export function LoginForm({
  strings,
}: {
  strings: {
    email: string;
    password: string;
    submit: string;
    submitting: string;
    showPassword: string;
    hidePassword: string;
  };
}) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    signIn,
    null,
  );

  return (
    <form action={action} className="form">
      <label className="field">
        <span className="field-label">{strings.email}</span>
        <input type="email" name="email" required autoComplete="email" />
      </label>
      <label className="field">
        <span className="field-label">{strings.password}</span>
        <PasswordInput
          name="password"
          required
          autoComplete="current-password"
          strings={{ show: strings.showPassword, hide: strings.hidePassword }}
        />
      </label>

      {state?.error && <p className="form-error">{state.error}</p>}

      <button className="btn" type="submit" disabled={pending}>
        {pending ? strings.submitting : strings.submit}
      </button>
    </form>
  );
}
