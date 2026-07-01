"use client";

import { useActionState, useRef } from "react";
import {
  setChildOwnAvatar,
  removeChildOwnAvatar,
  type ChildProfileState,
} from "@/lib/auth/childProfileActions";

// Arena-styled avatar upload/change/remove control for the logged-in child.
// Uses E1's contract classes (.avatar-upload, .avatar-upload-btn, .avatar-actions)
// and keys (profile.uploadAvatar / changeAvatar / removeAvatar / avatarHint).
// Submits a file input straight to setChildOwnAvatar; the hidden input is
// auto-submitted on selection so the flow is a single tap.
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
    <div className="avatar-upload">
      <div className="avatar-actions">
        <form ref={formRef} action={upAction}>
          <label className="arena-btn-ghost arena-btn-sm avatar-upload-btn">
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
              className="arena-btn-ghost arena-btn-sm link-danger"
              disabled={rmPending}
            >
              {tt("profile.removeAvatar")}
            </button>
          </form>
        )}
      </div>
      <p className="arena-muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
        {tt("profile.avatarHint")}
      </p>
      {error && (
        <p className="form-error" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
