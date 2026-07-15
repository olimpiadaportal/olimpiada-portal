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
  else if (v.password.length < 8) e.password = "auth.child.err.passwordTooShort";
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

  return (
    <View style={{ gap: spacing.lg }}>
      <TextField
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
        closeLabel={t("dpay.cancel")}
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
          closeLabel={t("dpay.cancel")}
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
        closeLabel={t("dpay.cancel")}
      />
      <SelectField
        label={`${t("addchild.field.grade")} *`}
        placeholder={t("addchild.field.selectGrade")}
        items={gradeItems}
        value={value.gradeId}
        onChange={(gradeId) => onChange({ gradeId })}
        disabled={disabled}
        error={err("gradeId")}
        closeLabel={t("dpay.cancel")}
      />
      <View style={{ gap: spacing.xs }}>
        <PasswordField
          label={`${t("parent.child.password")} *`}
          value={value.password}
          onChangeText={(v) => onChange({ password: v })}
          editable={!disabled}
          showLabel={t("mob.pw.show")}
          hideLabel={t("mob.pw.hide")}
          error={err("password")}
        />
        <AppText variant="muted">{t("parent.child.passwordHint")}</AppText>
      </View>
    </View>
  );
}
