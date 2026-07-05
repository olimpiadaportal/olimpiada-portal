"use client";

// Detail-page controls for one sticker theme: inline rename + typed-confirm
// delete (the operator must type the exact theme name, mirroring the accounts
// delete pattern). Deleting cascades the theme's sticker rows; binaries are
// cleaned up best-effort server-side.
import { useActionState, useState } from "react";
import {
  renameStickerTheme,
  deleteStickerTheme,
  type StickerActionState,
} from "@/lib/admin/stickers";

type Strings = {
  renameLabel: string;
  save: string;
  saving: string;
  saved: string;
  errName: string;
  errDuplicate: string;
  errGeneric: string;
  deleteHeading: string;
  deleteOpen: string;
  deleteWarn: string;
  confirmLabel: string;
  confirmHint: string;
  deleteSubmit: string;
  deleting: string;
  errConfirm: string;
  cancel: string;
};

function renameError(code: string, strings: Strings): string {
  if (code === "err.name") return strings.errName;
  if (code === "err.duplicate") return strings.errDuplicate;
  return strings.errGeneric;
}

export function StickerThemeControls({
  id,
  name,
  strings,
}: {
  id: string;
  name: string;
  strings: Strings;
}) {
  const [renameState, renameAction, renamePending] = useActionState<
    StickerActionState,
    FormData
  >(renameStickerTheme, null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleteState, deleteAction, deletePending] = useActionState<
    StickerActionState,
    FormData
  >(deleteStickerTheme, null);

  const matches = typed === name;

  return (
    <div className="form">
      <form action={renameAction} className="form" style={{ marginTop: 0 }}>
        <input type="hidden" name="__id" value={id} />
        <label className="field">
          <span className="field-label">{strings.renameLabel}</span>
          <input
            type="text"
            name="name"
            defaultValue={name}
            minLength={2}
            maxLength={60}
            required
            disabled={renamePending}
          />
        </label>
        <div className="row-actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn" type="submit" disabled={renamePending}>
            {renamePending ? strings.saving : strings.save}
          </button>
          {renameState?.ok && <span className="form-ok">{strings.saved}</span>}
          {renameState?.error && (
            <span className="form-error">
              {renameError(renameState.error, strings)}
            </span>
          )}
        </div>
      </form>

      {!deleteOpen ? (
        <button
          type="button"
          className="btn-ghost"
          style={{ color: "var(--warn-fg, #b91c1c)", alignSelf: "flex-start" }}
          onClick={() => setDeleteOpen(true)}
        >
          {strings.deleteOpen}
        </button>
      ) : (
        <form
          action={deleteAction}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <input type="hidden" name="__id" value={id} />
          <input type="hidden" name="confirm" value={typed} />
          <strong>{strings.deleteHeading}</strong>
          <p className="muted" style={{ margin: 0 }}>
            {strings.deleteWarn}
          </p>
          <label className="field">
            <span className="field-label">{strings.confirmLabel}</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={name}
              autoComplete="off"
              aria-label={strings.confirmLabel}
            />
            <small className="muted">{strings.confirmHint}</small>
          </label>
          <div className="row-actions" style={{ justifyContent: "flex-start" }}>
            <button
              className="btn"
              type="submit"
              disabled={deletePending || !matches}
            >
              {deletePending ? strings.deleting : strings.deleteSubmit}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setDeleteOpen(false);
                setTyped("");
              }}
            >
              {strings.cancel}
            </button>
            {deleteState?.error && (
              <span className="form-error">
                {deleteState.error === "err.confirm"
                  ? strings.errConfirm
                  : strings.errGeneric}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
