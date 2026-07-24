"use client";

// Per-sticker delete button. The DB guard blocks a delete that would drop an
// ENABLED theme below 6 stickers — the action maps that to "err.keepFive",
// surfaced here as a friendly localized message.
import { useActionState } from "react";
import { ActionButton } from "@/components/ActionButton";
import {
  deleteStickerImage,
  type StickerActionState,
} from "@/lib/admin/stickers";

export function StickerImageDeleteButton({
  id,
  label,
  pendingLabel,
  confirmText,
  errKeepFive,
  errGeneric,
}: {
  id: string;
  label: string;
  pendingLabel?: string;
  confirmText: string;
  errKeepFive: string;
  errGeneric: string;
}) {
  const [state, action, pending] = useActionState<StickerActionState, FormData>(
    deleteStickerImage,
    null,
  );

  const msg = state?.error
    ? state.error === "err.keepFive"
      ? errKeepFive
      : errGeneric
    : null;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="__id" value={id} />
      <ActionButton
        className="link-danger"
        pending={pending}
        pendingLabel={pendingLabel}
      >
        {label}
      </ActionButton>
      {msg && (
        <span className="form-error" style={{ display: "block", marginTop: 4 }}>
          {msg}
        </span>
      )}
    </form>
  );
}
