"use client";

// The one form behind both "Add subject" and "Edit subject".
//
// THE TWO MODES WRITE DIFFERENT THINGS, AND THAT IS THE POINT.
//
//   create — the three names, status AND the three cycle prices, in one
//            submission.
//   edit   — the three names and status ONLY.
//
// THE NAME IS THREE FIELDS (2026-09-10, migration 171). It was one, and
// renaming a subject changed NOTHING a family could see: the apps resolved
// every subject label from their own `subj.<code>` dictionary, which beat the
// single `subjects.name` column, so the save succeeded and the product went on
// printing the old name in all three languages. The names now live one per
// locale in `subject_translations`, which is where the apps read them from, so
// a trilingual product needs a trilingual field — one column could never have
// held Riyaziyyat, Mathematics and Математика at once.
//
// AZ IS REQUIRED, EN AND RU ARE NOT. A blank EN or RU saves the Azerbaijani
// name into that locale, which is exactly what a reader saw before this
// existed — so leaving them empty is a no-op rather than a broken screen.
// Refusing to save without all three would only teach admins to type
// placeholder English.
//
// A subject's price is not a column on the subject row: it is
// `subjects_pricing`, one row per (subject_id, interval), UNIQUE on that pair,
// intervals week | month | year. Creation still asks for all three because a
// subject born unpriced is invisible to every family-facing surface — that is
// what kept Elm and Fizika off /services — and because createSubject writes the
// prices BEFORE applying the requested status, which is what makes
// "published implies sellable" true at birth.
//
// EDITING IS DIFFERENT. When the /pricing screen was folded into Subjects
// (2026-09-10) the prices became inline cells (components/PriceCell), each its
// own form posting one subject id, one interval and one amount to
// saveSubjectPrice. Leaving the three inputs on this form as well would have
// meant TWO write paths onto the same rows, and worse: renaming a subject would
// re-post three amounts read off a page that may be minutes old, silently
// undoing a reprice somebody made in between. Removing them makes
// "editing a subject cannot reset its prices" a property of the form's SHAPE
// rather than of the server being careful.
//
// Client validation here is UX ONLY. parsePriceAmount is the same function the
// server action runs, and admin_upsert_subject_price re-checks the same bounds
// inside the database; nothing on this screen is trusted.
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSubject,
  updateSubject,
  type SubjectSaveState,
} from "@/lib/admin/actions";
import { ActionButton } from "@/components/ActionButton";
import {
  PRICE_INTERVALS,
  parsePriceAmount,
  type PriceInterval,
} from "@/lib/admin/pricing-shared";

export type SubjectFormStrings = {
  /** The az field's label — the required one, and the internal name. */
  name: string;
  nameEn: string;
  nameRu: string;
  /** One line: az is what a blank EN/RU falls back to. */
  nameFallbackHint: string;
  /**
   * One line, EDIT ONLY: renaming does not move the internal name that
   * bulk-import files match on. Rendered with that name printed after it.
   */
  importNameHint: string;
  status: string;
  prices: string;
  pricesHint: string;
  interval: Record<PriceInterval, string>;
  submit: string;
  saving: string;
  saved: string;
  errName: string;
  errPrice: string;
  currency: string;
};

export type SubjectFormDefaults = {
  /** az / en / ru as stored. az is never empty (data.ts backfills it). */
  names: { az: string; en: string; ru: string };
  /**
   * `subjects.name` — the bulk-import key, printed beside the az field on the
   * edit screen. Absent on create, where the az field is what creates it.
   */
  internalName?: string;
  status: string;
  /** Stored amounts as TEXT ("3.00"), never parsed into a float here. */
  prices: Partial<Record<PriceInterval, string>>;
};

