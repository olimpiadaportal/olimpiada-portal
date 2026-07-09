"use client";

// Parent-facing edit form for a child's profile info (name, grade, city,
// school). Mirrors the Add-Child INFO step's city→school cascade, but here it
// EDITS an existing child. Internal identifiers (8-digit login ID, profile id)
// are shown READ-ONLY and are never sent as editable fields. All writes go
// through the ownership-checked updateChildProfile server action.
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { updateChildProfile, type UpdateChildState } from "@/lib/auth/parentService";

type City = { id: string; name: string };
type School = {
  id: string;
  name: string;
  district_id: string | null;
  is_private?: boolean;
};
type Grade = { id: string; level: number; name: string };

export function ChildInfoEditForm({
  studentProfileId,
  childUniqueId,
  initial,
  cities,
  schools,
  grades,
  dict,
}: {
  studentProfileId: string;
  childUniqueId: string | null;
  initial: {
    firstName: string;
    lastName: string;
    districtId: string;
    schoolId: string;
    gradeId: string;
  };
  cities: City[];
  schools: School[];
  grades: Grade[];
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;
  const [state, action, pending] = useActionState<UpdateChildState, FormData>(
    updateChildProfile,
    null,
  );

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [districtId, setDistrictId] = useState(initial.districtId);
  const [schoolId, setSchoolId] = useState(initial.schoolId);
  const [gradeId, setGradeId] = useState(initial.gradeId);

  // Schools available for the chosen city (same client-side filter the wizard
  // uses). Reset the school when the city changes so a stale school never posts.
  const citySchools = useMemo(
    () => (districtId ? schools.filter((s) => s.district_id === districtId) : []),
    [districtId, schools],
  );
  const hasPrivate = citySchools.some((s) => s.is_private);
  const hasPublic = citySchools.some((s) => !s.is_private);

  // Free-text fallbacks stored alongside the structured FKs (kept in sync so the
  // child's read-only profile card shows a name even without the join).
  const cityName = cities.find((c) => c.id === districtId)?.name ?? "";
  const schoolName = citySchools.find((s) => s.id === schoolId)?.name ?? "";
  const gradeLabel = grades.find((g) => g.id === gradeId)?.name ?? "";

  return (
    <form action={action} className="form">
      <input type="hidden" name="student_profile_id" value={studentProfileId} />
      {/* Free-text fallbacks derived from the current selections. */}
      <input type="hidden" name="city" value={cityName} />
      <input type="hidden" name="school_name" value={schoolName} />
      <input type="hidden" name="class_grade" value={gradeLabel} />

      <label className="field">
        <span className="field-label">{tt("parent.child.first")} *</span>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">{tt("parent.child.last")} *</span>
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
      </label>

      <label className="field">
        <span className="field-label">{tt("addchild.field.city")} *</span>
        <select
          name="district_id"
          value={districtId}
          onChange={(e) => {
            setDistrictId(e.target.value);
            setSchoolId("");
          }}
          required
        >
          <option value="">{tt("addchild.field.selectCity")}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">{tt("addchild.field.school")} *</span>
        <select
          name="school_id"
          value={schoolId}
          onChange={(e) => setSchoolId(e.target.value)}
          disabled={!districtId}
          required
        >
          <option value="">
            {districtId ? tt("addchild.field.selectSchool") : tt("addchild.field.cityFirst")}
          </option>
          {hasPrivate && (
            <optgroup label={tt("addchild.field.privateSchools")}>
              {citySchools
                .filter((s) => s.is_private)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          )}
          {hasPublic &&
            (hasPrivate ? (
              <optgroup label={tt("addchild.field.publicSchools")}>
                {citySchools
                  .filter((s) => !s.is_private)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            ) : (
              citySchools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">{tt("addchild.field.grade")} *</span>
        <select
          name="grade_id"
          value={gradeId}
          onChange={(e) => setGradeId(e.target.value)}
          required
        >
          <option value="">{tt("addchild.field.selectGrade")}</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.level} — {g.name}
            </option>
          ))}
        </select>
      </label>

      {/* Read-only identifiers — display only, never editable. */}
      <div className="prof2-rows" style={{ marginTop: 4 }}>
        <div className="prof2-row">
          <span className="prof2-row-label">{tt("parent.child.idLabel")}</span>
          <span className="prof2-row-value mono">{childUniqueId || tt("parent.dash.idPending")}</span>
        </div>
        <div className="prof2-row">
          <span className="prof2-row-label">{tt("childedit.internalId")}</span>
          <span className="prof2-row-value mono">{studentProfileId}</span>
        </div>
      </div>
      <p className="hint">{tt("childedit.idNote")}</p>

      {state?.ok && <p className="prof2-ok">{tt("childedit.saved")}</p>}
      {state?.errors && state.errors.length > 0 && (
        <ul className="form-error">
          {state.errors.map((e, i) => (
            <li key={i}>{tt(e)}</li>
          ))}
        </ul>
      )}
      {state?.error && <p className="form-error">{state.error}</p>}

      <div className="wizard-actions">
        <Link className="btn-ghost" href="/dashboard">
          {tt("childedit.back")}
        </Link>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? tt("childedit.saving") : tt("childedit.save")}
        </button>
      </div>
    </form>
  );
}
