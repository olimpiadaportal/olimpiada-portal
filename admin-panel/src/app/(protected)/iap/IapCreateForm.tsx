"use client";

// Add ONE new inactive iOS store product.
//
// WHY THIS EXISTS AT ALL. Migration 164 seeded all 21 subject products but
// deliberately left the olympiad ones out — "their slugs are an owner naming
// decision this file cannot make on their behalf" — and named this screen as
// where they would be entered. Without it, selling an olympiad package on iOS
// needs a database migration.
//
// WHY THERE IS NO PLATFORM FIELD. The Play build is consumption-only by store
// policy: with no android rows in iap_products the purchase endpoint has
// nothing to sell on Android, which makes the silence structural instead of a
// flag somebody can flip. The server action hardcodes `ios`; adding a platform
// control here — even a disabled one, even "for later" — would turn a
// structural guarantee back into a UI convention. See lib/admin/iap.ts.
//
// WHY THE ID IS SHOWN BEFORE IT IS SAVED. App Store Connect never renames a
// product id and never lets the string be reused, so this is the one field on
// the screen whose mistakes cannot be migrated away. The preview is not
// decoration: it is the last moment the string can be read by a human.
import { useActionState, useEffect, useState } from "react";
import { ActionButton } from "@/components/ActionButton";
import {
  createIapProduct,
  type IapActionState,
  type IapScope,
} from "@/lib/admin/iap";

export type IapCreateStrings = {
  heading: string;
  intro: string;
  scope: string;
  scopeSubject: string;
  scopePackage: string;
  target: string;
  targetPlaceholder: string;
  interval: string;
  intervalWeek: string;
  intervalMonth: string;
  intervalYear: string;
  slug: string;
  slugHint: string;
  preview: string;
  platformNote: string;
  inactiveNote: string;
  submit: string;
  working: string;
  saved: string;
  noTargets: string;
  errors: Record<string, string>;
  errFallback: string;
};

export function IapCreateForm({
  subjects,
  packages,
  strings,
}: {
  subjects: { id: string; name: string }[];
  packages: { id: string; title: string }[];
  strings: IapCreateStrings;
}) {
  const [state, formAction, pending] = useActionState<IapActionState, FormData>(
    createIapProduct,
    null,
  );
  const [scope, setScope] = useState<IapScope>("olympiad_package");
  const [slug, setSlug] = useState("");
  // Named `period`, not `interval`: `setInterval` in a browser file is the
  // window timer, and a reader skimming this would have to stop and check.
  const [period, setPeriod] = useState("month");
  const [target, setTarget] = useState("");

  // Clear the target when the scope changes: a subject id left selected while
  // the scope says "package" would be silently refused by the server, and the
  // admin would not see why.
  useEffect(() => {
    setTarget("");
  }, [scope]);

  // Normalized to ONE shape before rendering: mapping over a union of two
  // array types is a TypeScript dead end, and the select does not care which
  // catalogue the row came from.
  const targets: { id: string; label: string }[] =
    scope === "subject"
      ? subjects.map((s) => ({ id: s.id, label: s.name }))
      : packages.map((p) => ({ id: p.id, label: p.title }));
  // Mirrors SLUG_SHAPE in lib/admin/iap.ts. Client-side only for the preview
  // and the disabled state — the server re-validates, and the database's
  // ck_iap_product_id_shape is the final word.
  const slugOk = /^[a-z0-9]{2,40}$/.test(slug);
  const previewId = slugOk
    ? scope === "subject"
      ? `ai.olympiq.app.sub.${slug}.${period}`
      : `ai.olympiq.app.oly.${slug}`
    : "—";

  const errorText = state?.error
    ? (strings.errors[state.error] ?? strings.errFallback)
    : null;

  return (
    <details className="card">
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
        {strings.heading}
      </summary>

      <p className="muted" style={{ marginTop: 10 }}>
        {strings.intro}
      </p>

      <form action={formAction} className="form">
        <label className="field">
          <span className="field-label">{strings.scope}</span>
          <select
            name="__scope"
            value={scope}
            disabled={pending}
            onChange={(e) => setScope(e.target.value as IapScope)}
          >
            <option value="olympiad_package">{strings.scopePackage}</option>
            <option value="subject">{strings.scopeSubject}</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">{strings.target}</span>
          <select
            name="__target"
            value={target}
            disabled={pending || targets.length === 0}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">{strings.targetPlaceholder}</option>
            {targets.map((tgt) => (
              <option key={tgt.id} value={tgt.id}>
                {tgt.label}
              </option>
            ))}
          </select>
          {targets.length === 0 && (
            <small className="muted">{strings.noTargets}</small>
          )}
        </label>

        {scope === "subject" && (
          <label className="field">
            <span className="field-label">{strings.interval}</span>
            <select
              name="__interval"
              value={period}
              disabled={pending}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="week">{strings.intervalWeek}</option>
              <option value="month">{strings.intervalMonth}</option>
              <option value="year">{strings.intervalYear}</option>
            </select>
          </label>
        )}

        <label className="field">
          <span className="field-label">{strings.slug}</span>
          <input
            type="text"
            name="__slug"
            value={slug}
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            disabled={pending}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
          />
          <small className="muted">{strings.slugHint}</small>
        </label>

        <p className="muted">
          {strings.preview} <code>{previewId}</code>
        </p>
        <p className="muted">{strings.platformNote}</p>
        <p className="muted">{strings.inactiveNote}</p>

        <div className="row-actions" style={{ justifyContent: "flex-start" }}>
          <ActionButton
            className="btn"
            pending={pending}
            pendingLabel={strings.working}
            disabled={!slugOk || target === ""}
          >
            {strings.submit}
          </ActionButton>
        </div>

        {errorText && (
          <span className="form-error" role="alert">
            {errorText}
          </span>
        )}
        {state?.ok && (
          <span className="form-ok" role="status">
            {strings.saved}
          </span>
        )}
      </form>
    </details>
  );
}
