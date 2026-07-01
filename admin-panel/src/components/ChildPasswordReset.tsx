"use client";

import { useActionState, useState } from "react";
import {
  resetChildPassword,
  type ResetChildPasswordState,
} from "@/lib/admin/accounts";
import { PasswordInput } from "@/components/PasswordInput";

type Strings = {
  reset: string;
  cancel: string;
  newPassword: string;
  hint: string;
  submit: string;
  submitting: string;
  done: string;
  showPassword: string;
  hidePassword: string;
};

export function ChildPasswordReset({
  studentProfileId,
  strings,
}: {
  studentProfileId: string;
  strings: Strings;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<
    ResetChildPasswordState,
    FormData
  >(resetChildPassword, null);

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen(true)}
      >
        {strings.reset}
      </button>
    );
  }

  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="student_profile_id" value={studentProfileId} />
      <PasswordInput
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder={strings.newPassword}
        aria-label={strings.newPassword}
        strings={{ show: strings.showPassword, hide: strings.hidePassword }}
      />
      <button className="btn" type="submit" disabled={pending}>
        {pending ? strings.submitting : strings.submit}
      </button>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen(false)}
      >
        {strings.cancel}
      </button>
      {state?.error && <span className="form-error">{state.error}</span>}
      {state?.ok && <span className="form-ok">{strings.done}</span>}
    </form>
  );
}
