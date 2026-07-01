"use client";

// Parent profile section (Phase E2). Renders the avatar (image or initials
// fallback), name + email, and self-service actions: change password (inline
// form → updateOwnPassword), upload/change/remove avatar (AvatarUploader),
// delete account (reused DeleteAccountButton), and logout (reused parentLogout
// form). All copy comes from the server via `dict` (already localized). Uses
// E1's contract classes verbatim.
import { useActionState, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { AvatarUploader } from "@/components/AvatarUploader";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { parentLogout } from "@/lib/auth/parentService";
import {
  updateOwnPassword,
  type ProfileActionState,
} from "@/lib/auth/profileActions";

export function ParentProfile({
  name,
  email,
  initials,
  avatarUrl,
  dict,
}: {
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  dict: Record<string, string>;
}) {
  const t = (k: string) => dict[k] ?? k;
  const [showPw, setShowPw] = useState(false);
  const [pwState, pwAction, pwPending] = useActionState<
    ProfileActionState,
    FormData
  >(updateOwnPassword, null);

  return (
    <section className="profile-section" id="profile" aria-label={t("profile.title")}>
      <div className="profile-head">
        <div className="profile-avatar">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name} className="avatar-img" />
          ) : (
            <span className="avatar-fallback" aria-hidden="true">
              {initials}
            </span>
          )}
        </div>

        <div className="profile-field">
          <strong>{name}</strong>
          <span className="muted">{email}</span>
        </div>
      </div>

      <AvatarUploader
        hasAvatar={Boolean(avatarUrl)}
        labels={{
          upload: t("profile.uploadAvatar"),
          change: t("profile.changeAvatar"),
          remove: t("profile.removeAvatar"),
          hint: t("profile.avatarHint"),
          errType: t("profile.err.fileType"),
          errTooLarge: t("profile.err.fileTooLarge"),
        }}
      />

      <div className="avatar-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowPw((v) => !v)}
          aria-expanded={showPw}
        >
          {t("profile.changePassword")}
        </button>

        <DeleteAccountButton
          label={t("profile.deleteAccount")}
          confirmText={dict["account.deleteConfirm"] ?? t("profile.deleteAccount")}
        />

        <form action={parentLogout}>
          <button type="submit" className="btn-ghost">
            {t("profile.logout")}
          </button>
        </form>
      </div>

      {showPw && (
        <form action={pwAction} className="form profile-row">
          <label className="field">
            <span>{t("profile.newPassword")}</span>
            <PasswordInput
              name="new_password"
              required
              minLength={8}
              autoComplete="new-password"
              className=""
              placeholder={t("profile.newPassword")}
              showLabel={dict["auth.showPassword"] ?? "Show password"}
              hideLabel={dict["auth.hidePassword"] ?? "Hide password"}
            />
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit" className="btn" disabled={pwPending}>
              {t("profile.save")}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowPw(false)}
            >
              {t("profile.cancel")}
            </button>
            {pwState?.ok && <span className="muted">{t("profile.passwordChanged")}</span>}
            {pwState?.error && <span className="form-error">{pwState.error}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
