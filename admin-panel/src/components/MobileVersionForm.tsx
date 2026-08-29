"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateMobileVersion,
  type MobileVersionState,
} from "@/lib/admin/mobileApp";
import { versionGateProblem } from "@/lib/admin/mobile-version";
import { ActionButton } from "@/components/ActionButton";

// Error codes returned by updateMobileVersion mapped to localized strings
// passed from the server page (this client component holds no i18n dictionary).
export type MobileVersionLabels = {
  min: string;
  minHelp: string;
  minGuidance: string;
  latest: string;
  latestHelp: string;
  force: string;
  forceHelp: string;
  forceWarn: string;
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
  errForceNoUrl: string;
  errMinAboveLatest: string;
  errGeneric: string;
};

function mapError(
  code: string | undefined | null,
  l: MobileVersionLabels,
): string | null {
  if (!code) return null;
  if (code === "mobileapp.err.semver") return l.errSemver;
  if (code === "mobileapp.err.url") return l.errUrl;
  if (code === "mobileapp.err.length") return l.errLength;
  if (code === "mobileapp.err.forceNoUrl") return l.errForceNoUrl;
  if (code === "mobileapp.err.minAboveLatest") return l.errMinAboveLatest;
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

  // The three fields the safety rails read are tracked so the admin sees the
  // refusal WHILE editing instead of after a round-trip. The server re-runs the
  // same versionGateProblem() and stays the authority — this is feedback, not
  // enforcement, and disabling the button must never be mistaken for the guard.
  const [minVersion, setMinVersion] = useState(initial.min_version);
  const [latestVersion, setLatestVersion] = useState(initial.latest_version);
  const [storeUrl, setStoreUrl] = useState(initial.store_url);
  const [forceUpdate, setForceUpdate] = useState(initial.force_update);

  const problem = versionGateProblem({
    minVersion,
    latestVersion,
    forceUpdate,
    storeUrl,
  });

  // A live rule violation outranks a stale server error from the last attempt.
  const error = mapError(problem ?? state?.error, labels);

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
            value={minVersion}
            onChange={(e) => setMinVersion(e.target.value)}
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
            value={latestVersion}
            onChange={(e) => setLatestVersion(e.target.value)}
            required
            maxLength={20}
            pattern="\d+\.\d+\.\d+"
            placeholder="1.0.0"
          />
          <span className="sfield-help">{labels.latestHelp}</span>
        </label>
      </div>

      {/* The panel CANNOT see what is published in the store, so this is
          guidance and not a check — inventing one would only teach the admin to
          trust a number nobody verified. It sits under the version fields
          because that is where the decision is made. */}
      <div className="confirm-row" role="note">
        <p className="confirm-text">{labels.minGuidance}</p>
      </div>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">{labels.storeUrl}</span>
          <input
            type="text"
            name="store_url"
            value={storeUrl}
            onChange={(e) => setStoreUrl(e.target.value)}
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
            checked={forceUpdate}
            onChange={(e) => setForceUpdate(e.target.checked)}
          />
          <span className="sfield-help">{labels.forceHelp}</span>
        </label>
      </div>

      {/* Blast radius, shown the moment the box is ticked — same amber notice
          the maintenance-mode toggle uses before it locks the platform. */}
      {forceUpdate && (
        <div className="confirm-row" role="note">
          <p className="confirm-text">{labels.forceWarn}</p>
        </div>
      )}

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

      <ActionButton
        className="btn"
        pending={pending}
        pendingLabel={labels.saving}
        disabled={problem !== null}
      >
        {labels.save}
      </ActionButton>
    </form>
  );
}
