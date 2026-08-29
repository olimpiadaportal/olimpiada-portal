"use client";

// The one form behind both "New subject" and "Edit subject".
//
// THREE PRICE FIELDS, NOT ONE. A subject's price is not a column on the subject
// row: it is `subjects_pricing`, one row per (subject_id, interval), UNIQUE on
// that pair, intervals week | month | year. A single "Price: 10 AZN" field
// could only ever write one of the three and would leave the other two unset —
// which is exactly the state that kept Elm and Fizika off /services, because
// every family-facing surface builds its subject list from PRICED rows.
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
} from "@/app/(protected)/pricing/shared";

export type SubjectFormStrings = {
  name: string;
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
  name: string;
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

  const [name, setName] = useState(defaults.name);
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
    if (!state?.ok) return;
    setShowSaved(true);
    router.refresh();
    const timer = setTimeout(() => setShowSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [state, router]);

  const nameInvalid = name.trim().length === 0 || name.trim().length > 120;
  const priceInvalid = (iv: PriceInterval) =>
    prices[iv].trim() !== "" && parsePriceAmount(prices[iv]) === null;
  const priceMissing = (iv: PriceInterval) => prices[iv].trim() === "";
  const anyPriceUnusable = PRICE_INTERVALS.some(
    (iv) => priceMissing(iv) || priceInvalid(iv),
  );

  return (
    <form action={formAction} className="form">
      {mode === "edit" && id && <input type="hidden" name="__id" value={id} />}

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
              {strings.errName}
            </span>
          ) : null}
        </label>

        <label className="field">
          <span className="field-label">{strings.status}</span>
          <select name="status" defaultValue={defaults.status}>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Grouped as a fieldset so a screen reader announces "Subscription
          prices" once instead of three unrelated numbers. */}
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
                  {strings.errPrice}
                </span>
              ) : null}
            </label>
          ))}
        </div>
      </fieldset>

      {state?.error && (
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
        disabled={nameInvalid || anyPriceUnusable}
      >
        {strings.submit}
      </ActionButton>
    </form>
  );
}
