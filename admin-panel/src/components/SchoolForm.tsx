"use client";

import { useActionState } from "react";
import {
  saveSchool,
  type SchoolSaveState,
  type CityOption,
} from "@/lib/admin/schools";

export type SchoolFormLabels = {
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
  errGeneric: string;
  isPrivate: string;
  isPrivateHint: string;
};

function mapError(code: string | undefined, l: SchoolFormLabels): string | null {
  if (!code) return null;
  if (code === "missing.name") return l.errMissingName;
  if (code === "missing.city") return l.errMissingCity;
  return l.errGeneric;
}

export function SchoolForm({
  labels,
  cityOptions,
  defaultValues,
  id,
}: {
  labels: SchoolFormLabels;
  cityOptions: CityOption[];
  defaultValues?: {
    name?: string;
    district_id?: string;
    status?: string;
    is_private?: boolean;
  };
  id?: string;
}) {
  const [state, formAction, pending] = useActionState<SchoolSaveState, FormData>(
    saveSchool,
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
          <span className="field-label">
            {labels.city}
            <span className="req"> *</span>
          </span>
          <select
            name="district_id"
            defaultValue={defaultValues?.district_id ?? ""}
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
