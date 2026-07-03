"use client";

import { useActionState, useRef } from "react";
import {
  setChildOwnAvatar,
  removeChildOwnAvatar,
  type ChildProfileState,
} from "@/lib/auth/childProfileActions";

// Child avatar upload/change/remove control — Round 8 restyle only (logic
// unchanged). Mirrors the parent AvatarUploader look: outline "Change/Upload
// photo" button + danger TEXT "Remove photo" button with the helper line
// underneath. Submits the hidden file input straight to setChildOwnAvatar on
// selection so the flow stays a single tap. Arena-scoped prof2 overrides in
// CSS keep it legible inside the dark student shell.
export function ChildAvatarUploader({
  hasAvatar,
  dict,
}: {
  hasAvatar: boolean;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const formRef = useRef<HTMLFormElement>(null);
  const [upState, upAction, upPending] = useActionState<ChildProfileState, FormData>(
    setChildOwnAvatar,
    null,
  );
  const [rmState, rmAction, rmPending] = useActionState<ChildProfileState, FormData>(
    removeChildOwnAvatar,
    null,
  );

  const error = upState?.error ?? rmState?.error;

  return (
    <div className="prof2-photo-actions">
      <div className="prof2-photo-btns">
        <form ref={formRef} action={upAction}>
          <label className="prof2-btn prof2-btn-outline prof2-upload-btn">
            {upPending
              ? tt("profile.uploadAvatar")
              : hasAvatar
                ? tt("profile.changeAvatar")
                : tt("profile.uploadAvatar")}
            <input
              type="file"
              name="avatar"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              disabled={upPending}
              onChange={(e) => {
                if (e.currentTarget.files?.length) formRef.current?.requestSubmit();
              }}
            />
          </label>
        </form>
        {hasAvatar && (
          <form action={rmAction}>
            <button
              type="submit"
              className="prof2-btn-text-danger"
              disabled={rmPending}
            >
              {tt("profile.removeAvatar")}
            </button>
          </form>
        )}
      </div>
      <p className="prof2-hint">{tt("profile.avatarHint")}</p>
      {error && <p className="prof2-error">{error}</p>}
    </div>
  );
}
