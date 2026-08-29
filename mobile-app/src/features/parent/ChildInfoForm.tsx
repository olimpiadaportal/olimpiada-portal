// Add-child INFO step (web AddChildWizard step 1 parity): first/last name,
// city → district (rayon) → school cascade, grade, child password. Round-18
// contract: all fields are CONTROLLED React state and selects carry UUIDs; on
// a city change the rayon clears immediately and a still-valid school is kept
// while a foreign one is cleared (when the new city's school list arrives).
// Round 21: the rayon field shows ONLY when the chosen city has active rayons
// — required then — and narrows the school list to that rayon's schools PLUS
// the schools without a rayon yet. Client checks are UX only — the BFF re-runs
// the authoritative validation (a missing rayon maps to
// addchild.err.districtRequired).
import React, { useEffect } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { PasswordField, TextField } from "@/components/TextField";
import { spacing } from "@/theme/tokens";
import { formatGradeLabel } from "@/lib/gradeLabel";
import type { AddChildFields } from "@/lib/api";
import { useFieldChain } from "@/lib/useFieldChain";
import { checkNewPassword } from "@/lib/passwordPolicy";
import { useT } from "@/i18n/useT";
import {
  useCities,
  useCityDistricts,
  useGrades,
  useSchools,
  type CityDistrictRow,
  type SchoolRow,
} from "./queries";
import { SelectField, type SelectItem } from "./SelectField";

export type ChildInfo = {
  firstName: string;
  lastName: string;
  gradeId: string;
  cityId: string;
  /** The intra-city rayon (city_districts.id) — NOT the city. */
  cityDistrictId: string;
  schoolId: string;
  password: string;
};

export const EMPTY_CHILD_INFO: ChildInfo = {
  firstName: "",
  lastName: "",
  gradeId: "",
  cityId: "",
  cityDistrictId: "",
  schoolId: "",
  password: "",
};

export type ChildInfoErrors = Partial<Record<keyof ChildInfo, string>>;

/** Rayons of one city (empty array = the district field is hidden). */
export function rayonsOfCity(
  districts: CityDistrictRow[] | undefined,
  cityId: string,
): CityDistrictRow[] {
  if (!cityId) return [];
  return (districts ?? []).filter((d) => d.city_id === cityId);
}

/** Client-side required checks (error values are i18n KEYS). The rayon is
 *  required only when the chosen city has active rayons. */
export function validateChildInfo(v: ChildInfo, hasDistricts: boolean): ChildInfoErrors {
  const e: ChildInfoErrors = {};
  if (!v.firstName.trim()) e.firstName = "auth.child.err.firstNameRequired";
  if (!v.lastName.trim()) e.lastName = "auth.child.err.lastNameRequired";
  if (!v.cityId) e.cityId = "addchild.err.cityRequired";
  if (v.cityId && hasDistricts && !v.cityDistrictId)
    e.cityDistrictId = "addchild.err.districtRequired";
  if (!v.schoolId) e.schoolId = "addchild.err.schoolRequired";
  if (!v.gradeId) e.gradeId = "addchild.err.gradeRequired";
  if (!v.password) e.password = "auth.child.err.passwordRequired";
  else {
    // FEEDBACK ONLY — the BFF re-runs the identical rule. `tooShort` keeps its
    // existing message; the strength dimensions the old length test never
    // covered share the one passwordWeak string.
    const p = checkNewPassword(v.password);
    if (p) {
      e.password =
        p === "tooShort" ? "auth.child.err.passwordTooShort" : "auth.child.err.passwordWeak";
    }
  }
  return e;
}

type GradeRow = { id: string; level: number; name: string };
type CityRow = { id: string; name: string };

/** Web parity: rayon chosen → that rayon's schools first, then the schools
 *  without a rayon yet (they must stay selectable). No rayon → the full list. */
export function filterSchoolsByRayon(
  schools: SchoolRow[],
  hasDistricts: boolean,
  cityDistrictId: string,
): SchoolRow[] {
  if (!hasDistricts || !cityDistrictId) return schools;
  return [
    ...schools.filter((s) => s.city_district_id === cityDistrictId),
    ...schools.filter((s) => s.city_district_id == null),
  ];
}

/** BFF payload incl. the display-fallback strings the web action also stores.
 *  NAMING TRAP: district_id = the CITY; city_district_id = the rayon. */
export function buildAddChildFields(
  v: ChildInfo,
  catalogs: { grades: GradeRow[]; cities: CityRow[]; schools: { id: string; name: string }[] },
): AddChildFields {
  const grade = catalogs.grades.find((g) => g.id === v.gradeId);
  return {
    first_name: v.firstName.trim(),
    last_name: v.lastName.trim(),
    grade_id: v.gradeId,
    district_id: v.cityId,
    city_district_id: v.cityDistrictId,
    school_id: v.schoolId,
    password: v.password,
    city: catalogs.cities.find((c) => c.id === v.cityId)?.name ?? "",
    school_name: catalogs.schools.find((s) => s.id === v.schoolId)?.name ?? "",
    class_grade: grade?.name ?? "",
  };
}

