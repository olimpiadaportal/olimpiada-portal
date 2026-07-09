"use client";

// Parent-managed notification preferences (on the parent profile/settings page).
// Per-channel toggles (in-app / email / push) for the PARENT, plus one row of
// toggles per child (parents manage their children's prefs). Each row saves on
// toggle via setNotificationPreferencesAction (owner-checked server-side). Email
// and push are architected but flag-gated, so their toggles carry a small
// "delivered when enabled" note. Copy arrives pre-translated via `strings`.
import { useState, useTransition } from "react";
import {
  setNotificationPreferencesAction,
  type NotificationChannels,
} from "@/lib/notifications/prefsActions";

type Channel = "in_app" | "email" | "push";

function PrefRow({
  target,
  label,
  initial,
  strings,
}: {
  target: string; // "self" or a child's profile id
  label: string;
  initial: NotificationChannels;
  strings: Record<string, string>;
}) {
  const s = (k: string) => strings[k] ?? k;
  const [inApp, setInApp] = useState(initial.in_app_enabled);
  const [email, setEmail] = useState(initial.email_enabled);
  const [push, setPush] = useState(initial.push_enabled);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();

  const save = (next: { in_app: boolean; email: boolean; push: boolean }) => {
    const fd = new FormData();
    fd.set("target", target);
    if (next.in_app) fd.set("in_app", "true");
    if (next.email) fd.set("email", "true");
    if (next.push) fd.set("push", "true");
    setStatus("saving");
    startTransition(async () => {
      const res = await setNotificationPreferencesAction(null, fd);
      setStatus(res && res.ok ? "saved" : "error");
    });
  };

  const toggle = (ch: Channel) => {
    const next = { in_app: inApp, email, push };
    if (ch === "in_app") next.in_app = !inApp;
    if (ch === "email") next.email = !email;
    if (ch === "push") next.push = !push;
    setInApp(next.in_app);
    setEmail(next.email);
    setPush(next.push);
    save(next);
  };

  const channels: { key: Channel; on: boolean; label: string; note?: boolean }[] = [
    { key: "in_app", on: inApp, label: s("notif.prefs.inApp") },
    { key: "email", on: email, label: s("notif.prefs.email"), note: true },
    { key: "push", on: push, label: s("notif.prefs.push"), note: true },
  ];

  return (
    <div className="ntf-prefrow">
      <div className="ntf-prefrow-head">
        <span className="ntf-prefrow-name">{label}</span>
        <span className="ntf-prefrow-status" aria-live="polite">
          {status === "saving" && s("notif.prefs.saving")}
          {status === "saved" && s("notif.prefs.saved")}
          {status === "error" && s("notif.prefs.error")}
        </span>
      </div>
      <div className="ntf-toggles">
        {channels.map((c) => (
          <label key={c.key} className="ntf-toggle">
            <input
              type="checkbox"
              checked={c.on}
              onChange={() => toggle(c.key)}
            />
            <span className="ntf-switch" aria-hidden="true" />
            <span className="ntf-toggle-label">
              {c.label}
              {c.note && (
                <span className="ntf-toggle-note">{s("notif.prefs.channelNote")}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function NotificationPreferences({
  self,
  selfLabel,
  kids,
  strings,
}: {
  self: NotificationChannels;
  selfLabel: string;
  kids: { profileId: string; name: string; prefs: NotificationChannels }[];
  strings: Record<string, string>;
}) {
  const s = (k: string) => strings[k] ?? k;
  return (
    <section className="ntf ntf-prefs">
      <h2 className="ntf-prefs-title">{s("notif.prefs.title")}</h2>
      <p className="ntf-prefs-desc">{s("notif.prefs.desc")}</p>

      <div className="ntf-prefs-group">
        <span className="ntf-prefs-group-label">{s("notif.prefs.yourChannels")}</span>
        <PrefRow target="self" label={selfLabel} initial={self} strings={strings} />
      </div>

      <div className="ntf-prefs-group">
        <span className="ntf-prefs-group-label">{s("notif.prefs.children")}</span>
        {kids.length === 0 ? (
          <p className="ntf-prefs-empty">{s("notif.prefs.noChildren")}</p>
        ) : (
          kids.map((c) => (
            <PrefRow
              key={c.profileId}
              target={c.profileId}
              label={c.name}
              initial={c.prefs}
              strings={strings}
            />
          ))
        )}
      </div>
    </section>
  );
}
