"use client";

import { useState } from "react";

// Reusable password input with a show/hide eye toggle.
// Works on BOTH the light parent `.form` inputs and the dark `.arena-input`:
// pass the base input class via `className` (e.g. "" for .form, or "arena-input"
// for the arena). The wrapper `.pw-field` positions the `.pw-eye` button so it
// never overlaps typed text (the input reserves right padding). The two toggle
// aria-labels come in as props so this works in server-rendered pages and the
// arena alike (no client-side i18n dependency here).
export function PasswordInput({
  name,
  id,
  placeholder,
  required,
  minLength,
  autoComplete,
  defaultValue,
  className,
  showLabel,
  hideLabel,
  "aria-label": ariaLabel,
}: {
  name: string;
  id?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  defaultValue?: string;
  className?: string;
  showLabel: string;
  hideLabel: string;
  "aria-label"?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pw-field">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-label={ariaLabel}
        className={className}
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        tabIndex={0}
      >
        {visible ? (
          // eye-off
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9.9 9.9 0 0112 5c5 0 9 4.5 10 7-.5 1.2-1.5 2.7-3 4M6.2 6.2C4.2 7.6 2.7 9.6 2 12c1 2.5 5 7 10 7 1.5 0 2.9-.4 4.1-1"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          // eye
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        )}
      </button>
    </div>
  );
}
