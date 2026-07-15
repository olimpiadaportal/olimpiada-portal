"use client";

// STAY-mode (Round 21): saveSchool returns { ok: true } instead of redirecting;
// the host (a Locations modal) passes `onSaved` to close + refresh in place.
import { useEffect, useState } from "react";
import { useActionState } from "react";
import {
  saveSchool,
  type SchoolSaveState,
  type CityOption,
  type SchoolDistrictOption,
} from "@/lib/admin/schools";

export type SchoolFormLabels = {
  name: string;
  city: string;
  district: string;
  status: string;
  statusActive: string;
  statusInactive: string;
  selectPlaceholder: string;
  submit: string;
  saving: string;
  errMissingName: string;
  errMissingCity: string;
  errMissingDistrict: string;
  errGeneric: string;
  isPrivate: string;
  isPrivateHint: string;
};

function mapError(code: string | undefined, l: SchoolFormLabels): string | null {
  if (!code) return null;
  if (code === "missing.name") return l.errMissingName;
  if (code === "missing.city") return l.errMissingCity;
  if (code === "missing.district") return l.errMissingDistrict;
  return l.errGeneric;
}

export function SchoolForm({
  labels,
  cityOptions,
  districtOptions,
  defaultValues,
  id,
  onSaved,
}: {
  labels: SchoolFormLabels;
  cityOptions: CityOption[];
  /** ALL active districts of every city (+ the currently-assigned one on edit);
   *  the form filters them by the selected city. */
  districtOptions: SchoolDistrictOption[];
  defaultValues?: {
    name?: string;
    district_id?: string;
    city_district_id?: string | null;
    status?: string;
    is_private?: boolean;
  };
  id?: string;
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState<SchoolSaveState, FormData>(
    saveSchool,
    null,
  );

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  // City → District cascade: the district select shows ONLY the selected
  // city's districts, is required when that city has any, is hidden for
  // cities without districts, and resets whenever the city changes.
  const [cityId, setCityId] = useState(defaultValues?.district_id ?? "");
  const [districtId, setDistrictId] = useState(
    defaultValues?.city_district_id ?? "",
  );

  const cityDistricts = districtOptions.filter((d) => d.cityId === cityId);
  const hasDistricts = cityDistricts.length > 0;

  function onCityChange(next: string) {
    setCityId(next);
    setDistrictId(""); // never carry a district across cities
  }

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
          <span className="field-label">
            {labels.city}
            <span className="req"> *</span>
          </span>
          <select
            name="district_id"
            value={cityId}
            required
            onChange={(e) => onCityChange(e.target.value)}
          >
            <option value="">{labels.selectPlaceholder}</option>
            {cityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {hasDistricts && (
          <label className="field">
            <span className="field-label">
              {labels.district}
              <span className="req"> *</span>
            </span>
            <select
              name="city_district_id"
              value={districtId ?? ""}
              required
              onChange={(e) => setDistrictId(e.target.value)}
            >
              <option value="">{labels.selectPlaceholder}</option>
              {cityDistricts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span className="field-label">{labels.status}</span>
          <select name="status" defaultValue={defaultValues?.status ?? "active"}>
            <option value="active">{labels.statusActive}</option>
            <option value="inactive">{labels.statusInactive}</option>
          </select>
        </label>
      </div>

      <label
        className="field"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          name="is_private"
          value="1"
          defaultChecked={defaultValues?.is_private ?? false}
          style={{ width: "auto", margin: 0 }}
        />
        <span className="field-label" style={{ margin: 0 }}>
          {labels.isPrivate}
          <span className="muted" style={{ fontWeight: 400 }}>
            {" "}
            — {labels.isPrivateHint}
          </span>
        </span>
      </label>

      {mapError(state?.error, labels) && (
        <p className="form-error">{mapError(state?.error, labels)}</p>
      )}

      <button className="btn" type="submit" disabled={pending}>
        {pending ? labels.saving : labels.submit}
      </button>
    </form>
  );
}
