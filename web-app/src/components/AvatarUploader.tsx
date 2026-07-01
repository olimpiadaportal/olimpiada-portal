"use client";

// Avatar upload control (Phase E2). Wraps a hidden file input + the setOwnAvatar
// server action (multipart FormData with field "avatar"). Client-side guards
// (image mime + ≤2MB) give instant feedback; the server re-validates as the real
// gate. Uses E1's contract classes (.avatar-upload, .avatar-upload-btn) verbatim.
import { useActionState, useRef } from "react";
import {
  setOwnAvatar,
  removeOwnAvatar,
  type ProfileActionState,
} from "@/lib/auth/profileActions";

const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarUploader({
  hasAvatar,
  labels,
}: {
  hasAvatar: boolean;
  labels: {
    upload: string;
    change: string;
    remove: string;
    hint: string;
    errType: string;
    errTooLarge: string;
  };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(
    setOwnAvatar,
    null,
  );
  const [removeState, removeAction, removing] = useActionState<
    ProfileActionState,
    FormData
  >(async () => removeOwnAvatar(), null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert(labels.errType);
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      alert(labels.errTooLarge);
      e.target.value = "";
      return;
    }
    formRef.current?.requestSubmit();
  };

  const err = state?.error ?? removeState?.error;

  return (
    <div className="avatar-upload">
      <form ref={formRef} action={action}>
        <label className="avatar-upload-btn btn-ghost">
          {hasAvatar ? labels.change : labels.upload}
          <input
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onPick}
            disabled={pending}
            hidden
          />
        </label>
      </form>

      {hasAvatar && (
        <form action={removeAction}>
          <button type="submit" className="link-danger" disabled={removing}>
            {labels.remove}
          </button>
        </form>
      )}

      <p className="muted">{labels.hint}</p>
      {err && <p className="form-error">{err}</p>}
    </div>
  );
}
