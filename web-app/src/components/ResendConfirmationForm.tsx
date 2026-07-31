"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import {
  resendConfirmationEmail,
  type ResendConfirmationState,
} from "@/lib/auth/parentService";

// GoTrue enforces its OWN per-address resend interval (60s by default) and the
// action deliberately swallows that rejection (reporting it would leak whether
// the address exists), so a second request inside the window returns a
// truthful-looking success that sent nothing. Hold the button for the same
// window so the UI never promises a mail that was not sent.
const COOLDOWN_SECONDS = 60;

export function ResendConfirmationForm({
  dict,
  // True when the user arrived straight from registration, which JUST triggered
  // a confirmation mail — the GoTrue window is already running server-side, so
  // the button must arrive already counting down instead of offering a first
  // tap that would silently do nothing. Cold arrivals (bookmark, second device,
  // the login screen's "confirm your email" error) get 0 and stay usable.
  justSent = false,
}: {
  dict: Record<string, string>;
  justSent?: boolean;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<ResendConfirmationState, FormData>(
    resendConfirmationEmail,
    null,
  );
  // Controlled on purpose: React resets an UNCONTROLLED form once its action
  // resolves, and this form (unlike /forgot-password) stays on the page — a
  // cleared address after every attempt would make the retry the feature exists
  // for require re-typing.
  const [email, setEmail] = useState("");
  // A DEADLINE, not a decrementing counter. This screen's entire job is to send
  // the user to another tab to read their mail, and browsers clamp background
  // timers hard (Chrome drops a hidden tab to roughly one wake per minute after
  // ~5 minutes). A chained countdown would come back stale and leave the button
  // dead for up to an hour; recomputing from the wall clock self-corrects on
  // the first wake, and visibilitychange makes that instant on return.
  const [cooldownEndsAt, setCooldownEndsAt] = useState(() =>
    justSent ? Date.now() + COOLDOWN_SECONDS * 1000 : 0,
  );
  const [cooldown, setCooldown] = useState(justSent ? COOLDOWN_SECONDS : 0);
  // Which address the running cooldown belongs to. A DIFFERENT inbox is a
  // different GoTrue interval and must be instantly usable, but re-typing (or
  // fidgeting with) the SAME address must not unlock a resend that would be
  // dropped server-side and still render as success.
  //   null = the hold is not tied to any address — the `justSent` case, where
  //          registration sent the mail and this page never learns to whom.
  const [sentTo, setSentTo] = useState<string | null>(justSent ? null : "");
  const [editedSinceSend, setEditedSinceSend] = useState(false);
  const sent = state?.ok === true;

  // `state` is a fresh object per submission, so this re-arms on every result
  // that should hold the button: a success, and a throttle (the request landed
  // and is being refused — hammering it only produces more red text). A
  // validation error does NOT hold: the user has a typo to fix right now.
  useEffect(() => {
    if (state?.ok === true || state?.throttled === true) {
      setCooldownEndsAt(Date.now() + COOLDOWN_SECONDS * 1000);
    }
  }, [state]);

  useEffect(() => {
    if (cooldownEndsAt <= 0) {
      setCooldown(0);
      return;
    }
    const remaining = () =>
      Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
    setCooldown(remaining());
    const id = setInterval(() => {
      const left = remaining();
      setCooldown(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    const onVisible = () => setCooldown(remaining());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [cooldownEndsAt]);

  return (
    <form
      action={action}
      className="form auth-form"
      onSubmit={() => {
        setSentTo(email.trim().toLowerCase());
        setEditedSinceSend(false);
      }}
    >
      <label className="field">
        <span className="field-label">{tt("parent.auth.email")} *</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={tt("parent.auth.emailPh")}
          value={email}
          onChange={(e) => {
            const next = e.target.value;
            setEmail(next);
            const same = next.trim().toLowerCase() === sentTo;
            setEditedSinceSend(!same);
            if (sentTo !== null && !same) setCooldownEndsAt(0);
          }}
        />
      </label>
      {state?.error && <p className="form-error">{state.error}</p>}
      {/* useActionState keeps the PREVIOUS state while a new submission is in
          flight, so without the !pending guard a stale success sits next to a
          "sending…" button (house pattern — see ChildInfoEditForm). The
          edited guard stops it claiming success for an address that was never
          submitted. */}
      {sent && !pending && !editedSinceSend && (
        <p className="prof2-ok">{tt("verify.resent")}</p>
      )}
      <button className="btn" type="submit" disabled={pending || cooldown > 0}>
        {pending
          ? tt("parent.auth.submitting")
          : cooldown > 0
            ? `${tt("verify.resend")} (${cooldown})`
            : tt("verify.resend")}
      </button>
    </form>
  );
}
