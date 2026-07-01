"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthFormState } from "@/lib/auth/parentService";

export function ForgotPasswordForm({ dict }: { dict: Record<string, string> }) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    null,
  );
  return (
    <form action={action} className="form auth-form">
      <label className="field">
        <span className="field-label">{tt("parent.auth.email")} *</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={tt("parent.auth.emailPh")}
        />
      </label>
      {state?.error && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? tt("parent.auth.submitting") : tt("forgot.submit")}
      </button>
    </form>
  );
}
