"use client";

import { useActionState } from "react";
import { childLoginAction, type ChildLoginState } from "@/lib/auth/childActions";
import { PasswordInput } from "@/components/PasswordInput";

export function ChildLoginForm({ dict }: { dict: Record<string, string> }) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<ChildLoginState, FormData>(
    childLoginAction,
    null,
  );
  return (
    <form action={action} className="form auth-form">
      <label className="field">
        <span className="field-label">{tt("child.id")} *</span>
        <input
          name="child_id"
          inputMode="numeric"
          pattern="\d{8}"
          maxLength={8}
          required
          placeholder="12345678"
          autoComplete="username"
        />
      </label>
      <label className="field">
        <span className="field-label">{tt("child.password")} *</span>
        <PasswordInput
          name="password"
          required
          autoComplete="current-password"
          placeholder={tt("parent.auth.passwordPh")}
          showLabel={tt("auth.showPassword")}
          hideLabel={tt("auth.hidePassword")}
        />
      </label>
      {state?.error && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? tt("child.loggingIn") : tt("child.login")}
      </button>
    </form>
  );
}
