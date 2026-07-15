"use client";

import { useActionState, useEffect } from "react";
import { saveDistrict, type DistrictSaveState } from "@/lib/admin/districts";

// Create/edit form for a city district (rayon). Error codes returned by
// saveDistrict are mapped to localized strings passed from the server page
// (so this client component holds no i18n dictionary itself).
// STAY-mode (Round 21): saveDistrict returns { ok: true } instead of
// redirecting; the host (a Locations modal) passes `onSaved` to close +
// refresh in place.
export type DistrictFormLabels = {
  name: string;
  city: string;
  status: string;
  statusActive: string;
  statusInactive: string;
  selectPlaceholder: string;
  submit: string;
  saving: string;
  errMissingName: string;
  errMissingCity: string;
  errDuplicate: string;
  errCityChange: string;
  errGeneric: string;
};

export type DistrictCityOption = { value: string; label: string };

function mapError(
  code: string | undefined,
  l: DistrictFormLabels,
): string | null {
  if (!code) return null;
  if (code === "missing.name") return l.errMissingName;
  if (code === "missing.city") return l.errMissingCity;
  if (code === "duplicate") return l.errDuplicate;
  if (code === "cityChange") return l.errCityChange;
  return l.errGeneric;
}

export function DistrictForm({
  labels,
  cityOptions,
  defaultValues,
  id,
  onSaved,
}: {
  labels: DistrictFormLabels;
  cityOptions: DistrictCityOption[];
  defaultValues?: { name?: string; city_id?: string; status?: string };
  id?: string;
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    DistrictSaveState,
    FormData
  >(saveDistrict, null);

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  return (
    <form action={formAction} className="form">
      {id && <input type="hidden" name="__id" value={id} />}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">
            {labels.city}
            <span className="req"> *</span>
          </span>
          <select
            name="city_id"
            defaultValue={defaultValues?.city_id ?? ""}
            required
          >
            <option value="">{labels.selectPlaceholder}</option>
            {cityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

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
