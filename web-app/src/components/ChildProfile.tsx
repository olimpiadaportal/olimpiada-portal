"use client";

import { useActionState, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { ChildAvatarUploader } from "@/components/ChildAvatarUploader";
import {
  childChangeOwnPassword,
  type ChildProfileState,
} from "@/lib/auth/childProfileActions";

// Child self-service profile block, rendered inside the arena "settings" area
// alongside the wallpaper picker. Uses E1's contract classes (.profile-section,
// .profile-head, .profile-avatar, .avatar-img / .avatar-fallback, .profile-grid,
// .profile-row, .profile-field) and keys, styled for the dark arena. A child
// CANNOT delete their own account — only password + avatar are exposed here.
export function ChildProfile({
  name,
  uniqueId,
  initial,
  avatarUrl,
  dict,
}: {
  name: string;
  uniqueId: string;
  initial: string;
  avatarUrl: string | null;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ChildProfileState, FormData>(
    childChangeOwnPassword,
    null,
  );

  return (
    <div className="profile-section">
      {/* Same head shape as the parent profile: avatar + identity block.
          (.profile-grid is NOT used here — its divider styling is meant for a
          full-width row grid below the head, not for content beside the avatar.) */}
      <div className="profile-head">
        <span className="profile-avatar">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="avatar-img" />
          ) : (
            <span className="avatar-fallback" aria-hidden>
              {initial}
            </span>
          )}
        </span>
        <div className="profile-field">
          <strong>{name || "—"}</strong>
          <span className="arena-muted">
            {tt("child.id")}: <span className="mono">{uniqueId || "—"}</span>
          </span>
        </div>
      </div>

      <ChildAvatarUploader hasAvatar={avatarUrl !== null} dict={dict} />

      <div className="avatar-actions">
        <button
          type="button"
          className="arena-btn-ghost arena-btn-sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {tt("profile.changePassword")}
        </button>
      </div>

      {open && (
        <form action={action} className="form">
          <label className="field">
            <span className="field-label">{tt("profile.newPassword")}</span>
            <PasswordInput
              name="new_password"
              required
              minLength={8}
              autoComplete="new-password"
              className="arena-input"
              showLabel={tt("auth.showPassword")}
              hideLabel={tt("auth.hidePassword")}
            />
          </label>
          {state?.error && <p className="form-error">{state.error}</p>}
          {state?.ok && <p className="arena-muted">{tt("profile.passwordChanged")}</p>}
          <div className="avatar-actions form-actions">
            <button className="arena-btn arena-btn-sm" type="submit" disabled={pending}>
              {tt("profile.save")}
            </button>
            <button
              type="button"
              className="arena-btn-ghost arena-btn-sm"
              onClick={() => setOpen(false)}
            >
              {tt("profile.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
