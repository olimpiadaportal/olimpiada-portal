"use client";

// Edit / delete controls for one row of the Users table.
//
// The Super Admin row and the viewer's OWN row get restricted controls, but the
// restriction is decided by the SERVER (users/page.tsx passes `locked`) and
// enforced again by the server actions and the database. Disabling a button
// here is presentation only.
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { ActionButton } from "@/components/ActionButton";
import {
  deletePanelUser,
  updatePanelUser,
  type UserMutationState,
} from "@/lib/admin/users";

export type PanelUserActionStrings = {
  edit: string;
  delete: string;
  editTitle: string;
  name: string;
  role: string;
  save: string;
  saving: string;
  cancel: string;
  updated: string;
  deleteTitle: string;
  /** Contains "{email}". */
  deleteBody: string;
  deleteConfirm: string;
  deleting: string;
  close: string;
};

type Props = {
  profileId: string;
  email: string;
  name: string;
  role: string;
  roles: { value: string; label: string }[];
  /** "super" = nothing may change; "self" = rename only; null = everything. */
  locked: "super" | "self" | null;
  lockedReason?: string;
  strings: PanelUserActionStrings;
};

export function PanelUserActions({ profileId, email, name, role, roles, locked, lockedReason, strings }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editState, editAction, editPending] = useActionState<UserMutationState, FormData>(updatePanelUser, null);
  const [delState, delAction, delPending] = useActionState<UserMutationState, FormData>(deletePanelUser, null);

  // Close the dialog only once the SERVER confirms; refresh so the table shows
  // what is really in the database.
  useEffect(() => {
    if (editState?.ok) {
      setEditOpen(false);
      router.refresh();
    }
  }, [editState, router]);
  useEffect(() => {
    if (delState?.ok) {
      setDeleteOpen(false);
      router.refresh();
    }
  }, [delState, router]);

  if (locked === "super") {
    return (
      <span className="row-actions" title={lockedReason} aria-label={lockedReason}>
        <button type="button" className="btn-ghost btn-sm" disabled aria-disabled="true">
          {strings.edit}
        </button>
        <button type="button" className="btn-ghost btn-danger-ghost btn-sm" disabled aria-disabled="true">
          {strings.delete}
        </button>
      </span>
    );
  }

  return (
    <span className="row-actions">
      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditOpen(true)}>
        {strings.edit}
      </button>
      <button
        type="button"
        className="btn-ghost btn-danger-ghost btn-sm"
        onClick={() => setDeleteOpen(true)}
        disabled={locked === "self"}
        aria-disabled={locked === "self" || undefined}
        title={locked === "self" ? lockedReason : undefined}
      >
        {strings.delete}
      </button>

      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title={strings.editTitle}
        closeLabel={strings.close}
        busy={editPending}
      >
        <form action={editAction} className="form">
          <input type="hidden" name="profile_id" value={profileId} />
          <p className="muted" style={{ marginTop: 0 }}>{email}</p>
          <label className="field">
            <span className="field-label">{strings.name}</span>
            <input type="text" name="display_name" defaultValue={name} maxLength={120} autoComplete="off" />
          </label>
          <label className="field">
            <span className="field-label">{strings.role}</span>
            <select
              name="role"
              defaultValue={role}
              disabled={locked === "self"}
              title={locked === "self" ? lockedReason : undefined}
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {/* A disabled select is not submitted; carry the unchanged role. */}
            {locked === "self" && <input type="hidden" name="role" value={role} />}
          </label>
          {locked === "self" && lockedReason && <p className="hint">{lockedReason}</p>}
          {editState?.error && <p className="form-error">{editState.error}</p>}
          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn-ghost" onClick={() => setEditOpen(false)} disabled={editPending}>
              {strings.cancel}
            </button>
            <ActionButton className="btn" pending={editPending} pendingLabel={strings.saving}>
              {strings.save}
            </ActionButton>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={strings.deleteTitle}
        closeLabel={strings.close}
        busy={delPending}
      >
        <form action={delAction} className="form">
          <input type="hidden" name="profile_id" value={profileId} />
          <p style={{ marginTop: 0 }}>{strings.deleteBody.replace("{email}", email)}</p>
          {delState?.error && <p className="form-error">{delState.error}</p>}
          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn-ghost" onClick={() => setDeleteOpen(false)} disabled={delPending}>
              {strings.cancel}
            </button>
            <ActionButton className="btn btn-danger" pending={delPending} pendingLabel={strings.deleting}>
              {strings.deleteConfirm}
            </ActionButton>
          </div>
        </form>
      </Modal>
    </span>
  );
}
