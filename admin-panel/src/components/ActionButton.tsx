"use client";

// Shared loading-state buttons for every async admin action (#15). Two shapes:
//
//   <ActionButton pending={pending}>       — for useActionState/useState flows
//   <SubmitButton>                          — for bare <form action={...}> forms
//                                             (reads useFormStatus itself)
//
// While pending: the button is DISABLED (native attribute — repeated clicks
// and Enter re-submits both die here), carries aria-busy, shows an inline
// spinner and, when given, swaps to pendingLabel ("Saving…"). Dimensions are
// preserved: the spinner replaces the label inside the same box (the idle
// label stays mounted invisibly to keep the width), so rows never shift.
// The frontend state is UX only — server actions keep their own idempotency
// and validation regardless.
import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pending: boolean;
  /** Label shown while pending (falls back to the idle children). */
  pendingLabel?: string;
  children: ReactNode;
};

export function ActionButton({
  pending,
  pendingLabel,
  children,
  className = "btn",
  disabled,
  type = "submit",
  ...rest
}: ActionButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={className}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      aria-live="polite"
    >
      {pending ? (
        <span className="btn-loading">
          <span className="btn-spinner" aria-hidden="true" />
          {pendingLabel ?? children}
          {/* Ghost of the widest label keeps the box from shrinking. */}
          <span className="btn-ghost-label" aria-hidden="true">
            {children}
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

type SubmitButtonProps = Omit<ActionButtonProps, "pending">;

/** ActionButton wired to the enclosing <form>'s submission state. */
export function SubmitButton(props: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return <ActionButton {...props} pending={pending} />;
}
