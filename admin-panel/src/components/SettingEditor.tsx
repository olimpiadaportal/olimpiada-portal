"use client";

import { useActionState } from "react";
import { updateSetting, type SettingState } from "@/lib/admin/settings";

type Strings = {
  save: string;
  saving: string;
  saved: string;
  invalidJson: string;
  notFound: string;
  missing: string;
};

export function SettingEditor({
  settingKey,
  value,
  strings,
}: {
  settingKey: string;
  value: string;
  strings: Strings;
}) {
  const [state, action, pending] = useActionState<SettingState, FormData>(
    updateSetting,
    null,
  );

  // Map the action's error key back to a localized string where applicable.
  const errorText = (() => {
    if (!state?.error || state.key !== settingKey) return null;
    if (state.error === "settings.err.invalidJson") return strings.invalidJson;
    if (state.error === "settings.err.notFound") return strings.notFound;
    if (state.error === "settings.err.missing") return strings.missing;
    return state.error;
  })();

  return (
    <form action={action} className="setting-editor">
      <input type="hidden" name="__key" value={settingKey} />
      <textarea
        name="value_json"
        defaultValue={value}
        rows={4}
        spellCheck={false}
        aria-label={settingKey}
      />
      <div className="setting-editor-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? strings.saving : strings.save}
        </button>
        {errorText && <span className="inline-status err">{errorText}</span>}
        {state?.ok && state.key === settingKey && (
          <span className="inline-status ok">{strings.saved}</span>
        )}
      </div>
    </form>
  );
}
