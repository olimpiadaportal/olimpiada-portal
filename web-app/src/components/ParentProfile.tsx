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
import { PhoneField } from "@/components/PhoneField";
import { ProfileNameEditor } from "@/components/ProfileNameEditor";
import { parentLogout } from "@/lib/auth/parentService";
import {
  updateOwnPassword,
  updateOwnName,
  updateOwnPhone,
  type ProfileActionState,
} from "@/lib/auth/profileActions";

export function ParentProfile({
  name,
  displayName,
  email,
  phone,
  initials,
  avatarUrl,
  locale,
  dict,
}: {
  /** Header display name (falls back to email/account when blank). */
  name: string;
  /** Raw profiles.display_name for the editable field (may be blank). */
  displayName: string;
  email: string;
  /** E.164 phone from profiles.phone; null for pre-Round-11 accounts. */
  phone?: string | null;
  initials: string;
  avatarUrl: string | null;
  /** Active UI locale — drives the phone field's localized country names. */
  locale: string;
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
          <ProfileNameEditor
            mode="single"
            current={displayName}
            action={updateOwnName}
            labels={{
              valueLabel: t("prof2.name"),
              edit: t("profile.editName"),
              save: t("profile.save"),
              saving: t("profile.saving"),
              cancel: t("profile.cancel"),
              fullName: t("profile.fullName"),
              firstName: t("profile.firstNameLabel"),
              lastName: t("profile.lastNameLabel"),
            }}
          />
          <div className="prof2-row">
            <span className="prof2-row-label">{t("prof2.email")}</span>
            <span className="prof2-row-value">{email || "—"}</span>
          </div>
          <PhoneRowEditor current={phone ?? ""} locale={locale} t={t} />
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

// Phone add/edit module. registerParent writes profiles.phone best-effort, so
// accounts legitimately have none — the affordance therefore says "Add number"
// when it is empty and "Change" when it is not. States mirror the security
// card's password form (collapsed CTA → form → error/success, which stays open
// so the confirmation is read where the change was made); it renders as an
// Account-information row so identity data stays in ONE card, next to its
// sibling ProfileNameEditor. Lives here rather than in its own module because
// it is bound to these rows' markup.
function PhoneRowEditor({
  current,
  locale,
  t,
}: {
  /** Stored E.164 number, or "" when the account has none. */
  current: string;
  locale: string;
  t: (k: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(
    updateOwnPhone,
    null,
  );

  if (!editing) {
    return (
      <div className="prof2-row prof2-row-editable">
        <span className="prof2-row-label">{t("profile.phoneLabel")}</span>
        <span className="prof2-row-value">{current || "—"}</span>
        <button
          type="button"
          className="prof2-btn prof2-btn-ghost prof2-row-edit"
          onClick={() => setEditing(true)}
          aria-expanded={false}
        >
          {current ? t("profile.phoneEdit") : t("profile.addPhone")}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="prof2-name-form">
      {/* The registration field, unchanged: country selector + national part,
          composing the hidden `phone` E.164 value the action reads. The .form
          wrapper is what gives its inputs the shared field styling. */}
      <div className="form">
        <PhoneField
          locale={locale}
          label={t("profile.phoneLabel")}
          countryLabel={t("parent.auth.phoneCountry")}
          searchLabel={t("parent.auth.phoneSearch")}
          placeholder={t("parent.auth.phonePh")}
          invalidMessage={t("parent.err.phone")}
          // EDIT opens on the number the parent already has (the field mounts
          // fresh each time `editing` flips, so seeding state is enough).
          initialE164={current}
        />
      </div>
      <p className="prof2-sec-hint">{t("profile.phoneHint")}</p>
      <div className="prof2-form-actions">
        <button type="submit" className="prof2-btn prof2-btn-primary" disabled={pending}>
          {pending ? t("profile.saving") : t("profile.save")}
        </button>
        <button
          type="button"
          className="prof2-btn prof2-btn-ghost"
          onClick={() => setEditing(false)}
          disabled={pending}
        >
          {t("profile.cancel")}
        </button>
      </div>
      {state?.ok && <p className="prof2-ok">{t("profile.phoneSaved")}</p>}
      {state?.error && <p className="prof2-error">{state.error}</p>}
    </form>
  );
}
