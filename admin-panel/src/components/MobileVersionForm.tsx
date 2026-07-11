"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateMobileVersion,
  type MobileVersionState,
} from "@/lib/admin/mobileApp";

// Error codes returned by updateMobileVersion mapped to localized strings
// passed from the server page (this client component holds no i18n dictionary).
export type MobileVersionLabels = {
  min: string;
  minHelp: string;
  latest: string;
  latestHelp: string;
  force: string;
  forceHelp: string;
  storeUrl: string;
  storeUrlHelp: string;
  message: string;
  messageHelp: string;
  langAz: string;
  langEn: string;
  langRu: string;
  updatedAt: string;
  save: string;
  saving: string;
  saved: string;
  errSemver: string;
  errUrl: string;
  errLength: string;
  errGeneric: string;
};

function mapError(
  code: string | undefined,
  l: MobileVersionLabels,
): string | null {
  if (!code) return null;
  if (code === "mobileapp.err.semver") return l.errSemver;
  if (code === "mobileapp.err.url") return l.errUrl;
  if (code === "mobileapp.err.length") return l.errLength;
  return l.errGeneric;
}

export function MobileVersionForm({
  platform,
  initial,
  updatedAt,
  labels,
}: {
  platform: "ios" | "android";
  initial: {
    min_version: string;
    latest_version: string;
    force_update: boolean;
    store_url: string;
    message_az: string;
    message_en: string;
    message_ru: string;
  };
  updatedAt: string;
  labels: MobileVersionLabels;
}) {
  const [state, formAction, pending] = useActionState<
    MobileVersionState,
    FormData
  >(updateMobileVersion, null);

  // Success feedback auto-clears after a moment; errors stay until retried.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (state?.ok) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const error = mapError(state?.error, labels);

  const messageLangs = [
    { name: "message_az", label: labels.langAz, value: initial.message_az },
    { name: "message_en", label: labels.langEn, value: initial.message_en },
    { name: "message_ru", label: labels.langRu, value: initial.message_ru },
  ];

  return (
    <form action={formAction} className="form">
      <input type="hidden" name="platform" value={platform} />

      <div className="form-grid">
        <label className="field">
          <span className="field-label">{labels.min}</span>
          <input
            type="text"
            name="min_version"
            defaultValue={initial.min_version}
            required
            maxLength={20}
            pattern="\d+\.\d+\.\d+"
            placeholder="1.0.0"
          />
          <span className="sfield-help">{labels.minHelp}</span>
        </label>

        <label className="field">
          <span className="field-label">{labels.latest}</span>
          <input
            type="text"
            name="latest_version"
            defaultValue={initial.latest_version}
            required
            maxLength={20}
            pattern="\d+\.\d+\.\d+"
            placeholder="1.0.0"
          />
          <span className="sfield-help">{labels.latestHelp}</span>
        </label>
      </div>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">{labels.storeUrl}</span>
          <input
            type="text"
            name="store_url"
            defaultValue={initial.store_url}
            maxLength={300}
            inputMode="url"
            placeholder="https://…"
          />
          <span className="sfield-help">{labels.storeUrlHelp}</span>
        </label>

        <label className="field">
          <span className="field-label">{labels.force}</span>
          <input
            type="checkbox"
            name="force_update"
            defaultChecked={initial.force_update}
          />
          <span className="sfield-help">{labels.forceHelp}</span>
        </label>
      </div>

      <div className="field">
        <span className="field-label">{labels.message}</span>
        <div className="tri-grid" role="group" aria-label={labels.message}>
          {messageLangs.map((l) => (
            <label className="tri-item" key={l.name}>
              <span className="tri-lang">{l.label}</span>
              <textarea
                className="sfield-control"
                name={l.name}
                rows={3}
                defaultValue={l.value}
                maxLength={500}
              />
            </label>
          ))}
        </div>
        <span className="sfield-help">{labels.messageHelp}</span>
      </div>

      <p className="sfield-help">
        {labels.updatedAt} {updatedAt}
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {showSaved && !error && (
        <p className="inline-status ok" role="status">
          {labels.saved}
        </p>
      )}

      <button className="btn" type="submit" disabled={pending}>
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}
