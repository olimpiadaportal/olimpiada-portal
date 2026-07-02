"use client";

// Boolean system-setting toggle (Settings redesign, Round 6).
//
// Saves immediately on flip via the existing update-only server action
// (updateSetting), keeping the __key/value_json contract. When `confirmText`
// is provided (dangerous toggles like maintenance mode), ENABLING first shows
// an inline confirmation row with Confirm/Cancel; disabling applies at once.
import { useEffect, useState, useTransition } from "react";
import { updateSetting } from "@/lib/admin/settings";

export type SettingToggleStrings = {
  label: string;
  help: string;
  on: string;
  off: string;
  enable: string;
  disable: string;
  saved: string;
  notFound: string;
  notConfigured: string;
  // Present only for dangerous toggles that need confirmation before enabling.
  confirmText?: string;
  confirmYes?: string;
  cancel?: string;
};

export function SettingToggle({
  settingKey,
  initial,
  exists,
  strings,
}: {
  settingKey: string;
  initial: boolean;
  exists: boolean;
  strings: SettingToggleStrings;
}) {
  const [on, setOn] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  // Success feedback auto-clears; errors stay until the next attempt.
  useEffect(() => {
    if (!feedback?.ok) return;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);

  function persist(next: boolean) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("__key", settingKey);
      fd.set("value_json", next ? "true" : "false");
      const res = await updateSetting(null, fd);
      if (res?.ok) {
        setOn(next);
        setFeedback({ ok: true, text: strings.saved });
      } else {
        setFeedback({
          ok: false,
          text:
            res?.error === "settings.err.notFound"
              ? strings.notFound
              : (res?.error ?? strings.notFound),
        });
      }
    });
  }

  function onToggleClick() {
    setFeedback(null);
    if (!on && strings.confirmText) {
      setConfirming(true);
      return;
    }
    persist(!on);
  }

  return (
    <div className="toggle-block">
      <div className="toggle-row">
        <div className="toggle-info">
          <span className="flag-title">{strings.label}</span>
          <span className="flag-desc">{strings.help}</span>
          {!exists && (
            <span className="sfield-missing">{strings.notConfigured}</span>
          )}
        </div>
        <div className="toggle-controls">
          {feedback && (
            <span
              className={`inline-status ${feedback.ok ? "ok" : "err"}`}
              role={feedback.ok ? "status" : "alert"}
            >
              {feedback.text}
            </span>
          )}
          <span className={`pill pill-inline ${on ? "pill-ok" : "pill-muted"}`}>
            {on ? strings.on : strings.off}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={on ? strings.disable : strings.enable}
            title={on ? strings.disable : strings.enable}
            disabled={isPending || confirming}
            onClick={onToggleClick}
            className={`switch switch-sm ${on ? "switch-on" : "switch-off"}`}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      {confirming && (
        <div className="confirm-row" role="group" aria-label={strings.label}>
          <p className="confirm-text">{strings.confirmText}</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn btn-sm btn-warn"
              disabled={isPending}
              onClick={() => {
                setConfirming(false);
                persist(true);
              }}
            >
              {strings.confirmYes}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={isPending}
              onClick={() => setConfirming(false)}
            >
              {strings.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
