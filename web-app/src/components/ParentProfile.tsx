"use client";

// Parent profile — Round 8 account-settings redesign. Stacked section cards:
// (1) identity header (avatar + name/email + grouped photo actions),
// (2) account information rows, (3) security (change password), (4) danger
// zone (clearly separated, red-tinted), (5) session (calm logout). All server
// actions and flows are unchanged — this is a pure redesign. Copy arrives
// pre-localized via `dict` (prof2.* + profile.* keys resolved server-side).
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
    <div className="prof2-stack">
      {/* 1 — Identity header: avatar, name + email, photo actions grouped right. */}
      <section className="prof2-card prof2-identity" aria-label={t("profile.avatar")}>
        <span className="prof2-avatar">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name} className="prof2-avatar-img" />
          ) : (
            <span className="prof2-avatar-fallback" aria-hidden="true">
              {initials}
            </span>
          )}
        </span>
        <div className="prof2-id-meta">
          <strong className="prof2-id-name">{name}</strong>
          {email && <span className="prof2-id-email">{email}</span>}
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
      </section>

      {/* 2 — Account information. */}
      <section className="prof2-card" aria-label={t("prof2.accountInfo")}>
        <h2 className="prof2-sec-title">{t("prof2.accountInfo")}</h2>
        <div className="prof2-rows">
          <div className="prof2-row">
            <span className="prof2-row-label">{t("prof2.name")}</span>
            <span className="prof2-row-value">{name || "—"}</span>
          </div>
          <div className="prof2-row">
            <span className="prof2-row-label">{t("prof2.email")}</span>
            <span className="prof2-row-value">{email || "—"}</span>
          </div>
        </div>
      </section>

      {/* 3 — Security: change password (same updateOwnPassword action). */}
      <section className="prof2-card" aria-label={t("prof2.security")}>
        <h2 className="prof2-sec-title">{t("prof2.security")}</h2>
        <p className="prof2-sec-hint">{t("prof2.securityHint")}</p>
        {!showPw ? (
          <button
            type="button"
            className="prof2-btn prof2-btn-outline"
            onClick={() => setShowPw(true)}
            aria-expanded={false}
          >
            {t("profile.changePassword")}
          </button>
        ) : (
          <form action={pwAction} className="prof2-pwform">
            <label className="prof2-label" htmlFor="prof2-newpw">
              {t("profile.newPassword")}
            </label>
            <PasswordInput
              id="prof2-newpw"
              name="new_password"
              required
              minLength={8}
              autoComplete="new-password"
              className="prof2-input"
              placeholder={t("profile.newPassword")}
              showLabel={dict["auth.showPassword"] ?? "Show password"}
              hideLabel={dict["auth.hidePassword"] ?? "Hide password"}
            />
            <div className="prof2-form-actions">
              <button
                type="submit"
                className="prof2-btn prof2-btn-primary"
                disabled={pwPending}
              >
                {t("profile.save")}
              </button>
              <button
                type="button"
                className="prof2-btn prof2-btn-ghost"
                onClick={() => setShowPw(false)}
              >
                {t("profile.cancel")}
              </button>
            </div>
            {pwState?.ok && (
              <p className="prof2-ok">{t("profile.passwordChanged")}</p>
            )}
            {pwState?.error && <p className="prof2-error">{pwState.error}</p>}
          </form>
        )}
      </section>

      {/* 4 — Danger zone: visually separated destructive action. */}
      <section className="prof2-card prof2-danger" aria-label={t("prof2.danger")}>
        <h2 className="prof2-sec-title prof2-danger-title">{t("prof2.danger")}</h2>
        <p className="prof2-sec-hint">{t("prof2.dangerHint")}</p>
        <DeleteAccountButton
          label={t("profile.deleteAccount")}
          confirmText={dict["account.deleteConfirm"] ?? t("profile.deleteAccount")}
        />
      </section>

      {/* 5 — Session: calm secondary logout, away from destructive actions. */}
      <section className="prof2-card prof2-session" aria-label={t("prof2.session")}>
        <div className="prof2-session-meta">
          <h2 className="prof2-sec-title">{t("prof2.session")}</h2>
          <p className="prof2-sec-hint">{t("prof2.sessionHint")}</p>
        </div>
        <form action={parentLogout}>
          <button type="submit" className="prof2-btn prof2-btn-outline">
            {t("profile.logout")}
          </button>
        </form>
      </section>
    </div>
  );
}
