"use client";

// One subject × interval price cell: numeric input + AZN suffix + per-cell
// Save. Mirrors the SettingEditor form pattern (useActionState + inline
// ok/err status that auto-clears on success). Client validation is UX only —
// the server action re-validates and the RPC enforces the same bounds.
import { useActionState, useEffect, useId, useState } from "react";
import {
  saveSubjectPrice,
  type PriceSaveState,
} from "@/lib/admin/pricing";
import { parsePriceAmount, type PriceInterval } from "./shared";

export type PriceCellStrings = {
  save: string;
  saving: string;
  saved: string;
  invalidAmount: string;
  notSet: string;
  // Accessible label, e.g. "Riyaziyyat — Aylıq".
  ariaLabel: string;
};

export function PriceCell({
  subjectId,
  interval,
  initialAmount,
  currency,
  strings,
}: {
  subjectId: string;
  interval: PriceInterval;
  initialAmount: number | null;
  currency: string;
  strings: PriceCellStrings;
}) {
  const [state, action, pending] = useActionState<PriceSaveState, FormData>(
    saveSubjectPrice,
    null,
  );
  const inputId = useId();
  const [v, setV] = useState(
    initialAmount === null ? "" : String(initialAmount),
  );

  // Success feedback auto-clears after a moment; errors stay until retried.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (state?.ok) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const trimmed = v.trim();
  const valid = parsePriceAmount(trimmed) !== null;
  // An empty cell (no row yet) shows a hint instead of an inline error.
  const inlineError = trimmed !== "" && !valid ? strings.invalidAmount : null;
  const serverError = state?.error ?? null;
  const shownError = serverError ?? inlineError;

  return (
    <form action={action} className="price-cell">
      <input type="hidden" name="subject_id" value={subjectId} />
      <input type="hidden" name="interval" value={interval} />
      <div className="price-cell-row">
        <input
          id={inputId}
          className="price-input"
          name="amount"
          type="number"
          inputMode="decimal"
          min={0.01}
          max={10000}
          step={0.01}
          value={v}
          onChange={(e) => setV(e.target.value)}
          aria-label={strings.ariaLabel}
          placeholder="0.00"
        />
        <span className="price-currency">{currency}</span>
        <button
          className="btn btn-sm"
          type="submit"
          disabled={pending || !valid}
        >
          {pending ? strings.saving : strings.save}
        </button>
      </div>
      <div className="price-cell-foot">
        {shownError ? (
          <span className="inline-status err" role="alert">
            {shownError}
          </span>
        ) : showSaved ? (
          <span className="inline-status ok" role="status">
            {strings.saved}
          </span>
        ) : initialAmount === null ? (
          <span className="price-not-set">{strings.notSet}</span>
        ) : null}
      </div>
    </form>
  );
}
