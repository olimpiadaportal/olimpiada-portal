"use client";

import { useActionState, useState } from "react";
import {
  registerParent,
  parentLogin,
  type AuthFormState,
} from "@/lib/auth/parentService";
import { PasswordInput } from "@/components/PasswordInput";
import { PhoneField } from "@/components/PhoneField";
import { ResendConfirmationForm } from "@/components/ResendConfirmationForm";
import { useT } from "@/i18n/I18nProvider";

export function ParentAuthForm({
  mode,
  dict,
  locale = "az",
}: {
  mode: "login" | "register";
  dict: Record<string, string>;
  /** Active UI locale — used for localized country names in the phone field. */
  locale?: string;
}) {
  // The page hands down a fixed KEYS dictionary; `useT()` is the whole
  // (single-locale, override-aware) catalogue the root layout already ships to
  // every client component. Reading the prop FIRST keeps the page's admin
  // "Website Content" overrides winning, while a key the page's list does not
  // enumerate still resolves instead of rendering as itself.
  const tClient = useT();
  const tt = (k: string) => dict[k] ?? tClient(k);
  const fn = mode === "register" ? registerParent : parentLogin;
  const [state, action, pending] = useActionState<AuthFormState, FormData>(fn, null);

  // "Email already registered" is the one error resubmitting cannot fix — the
  // same address will be rejected identically every time. So the button stays
  // DISABLED until the address actually changes, which turns a dead retry loop
  // into an obvious "edit this field" cue.
  //
  // Compared against the server's NORMALIZED echo (trimmed + lowercased), so
  // retyping the same address with different capitalisation or a stray space
  // does not re-enable the button on a change that the server would collapse
  // back to the same value.
  const [email, setEmail] = useState("");
  const emailRejected =
    mode === "register" &&
    state?.code === "email_exists" &&
    !!state.rejectedEmail &&
    email.trim().toLowerCase() === state.rejectedEmail;

  // Registration succeeded and needs confirmation. Rendered IN PLACE instead of
  // redirecting to /verify-email, so `email` is still the address the user just
  // typed — the resend below needs no cookie, no query parameter and no second
  // round of typing. Mirrors the mobile register screen exactly.
  if (state?.verifyEmail) {
    const typed = email.trim();
    return (
      <section className="prose" style={{ maxWidth: 460 }}>
        <h2 style={{ marginTop: 0 }}>{tt("verify.title")}</h2>
        <p>
          {tt("verify.bodyTo")} <strong>{typed}</strong>
        </p>
        <p className="muted">{tt("verify.hint")}</p>
        <p className="muted" style={{ marginTop: 18 }}>
          {tt("verify.resendPrompt")}
        </p>
        {/* justSent: registration triggered a mail this instant, so GoTrue's
            per-address interval is already running — the button must arrive
            counting down rather than offering a tap that silently does nothing. */}
        <ResendConfirmationForm dict={dict} justSent knownEmail={typed} />
        <p style={{ marginTop: 14 }}>
          <a className="btn-ghost" href="/login">
            {tt("nav.login")}
          </a>
        </p>
      </section>
    );
  }

  // WHY THESE ARE `defaultValue` AND NOT A `key=` TRICK. React 19 resets a form
  // after its action runs, unconditionally: react-dom queues `requestFormReset`
  // BEFORE calling the action, so nothing the action returns — and no
  // `preventDefault`, and no remount — can call it off. What it CAN do is
  // decide what the fields reset TO, because React writes `defaultValue` onto
  // the nodes earlier in the same commit than the reset. So the action echoes
  // the submitted values and they are re-seeded here.
  //
  // The email box and the phone field need nothing: both are controlled, and
  // React keeps a controlled input's `defaultValue` in step with its `value`,
  // which is exactly why only these two plain inputs ever lost their contents.
  //
  // The password is NOT echoed — see AuthFormState. Losing it is the deliberate
  // trade: echoing it would put a plaintext credential in the RSC payload and
  // the page HTML. The hint under the field says so, in the user's language.
  const values = state?.values;
  const invalid = state?.field;
  // The password field is empty again after ANY failed registration attempt, so
  // say why — otherwise the names surviving while the password vanishes reads
  // like a bug. Guarded against a missing catalogue entry the way PhoneField
  // guards `field.optional`: no string, no line, never a raw key on screen.
  const clearedHint = tt("auth.pw.cleared");
  const cleared =
    mode === "register" && !!state?.error && clearedHint !== "auth.pw.cleared";

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
              defaultValue={values?.first_name ?? ""}
              aria-invalid={invalid === "firstName" || undefined}
            />
          </label>
          <label className="field">
            <span className="field-label">{tt("parent.auth.lastName")} *</span>
            <input
              name="last_name"
              required
              autoComplete="family-name"
              placeholder={tt("parent.auth.lastNamePh")}
              defaultValue={values?.last_name ?? ""}
              aria-invalid={invalid === "lastName" || undefined}
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailRejected || invalid === "email" || undefined}
        />
      </label>
      {mode === "register" && (
        <PhoneField
          locale={locale}
          label={tt("parent.auth.phone")}
          countryLabel={tt("parent.auth.phoneCountry")}
          searchLabel={tt("parent.auth.phoneSearch")}
          placeholder={tt("parent.auth.phonePh")}
          invalidMessage={tt("parent.err.phone")}
        />
      )}
      <label className="field">
        <span className="field-label">{tt("parent.auth.password")} *</span>
        {/* The checklist turns itself on for `new-password` and stays off for
            the login field; `problem` points it at the rule the server refused. */}
        <PasswordInput
          name="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          placeholder={tt("parent.auth.passwordPh")}
          showLabel={tt("auth.showPassword")}
          hideLabel={tt("auth.hidePassword")}
          problem={state?.passwordProblem ?? null}
          aria-invalid={invalid === "password" || undefined}
        />
        {cleared && (
          <span className="hint" style={{ margin: 0 }}>
            {clearedHint}
          </span>
        )}
      </label>
      {/* role="alert" so the reason is announced: the form has just been reset
          under the user and the message is the only thing that explains it. */}
      {state?.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {/* A duplicate address is the one case with an obvious next step, so
          offer it rather than leaving the user to find the login page. */}
      {emailRejected && (
        <p className="form-hint">
          <a href="/login">{tt("parent.auth.login")}</a>
        </p>
      )}
      <button className="btn" type="submit" disabled={pending || emailRejected}>
        {pending
          ? tt("parent.auth.submitting")
          : tt(mode === "register" ? "parent.auth.register" : "parent.auth.login")}
      </button>
    </form>
  );
}