export function SubjectForm({
  mode,
  id,
  defaults,
  statusOptions,
  strings,
}: {
  mode: "create" | "edit";
  id?: string;
  defaults: SubjectFormDefaults;
  statusOptions: { value: string; label: string }[];
  strings: SubjectFormStrings;
}) {
  const router = useRouter();
  // The action is fixed for the lifetime of the mount — a create form never
  // becomes an edit form.
  const [state, formAction, pending] = useActionState<SubjectSaveState, FormData>(
    mode === "create" ? createSubject : updateSubject,
    null,
  );

  const withPrices = mode === "create";

  // THE STATUS AND ITS BASELINE COME FROM ONE SOURCE.
  //
  // The select was uncontrolled (`defaultValue`) while the hidden __statusWas
  // field was controlled by the same prop. React applies defaultValue on the
  // FIRST mount only, so after an in-page lifecycle transition — Publish or
  // Archive in the card beside this form, then router.refresh() — the hidden
  // field carried the NEW stored status while the select still showed the old
  // one. The next Save posted a status the admin had never chosen, against a
  // baseline that agreed with the database, so the staleness guard saw no
  // conflict and wrote it: the guard was disarmed by its own form.
  //
  // Both halves now render from `defaults.status`, and when the server value
  // moves the control follows it. Adjusted DURING render rather than in an
  // effect, which is the pattern React documents for this: an effect would let
  // one commit paint the stale value first. An unsaved pick is discarded when
  // that happens, which is the right trade — the value underneath changed
  // because somebody, usually this same admin, just moved the status.
  const [statusWas, setStatusWas] = useState(defaults.status);
  const [status, setStatus] = useState(defaults.status);
  if (statusWas !== defaults.status) {
    setStatusWas(defaults.status);
    setStatus(defaults.status);
  }

  const [name, setName] = useState(defaults.names.az);
  const [nameEn, setNameEn] = useState(defaults.names.en);
  const [nameRu, setNameRu] = useState(defaults.names.ru);
  const [prices, setPrices] = useState<Record<PriceInterval, string>>(() => {
    const seed = {} as Record<PriceInterval, string>;
    for (const iv of PRICE_INTERVALS) seed[iv] = defaults.prices[iv] ?? "";
    return seed;
  });

  // A successful save leaves the admin on the page (the spec asks for success
  // feedback, not a bounce), so the server-rendered defaults underneath have to
  // be re-read or the next render would show the pre-save values.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    // A REFUSED STATUS CHANGE REFRESHES TOO. `stale` means the row moved under
    // this page: the baseline it is holding is provably behind the database, so
    // without a re-read every retry reproduces the identical refusal until the
    // admin reloads by hand — the save is stuck on a page that looks fine.
    if (state?.stale) router.refresh();
    if (!state?.ok) return;
    setShowSaved(true);
    router.refresh();
    const timer = setTimeout(() => setShowSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [state, router]);

  // az must be present; all three must be within the column's cap. The server
  // re-checks both — this only keeps the button honest.
  const nameInvalid = name.trim().length === 0 || name.trim().length > 120;
  const trInvalid = (v: string) => v.trim().length > 120;
  const priceInvalid = (iv: PriceInterval) =>
    prices[iv].trim() !== "" && parsePriceAmount(prices[iv]) === null;
  const priceMissing = (iv: PriceInterval) => prices[iv].trim() === "";
  const anyPriceUnusable =
    withPrices &&
    PRICE_INTERVALS.some((iv) => priceMissing(iv) || priceInvalid(iv));

  return (
    <form action={formAction} className="form">
      {mode === "edit" && id && (
        <>
          <input type="hidden" name="__id" value={id} />
          {/* THE BASELINE, not a second copy of the answer. The select below
              posts what the admin WANTS; this posts what the row said when the
              page was rendered. updateSubject compares it with the stored value
              and refuses the status change if somebody else moved it in the
              meantime — without it, a tab left open on an 'active' subject
              re-publishes it the next time anyone saves a rename.

              Both read `defaults.status`, and the select's state follows it
              whenever the server value moves (see the block above the return).
              That is what keeps the guard armed: a baseline saying one thing
              while the dropdown shows another is exactly the state in which a
              status nobody chose gets written without any conflict to detect. */}
          <input type="hidden" name="__statusWas" value={defaults.status} />
        </>
      )}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">
            {strings.name}
            <span className="req"> *</span>
          </span>
          <input
            type="text"
            name="name"
            value={name}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
          {(nameInvalid && name !== "") || state?.field === "name" ? (
            <span className="cur-field-error" role="alert">
              {state?.field === "name" ? state.error : strings.errName}
            </span>
          ) : null}
          <small className="cur-field-hint">{strings.nameFallbackHint}</small>
          {/* THE IMPORT KEY, on the screen where the rename happens. Editing
              this field no longer writes `subjects.name`, and that column is
              what three bulk-import RPCs resolve a subject by — an admin who
              renames a subject and then sees their import file fail with
              "unknown subject" has no way to connect the two unless it is said
              here. Create has no such line: there the az field IS the key. */}
          {mode === "edit" && defaults.internalName ? (
            <small className="cur-field-hint">
              {strings.importNameHint} <code>{defaults.internalName}</code>
            </small>
          ) : null}
        </label>

        <label className="field">
          <span className="field-label">{strings.nameEn}</span>
          <input
            type="text"
            name="name_en"
            value={nameEn}
            maxLength={120}
            autoComplete="off"
            placeholder={name}
            onChange={(e) => setNameEn(e.target.value)}
          />
          {trInvalid(nameEn) || state?.field === "name_en" ? (
            <span className="cur-field-error" role="alert">
              {state?.field === "name_en" ? state.error : strings.errName}
            </span>
          ) : null}
        </label>

        <label className="field">
          <span className="field-label">{strings.nameRu}</span>
          <input
            type="text"
            name="name_ru"
            value={nameRu}
            maxLength={120}
            autoComplete="off"
            placeholder={name}
            onChange={(e) => setNameRu(e.target.value)}
          />
          {trInvalid(nameRu) || state?.field === "name_ru" ? (
            <span className="cur-field-error" role="alert">
              {state?.field === "name_ru" ? state.error : strings.errName}
            </span>
          ) : null}
        </label>

        <label className="field">
          <span className="field-label">{strings.status}</span>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {state?.field === "status" ? (
            <span className="cur-field-error" role="alert">
              {state.error}
            </span>
          ) : null}
        </label>
      </div>

      {/* Grouped as a fieldset so a screen reader announces "Subscription
          prices" once instead of three unrelated numbers. CREATE ONLY — see the
          header comment: on edit these are inline cells with their own action,
          so this form has no way to write a price at all. */}
      {withPrices && (
        <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <legend className="field-label" style={{ padding: 0 }}>
            {strings.prices}
            <span className="req"> *</span>
          </legend>
          <p className="cur-field-hint" style={{ marginTop: 4, marginBottom: 12 }}>
            {strings.pricesHint}
          </p>
          <div className="form-grid">
            {PRICE_INTERVALS.map((iv) => (
              <label className="field" key={iv}>
                <span className="field-label">{strings.interval[iv]}</span>
                <div className="price-cell-row">
                  <input
                    className="price-input"
                    name={`price_${iv}`}
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    max={10000}
                    step={0.01}
                    value={prices[iv]}
                    onChange={(e) =>
                      setPrices((p) => ({ ...p, [iv]: e.target.value }))
                    }
                    aria-label={`${strings.prices} — ${strings.interval[iv]}`}
                    placeholder="0.00"
                  />
                  <span className="price-currency">{strings.currency}</span>
                </div>
                {priceInvalid(iv) || state?.field === iv ? (
                  <span className="cur-field-error" role="alert">
                    {state?.field === iv ? state.error : strings.errPrice}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* ONLY the errors that belong to no single control (err.server, and
          anything future). A field error is announced beside its field, and
          repeating it here made a screen reader read the publish refusal twice
          — once under the status select, once above the button. */}
      {state?.error && !state.field && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {showSaved && (
        <p className="form-ok" role="status">
          {strings.saved}
        </p>
      )}

      <ActionButton
        className="btn"
        pending={pending}
        pendingLabel={strings.saving}
        disabled={nameInvalid || trInvalid(nameEn) || trInvalid(nameRu) || anyPriceUnusable}
      >
        {strings.submit}
      </ActionButton>
    </form>
  );
}
