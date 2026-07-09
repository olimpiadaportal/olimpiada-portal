"use client";

// Admin-only child-account editor. Edits the students-row profile fields
// (names, grade, city→school cascade, optional class_grade). The 8-digit
// child_unique_id and the internal profile id are shown READ-ONLY and are never
// submitted as editable values — all authorization/validation lives in the
// updateChildAccount server action.
import { useActionState, useMemo, useState } from "react";
import {
  updateChildAccount,
  type UpdateChildState,
} from "@/lib/admin/accounts";
import type {
  GradeOption,
  CityOption,
  SchoolOpt,
} from "@/components/CreateChildForm";

export type ChildEditStrings = {
  open: string;
  title: string;
  firstName: string;
  lastName: string;
  grade: string;
  gradeNone: string;
  city: string;
  cityChoose: string;
  school: string;
  schoolChoose: string;
  cityFirst: string;
  privateSchools: string;
  publicSchools: string;
  classGrade: string;
  classGradeHint: string;
  idLabel: string;
  idPending: string;
  profileId: string;
  readOnlyNote: string;
  submit: string;
  submitting: string;
  done: string;
  cancel: string;
};

export function ChildEditForm({
  studentProfileId,
  childUniqueId,
  current,
  grades,
  cities,
  schools,
  strings,
}: {
  studentProfileId: string;
  childUniqueId: string | null;
  current: {
    firstName: string;
    lastName: string;
    gradeId: string;
    districtId: string;
    schoolId: string;
    classGrade: string;
  };
  grades: GradeOption[];
  cities: CityOption[];
  schools: SchoolOpt[];
  strings: ChildEditStrings;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen(true)}
      >
        {strings.open}
      </button>
    );
  }

  return (
    <InnerForm
      studentProfileId={studentProfileId}
      childUniqueId={childUniqueId}
      current={current}
      grades={grades}
      cities={cities}
      schools={schools}
      strings={strings}
      onClose={() => setOpen(false)}
    />
  );
}

function InnerForm({
  studentProfileId,
  childUniqueId,
  current,
  grades,
  cities,
  schools,
  strings,
  onClose,
}: {
  studentProfileId: string;
  childUniqueId: string | null;
  current: {
    firstName: string;
    lastName: string;
    gradeId: string;
    districtId: string;
    schoolId: string;
    classGrade: string;
  };
  grades: GradeOption[];
  cities: CityOption[];
  schools: SchoolOpt[];
  strings: ChildEditStrings;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<UpdateChildState, FormData>(
    updateChildAccount,
    null,
  );

  // City -> School cascade, pre-selected from the child's current values.
  // Schools arrive pre-ordered private-first + numeric (from the page query).
  const [districtId, setDistrictId] = useState(current.districtId);
  const [schoolId, setSchoolId] = useState(current.schoolId);
  const citySchools = useMemo(
    () => (districtId ? schools.filter((s) => s.district_id === districtId) : []),
    [schools, districtId],
  );
  const hasPrivate = citySchools.some((s) => s.is_private);

  return (
    <form
      action={action}
      className="card"
      style={{
        marginTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <strong>{strings.title}</strong>

      {/* Read-only identifiers: the 8-digit login ID and the internal profile
          id are never editable — the profile id is submitted hidden ONLY to
          identify the target row. */}
      <input type="hidden" name="student_profile_id" value={studentProfileId} />
      <div className="form-grid">
        <div className="field">
          <span>{strings.idLabel}</span>
          <div className="fawiz-locked-value nowrap">
            {childUniqueId ?? strings.idPending}
          </div>
        </div>
        <div className="field">
          <span>{strings.profileId}</span>
          <div className="fawiz-locked-value muted nowrap">{studentProfileId}</div>
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {strings.readOnlyNote}
      </p>

      <div className="form-grid">
        <label className="field">
          <span>{strings.firstName}</span>
          <input
            name="first_name"
            defaultValue={current.firstName}
            required
            maxLength={80}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>{strings.lastName}</span>
          <input
            name="last_name"
            defaultValue={current.lastName}
            required
            maxLength={80}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>{strings.grade}</span>
          <select name="grade_id" defaultValue={current.gradeId}>
            <option value="">{strings.gradeNone}</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{strings.classGrade}</span>
          <input
            name="class_grade"
            defaultValue={current.classGrade}
            maxLength={40}
            autoComplete="off"
          />
          <small className="muted">{strings.classGradeHint}</small>
        </label>

        {/* City -> School cascade (both required). */}
        <label className="field">
          <span>{strings.city}</span>
          <select
            name="district_id"
            required
            value={districtId}
            onChange={(e) => {
              setDistrictId(e.target.value);
              setSchoolId("");
            }}
          >
            <option value="" disabled>
              {strings.cityChoose}
            </option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{strings.school}</span>
          <select
            name="school_id"
            required
            value={schoolId}
            disabled={!districtId}
            onChange={(e) => setSchoolId(e.target.value)}
          >
            <option value="" disabled>
              {districtId ? strings.schoolChoose : strings.cityFirst}
            </option>
            {hasPrivate && (
              <optgroup label={strings.privateSchools}>
                {citySchools
                  .filter((s) => s.is_private)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            )}
            {hasPrivate ? (
              <optgroup label={strings.publicSchools}>
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
            )}
          </select>
        </label>
      </div>

      <div className="row-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? strings.submitting : strings.submit}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          {strings.cancel}
        </button>
        {state?.error && <span className="form-error">{state.error}</span>}
        {state?.ok && <span className="form-ok">{strings.done}</span>}
      </div>
    </form>
  );
}
