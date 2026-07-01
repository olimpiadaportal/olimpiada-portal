"use client";

import { useActionState } from "react";
import {
  registerParent,
  parentLogin,
  type AuthFormState,
} from "@/lib/auth/parentService";
import { PasswordInput } from "@/components/PasswordInput";

export function ParentAuthForm({
  mode,
  dict,
}: {
  mode: "login" | "register";
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const fn = mode === "register" ? registerParent : parentLogin;
  const [state, action, pending] = useActionState<AuthFormState, FormData>(fn, null);

  return (
    <form action={action} className="form auth-form">
      {mode === "register" && (
        <>
          <label className="field">
            <span className="field-label">{tt("parent.auth.firstName")} *</span>
            <input
              name="first_name"
              required
              autoComplete="given-name"
              placeholder={tt("parent.auth.firstNamePh")}
            />
          </label>
          <label className="field">
            <span className="field-label">{tt("parent.auth.lastName")} *</span>
            <input
              name="last_name"
              required
              autoComplete="family-name"
              placeholder={tt("parent.auth.lastNamePh")}
            />
          </label>
        </>
      )}
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
      <label className="field">
        <span className="field-label">{tt("parent.auth.password")} *</span>
        <PasswordInput
          name="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          placeholder={tt("parent.auth.passwordPh")}
          showLabel={tt("auth.showPassword")}
          hideLabel={tt("auth.hidePassword")}
        />
      </label>
      {state?.error && <p className="form-error">{state.error}</p>}
      <button className="btn" type="submit" disabled={pending}>
        {pending
          ? tt("parent.auth.submitting")
          : tt(mode === "register" ? "parent.auth.register" : "parent.auth.login")}
      </button>
    </form>
  );
}
