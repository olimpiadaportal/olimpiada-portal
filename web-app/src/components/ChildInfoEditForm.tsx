"use client";

// Parent-facing edit form for a child's profile info (name, grade, city,
// school). Mirrors the Add-Child INFO step's city→school cascade, but here it
// EDITS an existing child. Internal identifiers (8-digit login ID, profile id)
// are shown READ-ONLY and are never sent as editable fields. All writes go
// through the ownership-checked updateChildProfile server action.
//
// SUBMIT MODEL (bug fix): the form is fully controlled and the action is
// dispatched manually inside startTransition with a FormData built FROM STATE
// — never via the native <form action> flow. Two reasons:
//   1. React 19 auto-resets a form's DOM fields after a <form action>
//      completes, which visibly wiped the selects/inputs here;
//   2. building FormData from state guarantees every field the server action
//      expects (first_name/last_name/district_id/school_id/grade_id) is posted
//      with exactly the value on screen.
// So entered values stay visible during and after Save, on success AND on error.
import Link from "next/link";
import { startTransition, useActionState, useMemo, useState } from "react";
import { useLocale } from "@/i18n/I18nProvider";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { updateChildProfile, type UpdateChildState } from "@/lib/auth/parentService";

type City = { id: string; name: string };
type School = {
  id: string;
  name: string;
  district_id: string | null;
  is_private?: boolean;
};
type Grade = { id: string; level: number; name: string };

// Per-field client validation messages (i18n KEYS — the server returns the
// same keys, so both layers localize identically).
type FieldErrors = Partial<
  Record<"first" | "last" | "city" | "school" | "grade", string>
>;

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
  const locale = useLocale();
  const [state, action, pending] = useActionState<UpdateChildState, FormData>(
    updateChildProfile,
    null,
  );

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [districtId, setDistrictId] = useState(initial.districtId);
  const [schoolId, setSchoolId] = useState(initial.schoolId);
  const [gradeId, setGradeId] = useState(initial.gradeId);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Schools available for the chosen city (same client-side filter the wizard
  // uses). Changing the city keeps the selected school ONLY if it belongs to
  // the new city; otherwise it clears so a stale school never posts.
  const citySchools = useMemo(
    () => (districtId ? schools.filter((s) => s.district_id === districtId) : []),
    [districtId, schools],
  );
  const hasPrivate = citySchools.some((s) => s.is_private);
  const hasPublic = citySchools.some((s) => !s.is_private);

  function handleCityChange(nextCityId: string) {
    setDistrictId(nextCityId);
    setSchoolId((prev) =>
      prev && schools.find((s) => s.id === prev)?.district_id === nextCityId
        ? prev
        : "",
    );
  }

  // Client-side required checks mirror the server's validateChildInfo (same
  // i18n keys); the server re-validates authoritatively either way.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return; // double-submit guard (button is also disabled)

    const errs: FieldErrors = {};
    if (!firstName.trim()) errs.first = "auth.child.err.firstNameRequired";
    if (!lastName.trim()) errs.last = "auth.child.err.lastNameRequired";
    if (!districtId) errs.city = "addchild.err.cityRequired";
    if (!schoolId) errs.school = "addchild.err.schoolRequired";
    if (!gradeId) errs.grade = "addchild.err.gradeRequired";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    // Exact field names updateChildProfile reads. Free-text fallbacks (city /
    // school_name / class_grade DB label) are derived from the selections so
    // the child's read-only profile card shows a name even without the join.
    const fd = new FormData();
    fd.set("student_profile_id", studentProfileId);
    fd.set("first_name", firstName.trim());
    fd.set("last_name", lastName.trim());
    fd.set("district_id", districtId);
    fd.set("school_id", schoolId);
    fd.set("grade_id", gradeId);
    fd.set("city", cities.find((c) => c.id === districtId)?.name ?? "");
    fd.set("school_name", citySchools.find((s) => s.id === schoolId)?.name ?? "");
    fd.set("class_grade", grades.find((g) => g.id === gradeId)?.name ?? "");

    startTransition(() => {
      action(fd);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="form" noValidate>
      <label className="field">
        <span className="field-label">{tt("parent.child.first")} *</span>
        <input
          name="first_name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          maxLength={80}
          required
          aria-invalid={!!fieldErrors.first}
        />
        {fieldErrors.first && (
          <span className="field-error">{tt(fieldErrors.first)}</span>
        )}
      </label>
      <label className="field">
        <span className="field-label">{tt("parent.child.last")} *</span>
        <input
          name="last_name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          maxLength={80}
          required
          aria-invalid={!!fieldErrors.last}
        />
        {fieldErrors.last && (
          <span className="field-error">{tt(fieldErrors.last)}</span>
        )}
      </label>

      <label className="field">
        <span className="field-label">{tt("addchild.field.city")} *</span>
        <select
          name="district_id"
          value={districtId}
          onChange={(e) => handleCityChange(e.target.value)}
          required
          aria-invalid={!!fieldErrors.city}
        >
          <option value="">{tt("addchild.field.selectCity")}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {fieldErrors.city && (
          <span className="field-error">{tt(fieldErrors.city)}</span>
        )}
      </label>

      <label className="field">
        <span className="field-label">{tt("addchild.field.school")} *</span>
        <select
          name="school_id"
          value={schoolId}
          onChange={(e) => setSchoolId(e.target.value)}
          disabled={!districtId}
          required
          aria-invalid={!!fieldErrors.school}
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
        {fieldErrors.school && (
          <span className="field-error">{tt(fieldErrors.school)}</span>
        )}
      </label>

      <label className="field">
        <span className="field-label">{tt("addchild.field.grade")} *</span>
        <select
          name="grade_id"
          value={gradeId}
          onChange={(e) => setGradeId(e.target.value)}
          required
          aria-invalid={!!fieldErrors.grade}
        >
          <option value="">{tt("addchild.field.selectGrade")}</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {formatGradeLabel(g.level, locale, g.name)}
            </option>
          ))}
        </select>
        {fieldErrors.grade && (
          <span className="field-error">{tt(fieldErrors.grade)}</span>
        )}
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

      {state?.ok && !pending && <p className="prof2-ok">{tt("childedit.saved")}</p>}
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
