"use client";

import { useActionState, useState } from "react";
import { updateParent, type UpdateParentState } from "@/lib/admin/accounts";

type Strings = {
  open: string;
  title: string;
  displayName: string;
  phone: string;
  phoneHint: string;
  email: string;
  status: string;
  statusActive: string;
  statusSuspended: string;
  profileId: string;
  submit: string;
  submitting: string;
  done: string;
  cancel: string;
};

export function AccountEditForm({
  parentProfileId,
  currentName,
  currentEmail,
  currentPhone,
  currentStatus,
  strings,
}: {
  parentProfileId: string;
  currentName: string;
  currentEmail: string;
  currentPhone: string;
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
    <form
      action={action}
      className="card"
      style={{
        marginTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <strong>{strings.title}</strong>
      {/* The profile id is the target row identifier — submitted hidden and shown
          READ-ONLY. It is never an editable field. */}
      <input type="hidden" name="parent_profile_id" value={parentProfileId} />
      <div className="field">
        <span>{strings.profileId}</span>
        <div className="fawiz-locked-value muted nowrap">{parentProfileId}</div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>{strings.displayName}</span>
          <input
            name="display_name"
            defaultValue={currentName}
            maxLength={160}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>{strings.email}</span>
          <input
            type="email"
            name="email"
            defaultValue={currentEmail}
            maxLength={254}
            required
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>{strings.phone}</span>
          <input
            name="phone"
            defaultValue={currentPhone}
            maxLength={20}
            placeholder="+994…"
            autoComplete="off"
          />
          <small className="muted">{strings.phoneHint}</small>
        </label>
        <label className="field">
          <span>{strings.status}</span>
          <select name="status" defaultValue={initialStatus}>
            <option value="active">{strings.statusActive}</option>
            <option value="suspended">{strings.statusSuspended}</option>
          </select>
        </label>
      </div>

      <div className="row-actions">
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
      </div>
    </form>
  );
}
