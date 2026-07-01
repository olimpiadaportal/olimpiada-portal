"use client";

import { useActionState } from "react";
import { updatePassword, type AuthFormState } from "@/lib/auth/parentService";
import { PasswordInput } from "@/components/PasswordInput";

export function ResetPasswordForm({ dict }: { dict: Record<string, string> }) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    updatePassword,
    null,
  );
  return (
    <form action={action} className="form auth-form">
      <label className="field">
        <span className="field-label">{tt("reset.newPassword")} *</span>
        <PasswordInput
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder={tt("parent.auth.passwordPh")}
          showLabel={tt("auth.showPassword")}
          hideLabel={tt("auth.hidePassword")}
        />
      </label>
      {state?.error && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? tt("parent.auth.submitting") : tt("reset.submit")}
      </button>
    </form>
  );
}
