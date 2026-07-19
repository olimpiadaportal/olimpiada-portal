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
import { saveChildAvatar } from "@/lib/auth/childAvatarActions";
import {
  ChildAvatarPicker,
  type ChildAvatarChoice,
} from "@/components/ChildAvatarPicker";

type City = { id: string; name: string };
// NAMING (Round 21): `districts` is the CITIES table (historic naming) —
// School.district_id and the `districtId` state mean the CITY. The real
// intra-city district (rayon) is `city_districts` / School.city_district_id /
// the `cityDistrictId` state, stored as students.city_district_id.
type CityDistrict = { id: string; name: string; city_id: string };
type School = {
  id: string;
  name: string;
  district_id: string | null;
  city_district_id?: string | null;
  is_private?: boolean;
};
type Grade = { id: string; level: number; name: string };

// Per-field client validation messages (i18n KEYS — the server returns the
// same keys, so both layers localize identically).
type FieldErrors = Partial<
  Record<"first" | "last" | "city" | "district" | "school" | "grade", string>
>;

export function ChildInfoEditForm({
  studentProfileId,
  childUniqueId,
  initial,
  initialAvatar,
  cities,
  cityDistricts,
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
    cityDistrictId: string;
    schoolId: string;
    gradeId: string;
  };
  /** Parent-managed avatar state (photoUrl = short-lived signed URL). */
  initialAvatar: {
    kind: string;
    key: string | null;
    photoUrl: string | null;
  };
  cities: City[];
  cityDistricts: CityDistrict[];
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
  const [districtId, setDistrictId] = useState(initial.districtId); // the CITY
  const [cityDistrictId, setCityDistrictId] = useState(initial.cityDistrictId); // the rayon
  const [schoolId, setSchoolId] = useState(initial.schoolId);
  const [gradeId, setGradeId] = useState(initial.gradeId);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Avatar (parent-managed): the picker mirrors the stored state; Save only
  // dispatches the avatar action when the selection actually changed.
  const initialChoice: ChildAvatarChoice =
    initialAvatar.kind === "photo"
      ? "photo"
      : initialAvatar.key === "boy" || initialAvatar.key === "girl"
        ? initialAvatar.key
        : "default";
  const [avatarChoice, setAvatarChoice] = useState<ChildAvatarChoice>(initialChoice);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  // What the SERVER currently has (advances after a successful save).
  const [avatarBaseline, setAvatarBaseline] = useState<ChildAvatarChoice>(initialChoice);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Rayons of the chosen city. A city with NO active rayons skips the district
  // field entirely (its schools attach directly to the city).
  const cityRayons = useMemo(
    () => (districtId ? cityDistricts.filter((d) => d.city_id === districtId) : []),
    [districtId, cityDistricts],
  );
  const hasDistricts = cityRayons.length > 0;

  // Schools available for the chosen city (same client-side filter the wizard
  // uses). Changing the city keeps the selected school ONLY if it belongs to
  // the new city; otherwise it clears so a stale school never posts. When a
  // rayon is chosen, narrow to that rayon's schools PLUS the schools without
  // a rayon yet (they must stay selectable), listed after the exact matches.
  const citySchools = useMemo(() => {
    const all = districtId ? schools.filter((s) => s.district_id === districtId) : [];
    if (!hasDistricts || !cityDistrictId) return all;
    return [
      ...all.filter((s) => s.city_district_id === cityDistrictId),
      ...all.filter((s) => s.city_district_id == null),
    ];
  }, [districtId, cityDistrictId, hasDistricts, schools]);
  const hasPrivate = citySchools.some((s) => s.is_private);
  const hasPublic = citySchools.some((s) => !s.is_private);

  function handleCityChange(nextCityId: string) {
    setDistrictId(nextCityId);
    // Keep the rayon only if it belongs to the new city; otherwise clear it.
    const keptRayon = cityDistricts.some(
      (d) => d.id === cityDistrictId && d.city_id === nextCityId,
    )
      ? cityDistrictId
      : "";
    setCityDistrictId(keptRayon);
    setSchoolId((prev) => {
      const s = schools.find((x) => x.id === prev);
      return s &&
        s.district_id === nextCityId &&
        (!keptRayon || s.city_district_id == null || s.city_district_id === keptRayon)
        ? prev
        : "";
    });
  }

  // Rayon change keeps the school only if it fits (schools without a rayon
  // stay valid). The school never mutates the rayon — only the reverse.
  function handleDistrictChange(next: string) {
    setCityDistrictId(next);
    setSchoolId((prev) => {
      const s = schools.find((x) => x.id === prev);
      return s &&
        s.district_id === districtId &&
        (!next || s.city_district_id == null || s.city_district_id === next)
        ? prev
        : "";
    });
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
    // Round 21: the rayon is required whenever the chosen city has active
    // rayons (updateChildProfileCore re-enforces this server-side).
    if (districtId && hasDistricts && !cityDistrictId) {
      errs.district = "addchild.err.districtRequired";
    }
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
    fd.set("city_district_id", cityDistrictId); // the rayon ("" → null server-side)
    fd.set("school_id", schoolId);
    fd.set("grade_id", gradeId);
    fd.set("city", cities.find((c) => c.id === districtId)?.name ?? "");
    fd.set("school_name", citySchools.find((s) => s.id === schoolId)?.name ?? "");
    fd.set("class_grade", grades.find((g) => g.id === gradeId)?.name ?? "");

    // Avatar: dispatch its own ownership-checked action only when the picker
    // state changed. "photo" without a new file = keep the stored photo;
    // back to "default" from anything else = remove.
    let avatarAction: "photo" | "boy" | "girl" | "remove" | null = null;
    if (avatarChoice === "photo") {
      if (avatarFile) avatarAction = "photo";
    } else if (avatarChoice === "boy" || avatarChoice === "girl") {
      if (avatarChoice !== avatarBaseline) avatarAction = avatarChoice;
    } else if (avatarBaseline !== "default") {
      avatarAction = "remove";
    }

    startTransition(async () => {
      if (avatarAction) {
        const afd = new FormData();
        afd.set("student_profile_id", studentProfileId);
        afd.set("choice", avatarAction);
        if (avatarAction === "photo" && avatarFile) {
          afd.set("avatar_file", avatarFile);
        }
        const av = await saveChildAvatar(null, afd);
        if (av?.ok) {
          setAvatarBaseline(avatarChoice);
          setAvatarFile(null);
          setAvatarError(null);
        } else {
          setAvatarError(av?.error ?? null);
        }
      }
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

      {/* Round 21: rayon between City and School — disabled until a city is
          chosen; HIDDEN entirely when the chosen city has no active rayons. */}
      {(!districtId || hasDistricts) && (
        <label className="field">
          <span className="field-label">{tt("addchild.field.district")} *</span>
          <select
            name="city_district_id"
            value={cityDistrictId}
            onChange={(e) => handleDistrictChange(e.target.value)}
            disabled={!districtId}
            required={hasDistricts}
            aria-invalid={!!fieldErrors.district}
          >
            <option value="">
              {districtId
                ? tt("addchild.field.selectDistrict")
                : tt("addchild.field.cityFirst")}
            </option>
            {cityRayons.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {fieldErrors.district && (
            <span className="field-error">{tt(fieldErrors.district)}</span>
          )}
        </label>
      )}

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

      {/* Avatar (parent-managed): preset Boy/Girl, an uploaded photo, or the
          default initials bubble. Saved through its own ownership-checked
          action when the selection changed. */}
      <div className="field">
        <span className="field-label">{tt("addchild.avatar.title")}</span>
        <ChildAvatarPicker
          choice={avatarChoice}
          onChoiceChange={setAvatarChoice}
          file={avatarFile}
          onFileChange={setAvatarFile}
          currentPhotoUrl={initialAvatar.photoUrl}
          disabled={pending}
          dict={dict}
        />
        {avatarError && <span className="field-error">{avatarError}</span>}
      </div>

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
