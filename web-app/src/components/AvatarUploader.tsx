"use client";

// Avatar upload control — Round 8 restyle only (logic unchanged). Renders a
// grouped photo-actions block for the identity header: "Change/Upload photo"
// as an outline button, "Remove photo" as a danger TEXT button, with the
// helper line ("JPG or PNG, maximum 2 MB.") directly underneath. Client-side
// guards (image mime + ≤2MB) give instant feedback; the server re-validates
// as the real gate (setOwnAvatar / removeOwnAvatar).
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
    <div className="prof2-photo-actions">
      <div className="prof2-photo-btns">
        <form ref={formRef} action={action}>
          <label className="prof2-btn prof2-btn-outline prof2-upload-btn">
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
            <button
              type="submit"
              className="prof2-btn-text-danger"
              disabled={removing}
            >
              {labels.remove}
            </button>
          </form>
        )}
      </div>

      <p className="prof2-hint">{labels.hint}</p>
      {err && <p className="prof2-error">{err}</p>}
    </div>
  );
}
