"use client";

import { useActionState } from "react";
import { saveCity, type CitySaveState } from "@/lib/admin/cities";

// Error codes returned by saveCity mapped to localized strings passed from the
// server page (so this client component holds no i18n dictionary itself).
export type CityFormLabels = {
  name: string;
  countryCode: string;
  status: string;
  statusActive: string;
  statusInactive: string;
  submit: string;
  saving: string;
  errMissingName: string;
  errDuplicate: string;
  errGeneric: string;
};

function mapError(code: string | undefined, l: CityFormLabels): string | null {
  if (!code) return null;
  if (code === "missing.name") return l.errMissingName;
  if (code === "duplicate") return l.errDuplicate;
  return l.errGeneric;
}

export function CityForm({
  labels,
  defaultValues,
  id,
}: {
  labels: CityFormLabels;
  defaultValues?: { name?: string; country_code?: string; status?: string };
  id?: string;
}) {
  const [state, formAction, pending] = useActionState<CitySaveState, FormData>(
    saveCity,
    null,
  );

  return (
    <form action={formAction} className="form">
      {id && <input type="hidden" name="__id" value={id} />}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">
            {labels.name}
            <span className="req"> *</span>
          </span>
          <input
            type="text"
            name="name"
            defaultValue={defaultValues?.name ?? ""}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">{labels.countryCode}</span>
          <input
            type="text"
            name="country_code"
            maxLength={2}
            defaultValue={defaultValues?.country_code ?? "AZ"}
          />
        </label>

        <label className="field">
          <span className="field-label">{labels.status}</span>
          <select name="status" defaultValue={defaultValues?.status ?? "active"}>
            <option value="active">{labels.statusActive}</option>
            <option value="inactive">{labels.statusInactive}</option>
          </select>
        </label>
      </div>

      {mapError(state?.error, labels) && (
        <p className="form-error">{mapError(state?.error, labels)}</p>
      )}

      <button className="btn" type="submit" disabled={pending}>
        {pending ? labels.saving : labels.submit}
      </button>
    </form>
  );
}