export function ChildInfoForm({
  value,
  onChange,
  errors,
  disabled = false,
}: {
  value: ChildInfo;
  onChange: (patch: Partial<ChildInfo>) => void;
  /** Field → i18n key (from validateChildInfo or server field errors). */
  errors: ChildInfoErrors;
  disabled?: boolean;
}) {
  const { t, locale } = useT();
  const grades = useGrades();
  const cities = useCities();
  const districts = useCityDistricts();
  const schools = useSchools(value.cityId);

  const cityRayons = rayonsOfCity(districts.data, value.cityId);
  const hasDistricts = cityRayons.length > 0;

  // Cascade rule: once the selected city's schools arrive, keep the current
  // school if it belongs to this city (and the chosen rayon's narrowed list),
  // clear it if it is foreign.
  const schoolRows = filterSchoolsByRayon(
    (schools.data ?? []) as SchoolRow[],
    hasDistricts,
    value.cityDistrictId,
  );
  const schoolsReady = schools.isSuccess;
  useEffect(() => {
    if (!schoolsReady) return;
    if (value.schoolId && !schoolRows.some((s) => s.id === value.schoolId)) {
      onChange({ schoolId: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync only on new school list / selection
  }, [schoolsReady, schoolRows, value.schoolId]);

  const gradeItems: SelectItem[] = ((grades.data ?? []) as GradeRow[]).map((g) => ({
    kind: "option",
    value: g.id,
    label: formatGradeLabel(g.level, locale, g.name),
  }));
  const cityItems: SelectItem[] = ((cities.data ?? []) as CityRow[]).map((c) => ({
    kind: "option",
    value: c.id,
    label: c.name,
  }));
  const rayonItems: SelectItem[] = cityRayons.map((d) => ({
    kind: "option",
    value: d.id,
    label: d.name,
  }));

  // Private schools first under their own header, then public (fetch order is
  // already private-first, so a simple partition keeps the server order).
  const privateSchools = schoolRows.filter((s) => s.is_private === true);
  const publicSchools = schoolRows.filter((s) => s.is_private !== true);
  const schoolItems: SelectItem[] = [];
  if (privateSchools.length > 0 && publicSchools.length > 0) {
    schoolItems.push({ kind: "header", label: t("addchild.field.privateSchools") });
    for (const s of privateSchools) schoolItems.push({ kind: "option", value: s.id, label: s.name });
    schoolItems.push({ kind: "header", label: t("addchild.field.publicSchools") });
    for (const s of publicSchools) schoolItems.push({ kind: "option", value: s.id, label: s.name });
  } else {
    for (const s of schoolRows) schoolItems.push({ kind: "option", value: s.id, label: s.name });
  }

  const err = (k: keyof ChildInfo) => (errors[k] ? t(errors[k] as string) : null);

  // Run 1 of 2: the names. It ENDS at lastName — four required selects follow,
  // and a chain that jumped straight to the password would silently skip them.
  // No `onLast`, so the return key there just closes the keyboard.
  const nameChain = useFieldChain(2);

  return (
    <View style={{ gap: spacing.lg }}>
      <TextField
        {...nameChain.field(0)}
        label={`${t("parent.child.first")} *`}
        value={value.firstName}
        onChangeText={(v) => onChange({ firstName: v })}
        maxLength={100}
        editable={!disabled}
        autoCapitalize="words"
        autoComplete="off"
        error={err("firstName")}
      />
      <TextField
        {...nameChain.field(1)}
        label={`${t("parent.child.last")} *`}
        value={value.lastName}
        onChangeText={(v) => onChange({ lastName: v })}
        maxLength={100}
        editable={!disabled}
        autoCapitalize="words"
        autoComplete="off"
        error={err("lastName")}
      />
      <SelectField
        label={`${t("addchild.field.city")} *`}
        placeholder={t("addchild.field.selectCity")}
        items={cityItems}
        value={value.cityId}
        // A school belongs to one city and a rayon to one city — changing the
        // city always clears the rayon; the school clears via the list effect.
        onChange={(cityId) =>
          onChange(cityId !== value.cityId ? { cityId, cityDistrictId: "" } : { cityId })
        }
        disabled={disabled}
        error={err("cityId")}
        closeLabel={t("mob.select.cancel")}
      />
      {hasDistricts ? (
        <SelectField
          label={`${t("addchild.field.district")} *`}
          placeholder={t("addchild.field.selectDistrict")}
          items={rayonItems}
          value={value.cityDistrictId}
          onChange={(cityDistrictId) => onChange({ cityDistrictId })}
          disabled={disabled}
          error={err("cityDistrictId")}
          closeLabel={t("mob.select.cancel")}
        />
      ) : null}
      <SelectField
        label={`${t("addchild.field.school")} *`}
        placeholder={
          value.cityId ? t("addchild.field.selectSchool") : t("addchild.field.cityFirst")
        }
        items={schoolItems}
        value={value.schoolId}
        onChange={(schoolId) => onChange({ schoolId })}
        disabled={disabled || !value.cityId}
        error={err("schoolId")}
        closeLabel={t("mob.select.cancel")}
      />
      <SelectField
        label={`${t("addchild.field.grade")} *`}
        placeholder={t("addchild.field.selectGrade")}
        items={gradeItems}
        value={value.gradeId}
        onChange={(gradeId) => onChange({ gradeId })}
        disabled={disabled}
        error={err("gradeId")}
        closeLabel={t("mob.select.cancel")}
      />
      <View style={{ gap: spacing.xs }}>
        {/* Run 2 of 2: a run of one. It only DISMISSES — the avatar picker and
            the review summary sit between this field and the wizard's CTA, so
            submitting from the keyboard would skip the review step. */}
        <PasswordField
          label={`${t("parent.child.password")} *`}
          value={value.password}
          onChangeText={(v) => onChange({ password: v })}
          editable={!disabled}
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          showLabel={t("mob.pw.show")}
          hideLabel={t("mob.pw.hide")}
          error={err("password")}
        />
        <AppText variant="muted">{t("parent.child.passwordHint")}</AppText>
      </View>
    </View>
  );
}
