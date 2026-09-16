"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  PASSWORD_SPECIAL_RE,
  hasUpper,
  type PasswordProblem,
} from "@/lib/auth/passwordPolicy";
import { useT } from "@/i18n/I18nProvider";

// Reusable password input with a show/hide eye toggle.
// Works on BOTH the light parent `.form` inputs and the dark `.arena-input`:
// pass the base input class via `className` (e.g. "" for .form, or "arena-input"
// for the arena). The wrapper `.pw-field` positions the `.pw-eye` button so it
// never overlaps typed text (the input reserves right padding). The two toggle
// aria-labels come in as props so this works in server-rendered pages and the
// arena alike (no client-side i18n dependency there).
//
// IT ALSO CARRIES THE PASSWORD RULES, and they belong here rather than in each
// form. Every surface where someone CHOOSES a password already marks itself as
// such with `autoComplete="new-password"` — registration, the reset-password
// page, the Add-Child wizard, both profile cards — while every sign-in field
// says `current-password`. Keying the checklist off that attribute gives all of
// them the same rules from one place, and never shows the policy on a login
// field, where it would be both useless and a hint handed to an anonymous
// visitor. Pass `requirements={false}` to opt a new-password field out.
//
// THE TYPED PASSWORD IS NEVER PUT IN STATE. The live ticks are computed inside
// the change handler from the transient event value and only three BOOLEANS are
// kept, so no plaintext credential is ever reachable from a React DevTools tree
// or an error-overlay snapshot. Do not "simplify" this into a controlled input.

/** The rules, in the order `checkNewPassword` evaluates them. */
type RuleId = "length" | "upper" | "special";

const RULES: { id: RuleId; key: string; problems: PasswordProblem[] }[] = [
  { id: "length", key: "auth.pw.req.length", problems: ["tooShort", "tooLong"] },
  { id: "upper", key: "auth.pw.req.upper", problems: ["needsUpper"] },
  { id: "special", key: "auth.pw.req.special", problems: ["needsSpecial"] },
];

// globals.css has no screen-reader-only utility and one component should not
// invent one for the whole app, so the assistive-only text is clipped inline.
const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

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
  requirements,
  problem,
  "aria-invalid": ariaInvalid,
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
  /** Show the live requirements checklist. Defaults to ON for a
   *  `new-password` field and OFF everywhere else. */
  requirements?: boolean;
  /** The SERVER's verdict on the last submission: highlights the rule that
   *  actually failed, until the user starts typing again. */
  problem?: PasswordProblem | null;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}) {
  const [visible, setVisible] = useState(false);
  // `null` = nothing typed since the last submit/reset, so the server's verdict
  // is the current truth. Booleans only — never the password.
  const [met, setMet] = useState<Record<RuleId, boolean> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const t = useT();

  const wantRequirements = requirements ?? autoComplete === "new-password";

  // React 19 resets the whole form after a form action, which empties this
  // field — so the ticks must go back to "nothing typed", or they would keep
  // claiming rules are satisfied by a password that is no longer there. The
  // native `reset` event covers React's automatic reset and any manual one.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || !wantRequirements) return;
    const onReset = () => setMet(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [wantRequirements]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    // `pw` lives for the length of this function and no longer.
    const pw = e.target.value;
    if (!pw) {
      setMet(null);
      return;
    }
    setMet({
      length: pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX,
      upper: hasUpper(pw),
      special: PASSWORD_SPECIAL_RE.test(pw),
    });
  }

  // A missing catalogue entry must never leak a raw key at a parent — the same
  // guard PhoneField applies to `field.optional`. Without the strings the field
  // simply renders the way it always did, checklist omitted.
  const title = t("auth.pw.req.title");
  const labels = RULES.map((r) => t(r.key));
  const metWord = t("auth.pw.req.met");
  const unmetWord = t("auth.pw.req.unmet");
  const translated =
    title !== "auth.pw.req.title" &&
    metWord !== "auth.pw.req.met" &&
    unmetWord !== "auth.pw.req.unmet" &&
    labels.every((text, i) => text !== RULES[i].key);
  const showRequirements = wantRequirements && translated;

  return (
    // A FRAGMENT, not one wrapper: `.pw-eye` is absolutely positioned at
    // `top: 50%` of `.pw-field`, so a checklist inside that box would recentre
    // the eye against the taller box and sink it below the input. Every call
    // site wraps this in a flex column (`.field`, `.prof2-pwform`), so the list
    // lands directly under the input anyway.
    <>
      <div className="pw-field">
        <input
          id={id}
          ref={inputRef}
          name={name}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={showRequirements ? listId : undefined}
          onChange={showRequirements ? onChange : undefined}
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

      {showRequirements && (
        // `aria-describedby` rather than a live region: a live region would
        // re-announce all three rules on every keystroke. A screen reader reads
        // the list when the field takes focus, which is when it is useful.
        <div id={listId}>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)" }}>{title}</p>
          <ul
            style={{
              listStyle: "none",
              margin: "3px 0 0",
              padding: 0,
              display: "grid",
              gap: 2,
              fontSize: "0.78rem",
            }}
          >
            {RULES.map((rule, i) => {
              // Until the user types again, the server's answer is the only
              // evidence there is, and it names exactly one failing rule.
              const failedOnServer =
                met === null && !!problem && rule.problems.includes(problem);
              const isMet = met ? met[rule.id] : false;
              const color = isMet
                ? "var(--ok)"
                : failedOnServer
                  ? "var(--danger)"
                  : "var(--muted)";
              const mark = isMet ? "✓" : failedOnServer ? "✕" : "•";
              return (
                <li
                  key={rule.id}
                  style={{ color, display: "flex", gap: 6, alignItems: "baseline" }}
                >
                  <span aria-hidden="true">{mark}</span>
                  <span>
                    {labels[i]
                      .replace("{min}", String(PASSWORD_MIN))
                      .replace("{max}", String(PASSWORD_MAX))}
                  </span>
                  <span style={SR_ONLY}>{isMet ? metWord : unmetWord}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
