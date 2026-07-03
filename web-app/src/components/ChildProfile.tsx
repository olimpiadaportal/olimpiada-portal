"use client";

import { useActionState, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { ChildAvatarUploader } from "@/components/ChildAvatarUploader";
import {
  childChangeOwnPassword,
  type ChildProfileState,
} from "@/lib/auth/childProfileActions";

// Child self-service profile — Round 8 redesign, same design language as the
// parent account-settings page but student-only features: identity header
// (avatar + name + 8-digit ID in mono + grouped photo actions) and a Security
// section (childChangeOwnPassword). NO delete-account and NO email here — a
// child never gets those. Renders a fragment of prof2 cards; the page owns
// the surrounding .prof2-stack. Styled by prof2-* classes with .arena-scoped
// overrides so it reads well inside the dark student shell.
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
    <>
      {/* Identity header: avatar, name, 8-digit ID (mono), photo actions. */}
      <section className="prof2-card prof2-identity" aria-label={tt("profile.avatar")}>
        <span className="prof2-avatar">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="prof2-avatar-img" />
          ) : (
            <span className="prof2-avatar-fallback" aria-hidden="true">
              {initial}
            </span>
          )}
        </span>
        <div className="prof2-id-meta">
          <strong className="prof2-id-name">{name || "—"}</strong>
          <span className="prof2-id-email">
            {tt("child.id")}:{" "}
            <span className="prof2-mono">{uniqueId || "—"}</span>
          </span>
          <span className="prof2-hint">{tt("prof2.idHint")}</span>
        </div>
        <ChildAvatarUploader hasAvatar={avatarUrl !== null} dict={dict} />
      </section>

      {/* Security: change password (same childChangeOwnPassword action). */}
      <section className="prof2-card" aria-label={tt("prof2.security")}>
        <h2 className="prof2-sec-title">{tt("prof2.security")}</h2>
        <p className="prof2-sec-hint">{tt("prof2.securityHint")}</p>
        {!open ? (
          <button
            type="button"
            className="prof2-btn prof2-btn-outline"
            onClick={() => setOpen(true)}
            aria-expanded={false}
          >
            {tt("profile.changePassword")}
          </button>
        ) : (
          <form action={action} className="prof2-pwform">
            <label className="prof2-label" htmlFor="prof2-child-newpw">
              {tt("profile.newPassword")}
            </label>
            <PasswordInput
              id="prof2-child-newpw"
              name="new_password"
              required
              minLength={8}
              autoComplete="new-password"
              className="prof2-input"
              showLabel={tt("auth.showPassword")}
              hideLabel={tt("auth.hidePassword")}
            />
            <div className="prof2-form-actions">
              <button
                type="submit"
                className="prof2-btn prof2-btn-primary"
                disabled={pending}
              >
                {tt("profile.save")}
              </button>
              <button
                type="button"
                className="prof2-btn prof2-btn-ghost"
                onClick={() => setOpen(false)}
              >
                {tt("profile.cancel")}
              </button>
            </div>
            {state?.ok && (
              <p className="prof2-ok">{tt("profile.passwordChanged")}</p>
            )}
            {state?.error && <p className="prof2-error">{state.error}</p>}
          </form>
        )}
      </section>
    </>
  );
}
