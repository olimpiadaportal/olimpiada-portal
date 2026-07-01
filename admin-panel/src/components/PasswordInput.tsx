"use client";

import { useState, type InputHTMLAttributes } from "react";

type Strings = {
  /** aria-label for the toggle when the password is hidden ("Show password"). */
  show: string;
  /** aria-label for the toggle when the password is visible ("Hide password"). */
  hide: string;
};

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  strings: Strings;
};

/**
 * Admin password field with a show/hide eye toggle.
 *
 * Pure presentation: it only flips the input's `type` between "password" and
 * "text" — no auth logic. Forwards every other input prop (name, required,
 * minLength, autoComplete, placeholder, aria-label, defaultValue…) straight to
 * the underlying <input>, so it is a drop-in replacement for an existing
 * password <input>. Styled with the admin `.pw-field` / `.pw-input` / `.pw-eye`
 * classes (see globals.css) so it matches the admin `.field` look in any
 * container (a `.field` label or an `.inline-form`).
 */
export function PasswordInput({ strings, ...inputProps }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="pw-field">
      <input
        {...inputProps}
        type={visible ? "text" : "password"}
        className={
          inputProps.className
            ? `pw-input ${inputProps.className}`
            : "pw-input"
        }
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? strings.hide : strings.show}
        aria-pressed={visible}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </span>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
