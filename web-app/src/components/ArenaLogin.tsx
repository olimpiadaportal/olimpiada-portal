"use client";

import { useActionState, useState } from "react";
import { childLoginAction, type ChildLoginState } from "@/lib/auth/childActions";
import { parentLogin, type AuthFormState } from "@/lib/auth/parentService";
import { PasswordInput } from "@/components/PasswordInput";

type Tab = "student" | "parent";

// Arena split-layout login with two user-type tabs: Şagird (Student) and
// Valideyn (Parent) ONLY — no Center/Admin tab (admin is a separate panel).
// Reuses the existing server actions: childLoginAction + parentLogin.
export function ArenaLogin({
  dict,
  defaultTab = "student",
}: {
  dict: Record<string, string>;
  defaultTab?: Tab;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [tab, setTab] = useState<Tab>(defaultTab);

  const [childState, childAction, childPending] = useActionState<ChildLoginState, FormData>(
    childLoginAction,
    null,
  );
  const [parentState, parentAction, parentPending] = useActionState<AuthFormState, FormData>(
    parentLogin,
    null,
  );

  return (
    <div className="arena-auth-card">
      <div className="arena-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "student"}
          className={`arena-tab${tab === "student" ? " active" : ""}`}
          onClick={() => setTab("student")}
        >
          {tt("auth.tab.student")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "parent"}
          className={`arena-tab${tab === "parent" ? " active" : ""}`}
          onClick={() => setTab("parent")}
        >
          {tt("auth.tab.parent")}
        </button>
      </div>

      {tab === "student" ? (
        <form action={childAction} className="arena-form">
          <div className="arena-field">
            <label className="arena-label" htmlFor="child_id">
              {tt("child.id")}
            </label>
            <input
              id="child_id"
              name="child_id"
              className="arena-input mono"
              inputMode="numeric"
              pattern="\d{8}"
              maxLength={8}
              required
              placeholder="12345678"
              autoComplete="username"
            />
          </div>
          <div className="arena-field">
            <label className="arena-label" htmlFor="child_pw">
              {tt("child.password")}
            </label>
            <PasswordInput
              id="child_pw"
              name="password"
              className="arena-input"
              required
              autoComplete="current-password"
              placeholder={tt("parent.auth.passwordPh")}
              showLabel={tt("auth.showPassword")}
              hideLabel={tt("auth.hidePassword")}
            />
          </div>
          {childState?.error && <p className="arena-error">{childState.error}</p>}
          <button className="arena-btn" type="submit" disabled={childPending}>
            {childPending ? tt("child.loggingIn") : tt("child.login")}
          </button>
        </form>
      ) : (
        <form action={parentAction} className="arena-form">
          <div className="arena-field">
            <label className="arena-label" htmlFor="parent_email">
              {tt("parent.auth.email")}
            </label>
            <input
              id="parent_email"
              name="email"
              type="email"
              className="arena-input"
              required
              autoComplete="email"
              placeholder={tt("parent.auth.emailPh")}
            />
          </div>
          <div className="arena-field">
            <label className="arena-label" htmlFor="parent_pw">
              {tt("parent.auth.password")}
            </label>
            <PasswordInput
              id="parent_pw"
              name="password"
              className="arena-input"
              required
              autoComplete="current-password"
              placeholder={tt("parent.auth.passwordPh")}
              showLabel={tt("auth.showPassword")}
              hideLabel={tt("auth.hidePassword")}
            />
          </div>
          {parentState?.error && <p className="arena-error">{parentState.error}</p>}
          <button className="arena-btn" type="submit" disabled={parentPending}>
            {parentPending ? tt("parent.auth.submitting") : tt("parent.auth.login")}
          </button>
          <p className="arena-auth-alt">
            {tt("parent.auth.noAccount")} <a href="/register">{tt("nav.register")}</a>
          </p>
        </form>
      )}
    </div>
  );
}
