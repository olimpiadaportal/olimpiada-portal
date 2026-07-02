"use client";

// Typed per-setting editor (Settings redesign, Round 6).
//
// One reusable component covering text/email/phone/url/number/textarea/
// select(locale)/checkbox-group(locales)/trilingual. Each field renders:
// label, control, a per-field Save button (disabled while pending, shows a
// saving state) and a helper description line under the control.
//
// There is NO raw-JSON editor anymore: every control serializes its value to
// the exact JSON shape the DB stores and posts it as `value_json`, so the
// existing update-only server action keeps working unchanged. Boolean settings
// are rendered by <SettingToggle /> instead (they save immediately on flip).
import { useActionState, useEffect, useId, useState } from "react";
import { updateSetting, type SettingState } from "@/lib/admin/settings";
import { type SettingEditorKind } from "@/lib/admin/settings-meta";

export type SettingFieldKind = Exclude<SettingEditorKind, "boolean">;

export type SettingEditorStrings = {
  save: string;
  saving: string;
  saved: string;
  invalidJson: string;
  notFound: string;
  missing: string;
  notConfigured: string; // muted hint when the DB row has not been seeded yet
  localesEmpty: string; // client-side "select at least one language"
  langAz: string;
  langEn: string;
  langRu: string;
  label: string; // friendly field label for this setting
  help: string; // helper text under the control
};

type FieldProps = {
  settingKey: string;
  value: unknown; // parsed value_json from the DB row (undefined when missing)
  exists: boolean; // whether the DB row exists yet
  localeOptions: readonly string[];
  placeholder?: string;
  strings: SettingEditorStrings;
};

export function SettingEditor(props: FieldProps & { kind: SettingFieldKind }) {
  switch (props.kind) {
    case "trilingual":
      return <TrilingualField {...props} />;
    case "locale":
      return <LocaleField {...props} />;
    case "locales":
      return <LocalesField {...props} />;
    case "textarea":
      return <TextareaField {...props} />;
    default:
      // text | email | phone | url | number
      return <TextField {...props} kind={props.kind} />;
  }
}

// --- Shared form plumbing -----------------------------------------------------

function useSettingForm(settingKey: string, strings: SettingEditorStrings) {
  const [state, action, pending] = useActionState<SettingState, FormData>(
    updateSetting,
    null,
  );

  // Success feedback auto-clears after a moment; errors stay until retried.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (state?.ok && state.key === settingKey) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [state, settingKey]);

  const error = (() => {
    if (!state?.error || state.key !== settingKey) return null;
    if (state.error === "settings.err.invalidJson") return strings.invalidJson;
    if (state.error === "settings.err.notFound") return strings.notFound;
    if (state.error === "settings.err.missing") return strings.missing;
    return state.error;
  })();

  return { action, pending, showSaved, error };
}

// Field chrome: label row (label left, feedback + Save right), the control,
// then the helper line. Each field is its own <form> so saves are per-field.
function FieldShell({
  settingKey,
  action,
  pending,
  showSaved,
  error,
  inlineError,
  strings,
  exists,
  labelFor,
  saveDisabled,
  children,
}: {
  settingKey: string;
  action: (formData: FormData) => void;
  pending: boolean;
  showSaved: boolean;
  error: string | null;
  inlineError?: string | null;
  strings: SettingEditorStrings;
  exists: boolean;
  labelFor?: string; // id of the single control; omitted for grouped controls
  saveDisabled?: boolean;
  children: React.ReactNode;
}) {
  const shownError = error ?? inlineError ?? null;
  return (
    <form action={action} className="sfield">
      <input type="hidden" name="__key" value={settingKey} />
      <div className="sfield-head">
        {labelFor ? (
          <label className="sfield-label" htmlFor={labelFor}>
            {strings.label}
          </label>
        ) : (
          <span className="sfield-label">{strings.label}</span>
        )}
        <div className="sfield-status">
          {shownError && (
            <span className="inline-status err" role="alert">
              {shownError}
            </span>
          )}
          {showSaved && !shownError && (
            <span className="inline-status ok" role="status">
              {strings.saved}
            </span>
          )}
          <button
            className="btn btn-sm"
            type="submit"
            disabled={pending || saveDisabled}
          >
            {pending ? strings.saving : strings.save}
          </button>
        </div>
      </div>
      {children}
      <p className="sfield-help">{strings.help}</p>
      {!exists && (
        <p className="sfield-help sfield-missing">{strings.notConfigured}</p>
      )}
    </form>
  );
}

// --- Single-line inputs (text/email/phone/url/number) -------------------------

function TextField({
  settingKey,
  value,
  exists,
  placeholder,
  strings,
  kind,
}: FieldProps & { kind: "text" | "email" | "phone" | "url" | "number" }) {
  const form = useSettingForm(settingKey, strings);
  const inputId = useId();
  const [v, setV] = useState(
    kind === "number"
      ? typeof value === "number"
        ? String(value)
        : ""
      : typeof value === "string"
        ? value
        : "",
  );

  const trimmed = v.trim();
  const numeric = Number(trimmed);
  const numberValid = trimmed !== "" && Number.isFinite(numeric);
  // Strings may be saved empty (= unset); numbers require a valid value.
  const serialized =
    kind === "number"
      ? numberValid
        ? JSON.stringify(numeric)
        : ""
      : JSON.stringify(trimmed);
  const inputType =
    kind === "phone" ? "tel" : kind === "number" ? "number" : kind;

  return (
    <FieldShell
      settingKey={settingKey}
      action={form.action}
      pending={form.pending}
      showSaved={form.showSaved}
      error={form.error}
      strings={strings}
      exists={exists}
      labelFor={inputId}
      saveDisabled={kind === "number" && !numberValid}
    >
      <input
        id={inputId}
        className="sfield-control"
        type={inputType}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
      />
      <input type="hidden" name="value_json" value={serialized} />
    </FieldShell>
  );
}

