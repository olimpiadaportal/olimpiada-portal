"use client";

import { useActionState, useState } from "react";
import { updateParent, type UpdateParentState } from "@/lib/admin/accounts";

type Strings = {
  open: string;
  title: string;
  displayName: string;
  status: string;
  statusActive: string;
  statusSuspended: string;
  submit: string;
  submitting: string;
  done: string;
  cancel: string;
};

export function AccountEditForm({
  parentProfileId,
  currentName,
  currentStatus,
  strings,
}: {
  parentProfileId: string;
  currentName: string;
  currentStatus: string;
  strings: Strings;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<UpdateParentState, FormData>(
    updateParent,
    null,
  );

  // Only active/suspended are user-toggleable; other statuses (pending, etc.)
  // are shown but default the select to the closest editable value.
  const initialStatus =
    currentStatus === "suspended" ? "suspended" : "active";

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen(true)}
      >
        {strings.open}
      </button>
    );
  }

  return (
    <form action={action} className="inline-form" style={{ flexWrap: "wrap" }}>
      <input type="hidden" name="parent_profile_id" value={parentProfileId} />
      <label className="field">
        <input
          name="display_name"
          defaultValue={currentName}
          placeholder={strings.displayName}
          aria-label={strings.displayName}
        />
      </label>
      <label className="field">
        <select
          name="status"
          defaultValue={initialStatus}
          aria-label={strings.status}
        >
          <option value="active">{strings.statusActive}</option>
          <option value="suspended">{strings.statusSuspended}</option>
        </select>
      </label>
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