// --- Multi-line text -----------------------------------------------------------

function TextareaField({
  settingKey,
  value,
  exists,
  placeholder,
  strings,
}: FieldProps) {
  const form = useSettingForm(settingKey, strings);
  const inputId = useId();
  const [v, setV] = useState(typeof value === "string" ? value : "");

  return (
    <FieldShell
      settingKey={settingKey}
      action={form.action}
      pending={form.pending}
      showSaved={form.showSaved}
      error={form.error}
      strings={strings}
      exists={exists}
      labelFor={inputId}
    >
      <textarea
        id={inputId}
        className="sfield-control"
        rows={3}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
      />
      <input type="hidden" name="value_json" value={JSON.stringify(v.trim())} />
    </FieldShell>
  );
}

// --- Trilingual text (az/en/ru saved together as one JSON object) --------------

function TrilingualField({ settingKey, value, exists, strings }: FieldProps) {
  const form = useSettingForm(settingKey, strings);
  const stored =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const initial = (locale: string) =>
    typeof stored[locale] === "string" ? (stored[locale] as string) : "";
  const [az, setAz] = useState(initial("az"));
  const [en, setEn] = useState(initial("en"));
  const [ru, setRu] = useState(initial("ru"));

  // The {az,en,ru} object is assembled here — the admin never sees raw JSON.
  const serialized = JSON.stringify({
    az: az.trim(),
    en: en.trim(),
    ru: ru.trim(),
  });

  const langs: { code: string; label: string; v: string; set: (s: string) => void }[] =
    [
      { code: "az", label: strings.langAz, v: az, set: setAz },
      { code: "en", label: strings.langEn, v: en, set: setEn },
      { code: "ru", label: strings.langRu, v: ru, set: setRu },
    ];

  return (
    <FieldShell
      settingKey={settingKey}
      action={form.action}
      pending={form.pending}
      showSaved={form.showSaved}
      error={form.error}
      strings={strings}
      exists={exists}
    >
      <div className="tri-grid" role="group" aria-label={strings.label}>
        {langs.map((l) => (
          <label className="tri-item" key={l.code}>
            <span className="tri-lang">{l.label}</span>
            <textarea
              className="sfield-control"
              rows={3}
              value={l.v}
              onChange={(e) => l.set(e.target.value)}
            />
          </label>
        ))}
      </div>
      <input type="hidden" name="value_json" value={serialized} />
    </FieldShell>
  );
}

// --- Locale select (single choice) ----------------------------------------------

function LocaleField({
  settingKey,
  value,
  exists,
  localeOptions,
  strings,
}: FieldProps) {
  const form = useSettingForm(settingKey, strings);
  const inputId = useId();
  const [v, setV] = useState(
    typeof value === "string" && localeOptions.includes(value)
      ? value
      : localeOptions[0],
  );

  return (
    <FieldShell
      settingKey={settingKey}
      action={form.action}
      pending={form.pending}
      showSaved={form.showSaved}
      error={form.error}
      strings={strings}
      exists={exists}
      labelFor={inputId}
    >
      <select
        id={inputId}
        className="sfield-control sfield-select"
        value={v}
        onChange={(e) => setV(e.target.value)}
      >
        {localeOptions.map((o) => (
          <option key={o} value={o}>
            {o.toUpperCase()}
          </option>
        ))}
      </select>
      <input type="hidden" name="value_json" value={JSON.stringify(v)} />
    </FieldShell>
  );
}

// --- Locales checkbox group (requires at least one checked) ---------------------

function LocalesField({
  settingKey,
  value,
  exists,
  localeOptions,
  strings,
}: FieldProps) {
  const form = useSettingForm(settingKey, strings);
  const initial = Array.isArray(value)
    ? (value as unknown[]).filter(
        (x): x is string => typeof x === "string" && localeOptions.includes(x),
      )
    : [];
  const [sel, setSel] = useState<string[]>(initial);
  const toggle = (o: string) =>
    setSel((cur) =>
      cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o],
    );
  // Preserve option order (not click order) for a stable stored array.
  const ordered = localeOptions.filter((o) => sel.includes(o));
  const empty = ordered.length === 0;

  return (
    <FieldShell
      settingKey={settingKey}
      action={form.action}
      pending={form.pending}
      showSaved={form.showSaved}
      error={form.error}
      inlineError={empty ? strings.localesEmpty : null}
      strings={strings}
      exists={exists}
      saveDisabled={empty}
    >
      <div className="checkbox-row" role="group" aria-label={strings.label}>
        {localeOptions.map((o) => (
          <label className="checkbox-chip" key={o}>
            <input
              type="checkbox"
              checked={sel.includes(o)}
              onChange={() => toggle(o)}
            />
            <span>{o.toUpperCase()}</span>
          </label>
        ))}
      </div>
      <input type="hidden" name="value_json" value={JSON.stringify(ordered)} />
    </FieldShell>
  );
}
