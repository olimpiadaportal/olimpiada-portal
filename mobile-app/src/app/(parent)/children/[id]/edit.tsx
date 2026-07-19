// Parent edits a child's info (web ChildInfoEditForm parity): first/last name,
// city → district (rayon) → school cascade + grade (ALL selects submit
// database UUIDs), read-only 8-digit login ID, and an optional child-password
// reset. Round-18 lessons are baked in: fully controlled state that NEVER
// clears on save, the cascade keeps a still-valid school and clears a foreign
// one, per-field required errors, and a pending double-submit guard. Round 21:
// the rayon field shows only when the city has active rayons (required then,
// narrows the school list, preselected from the student's saved
// city_district_id — read directly, RLS-scoped) and posts city_district_id
// through the ownership-checked BFF.
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ChildAvatar } from "@/components/ChildAvatar";
import { PasswordField, TextField } from "@/components/TextField";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { fetchChildren, type ChildRow } from "@/lib/data";
import { resolveChildAvatarSource } from "@/lib/childAvatar";
import { supabase } from "@/lib/supabase";
import { bffEditChild, bffResetChildPassword } from "@/lib/api";
import { filterSchoolsByRayon, rayonsOfCity } from "@/features/parent/ChildInfoForm";
import {
  ChildAvatarPicker,
  applyChildAvatarChoice,
  type ChildAvatarChoice,
} from "@/features/parent/ChildAvatarPicker";
import {
  useCities,
  useCityDistricts,
  useGrades,
  useSchools,
  type SchoolRow,
} from "@/features/parent/queries";
import { SelectField, type SelectOption } from "@/features/profile/SelectField";

type FieldErrors = Partial<
  Record<"first" | "last" | "city" | "district" | "school" | "grade", string>
>;

/** The saved students row → the picker's initial selection. */
function initialAvatarChoice(child: ChildRow): ChildAvatarChoice {
  const src = resolveChildAvatarSource(child);
  if (src.type === "photo") return { kind: "photo", file: null, previewUri: null };
  if (src.type === "preset") return { kind: "preset", key: src.key };
  return { kind: "default" };
}

function choicesEqual(a: ChildAvatarChoice, b: ChildAvatarChoice): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "preset" && b.kind === "preset") return a.key === b.key;
  if (a.kind === "photo" && b.kind === "photo") return a.file === b.file;
  return true;
}

/** Avatar header + picker — applies each selection IMMEDIATELY through the
 *  ownership-checked BFF (a failed apply rolls the selection back). */
function AvatarEditor({ child }: { child: ChildRow }) {
  const { t } = useT();
  const { tokens } = useTheme();
  const queryClient = useQueryClient();
  const name =
    [child.first_name, child.last_name].filter(Boolean).join(" ").trim() || "—";

  const [choice, setChoice] = useState<ChildAvatarChoice>(() => initialAvatarChoice(child));
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: ChildAvatarChoice) {
    if (pending || choicesEqual(next, choice)) return;
    const prev = choice;
    setChoice(next);
    setSaved(false);
    setError(null);
    const req = applyChildAvatarChoice(child.profile_id, next);
    if (!req) return; // the existing server photo — nothing to send
    setPending(true);
    const res = await req;
    setPending(false);
    if (!res.ok) {
      setChoice(prev); // roll back — the server state did not change
      setError(t(res.error));
      return;
    }
    setSaved(true);
    void queryClient.invalidateQueries({ queryKey: ["children"] });
    void queryClient.invalidateQueries({ queryKey: ["parent", "children"] });
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        <ChildAvatar row={child} name={name} seed={child.profile_id} size={64} />
        <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>
          {name}
        </AppText>
      </View>
      <ChildAvatarPicker
        value={choice}
        onChange={(next) => void apply(next)}
        childName={name}
        seed={child.profile_id}
        disabled={pending}
        error={error}
        existingPhotoRow={child}
        t={t}
      />
      {saved && !pending && !error ? (
        <AppText variant="muted" color={tokens.ok}>
          {t("childedit.saved")}
        </AppText>
      ) : null}
    </Card>
  );
}

function EditForm({
  child,
  initialCityDistrictId,
}: {
  child: ChildRow;
  /** The student's saved rayon (students.city_district_id) — preselection. */
  initialCityDistrictId: string;
}) {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(child.first_name ?? "");
  const [lastName, setLastName] = useState(child.last_name ?? "");
  const [districtId, setDistrictId] = useState(child.district_id ?? ""); // the CITY
  const [cityDistrictId, setCityDistrictId] = useState(initialCityDistrictId); // the rayon
  const [schoolId, setSchoolId] = useState(child.school_id ?? "");
  const [gradeId, setGradeId] = useState(child.grade_id ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const citiesQ = useCities();
  const gradesQ = useGrades();
  const districtsQ = useCityDistricts();
  const schoolsQ = useSchools(districtId);

  const cityRayons = rayonsOfCity(districtsQ.data, districtId);
  const hasDistricts = cityRayons.length > 0;

  // The rayon narrows the school list to its schools + the NULL-rayon ones.
  const citySchools = useMemo(
    () =>
      filterSchoolsByRayon(
        (schoolsQ.data ?? []) as SchoolRow[],
        hasDistricts,
        cityDistrictId,
      ),
    [schoolsQ.data, hasDistricts, cityDistrictId],
  );

  // Cascade rule (web handleCityChange parity): a school AND a rayon belong to
  // exactly one city, so changing to a DIFFERENT city always clears both — a
  // stale/foreign UUID can never be posted. Re-selecting the same city keeps
  // the still-valid selections. Submit re-checks membership below.
  function handleCityChange(nextCityId: string) {
    if (nextCityId !== districtId) {
      setSchoolId("");
      setCityDistrictId("");
    }
    setDistrictId(nextCityId);
  }

  // Changing the rayon may orphan the chosen school — clear a foreign one.
  function handleRayonChange(nextRayonId: string) {
    setCityDistrictId(nextRayonId);
    if (schoolId && nextRayonId) {
      const all = (schoolsQ.data ?? []) as SchoolRow[];
      const still = all.find((s) => s.id === schoolId);
      if (still && still.city_district_id != null && still.city_district_id !== nextRayonId) {
        setSchoolId("");
      }
    }
  }

  const cityOptions: SelectOption[] = ((citiesQ.data ?? []) as { id: string; name: string }[]).map(
    (c) => ({ id: String(c.id), label: String(c.name) }),
  );
  const rayonOptions: SelectOption[] = cityRayons.map((d) => ({ id: d.id, label: d.name }));
  const hasPrivate = citySchools.some((s) => s.is_private === true);
  const schoolOptions: SelectOption[] = citySchools.map((s) => ({
    id: s.id,
    label: s.name,
    section: hasPrivate
      ? s.is_private === true
        ? t("addchild.field.privateSchools")
        : t("addchild.field.publicSchools")
      : undefined,
  }));
  const gradeOptions: SelectOption[] = ((gradesQ.data ?? []) as {
    id: string;
    level: number;
    name: string;
  }[]).map((g) => ({ id: String(g.id), label: formatGradeLabel(g.level, locale, g.name) }));

  async function submit() {
    if (pending) return; // double-submit guard
    setSaved(false);
    setError(null);

    const errs: FieldErrors = {};
    if (!firstName.trim()) errs.first = t("auth.child.err.firstNameRequired");
    if (!lastName.trim()) errs.last = t("auth.child.err.lastNameRequired");
    if (!districtId) errs.city = t("addchild.err.cityRequired");
    if (districtId && hasDistricts && !cityDistrictId)
      errs.district = t("addchild.err.districtRequired");
    if (!schoolId || (schoolsQ.isSuccess && !citySchools.some((s) => s.id === schoolId)))
      errs.school = t("addchild.err.schoolRequired");
    if (!gradeId) errs.grade = t("addchild.err.gradeRequired");
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setPending(true);
    const res = await bffEditChild(child.profile_id, {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      grade_id: gradeId,
      district_id: districtId,
      city_district_id: cityDistrictId,
      school_id: schoolId,
      // Display-name fallbacks derived from the selections (web parity).
      city: cityOptions.find((c) => c.id === districtId)?.label ?? "",
      school_name: citySchools.find((s) => s.id === schoolId)?.name ?? "",
      class_grade:
        ((gradesQ.data ?? []) as { id: string; name: string }[]).find(
          (g) => String(g.id) === gradeId,
        )?.name ?? "",
    });
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setSaved(true);
    void queryClient.invalidateQueries({ queryKey: ["children"] });
    void queryClient.invalidateQueries({ queryKey: ["parent", "children"] });
    void queryClient.invalidateQueries({
      queryKey: ["child-rayon", child.profile_id],
    });
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <AvatarEditor child={child} />
      <AppText variant="muted">{t("childedit.intro")}</AppText>

      <TextField
        label={`${t("parent.child.first")} *`}
        value={firstName}
        onChangeText={setFirstName}
        maxLength={80}
        error={fieldErrors.first}
      />
      <TextField
        label={`${t("parent.child.last")} *`}
        value={lastName}
        onChangeText={setLastName}
        maxLength={80}
        error={fieldErrors.last}
      />

      <SelectField
        label={`${t("addchild.field.city")} *`}
        value={districtId}
        options={cityOptions}
        placeholder={t("addchild.field.selectCity")}
        onChange={handleCityChange}
        error={fieldErrors.city}
      />
      {hasDistricts ? (
        <SelectField
          label={`${t("addchild.field.district")} *`}
          value={cityDistrictId}
          options={rayonOptions}
          placeholder={t("addchild.field.selectDistrict")}
          onChange={handleRayonChange}
          error={fieldErrors.district}
        />
      ) : null}
      <SelectField
        label={`${t("addchild.field.school")} *`}
        value={schoolId}
        options={schoolOptions}
        placeholder={districtId ? t("addchild.field.selectSchool") : t("addchild.field.cityFirst")}
        onChange={setSchoolId}
        disabled={!districtId || schoolsQ.isPending}
        error={fieldErrors.school}
      />
      <SelectField
        label={`${t("addchild.field.grade")} *`}
        value={gradeId}
        options={gradeOptions}
        placeholder={t("addchild.field.selectGrade")}
        onChange={setGradeId}
        error={fieldErrors.grade}
      />

      {/* Read-only identifiers — display only, never editable. */}
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <AppText variant="muted">{t("parent.child.idLabel")}</AppText>
          <AppText variant="mono" style={{ fontWeight: "700" }}>
            {child.child_unique_id ?? t("parent.dash.idPending")}
          </AppText>
        </View>
        <AppText variant="muted" style={{ fontSize: 12 }}>
          {t("childedit.idNote")}
        </AppText>
      </Card>

      {saved && !pending ? (
        <AppText variant="muted" color={tokens.ok}>
          {t("childedit.saved")}
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="muted" color={tokens.danger}>
          {error}
        </AppText>
      ) : null}

      <Button
        title={t("childedit.save")}
        pendingTitle={t("childedit.saving")}
        pending={pending}
        onPress={() => void submit()}
      />

      <PasswordReset childId={child.profile_id} />
    </View>
  );
}

function PasswordReset({ childId }: { childId: string }) {
  const { t } = useT();
  const { tokens } = useTheme();
  const [pw, setPw] = useState("");
  const [pending, setPending] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (pending) return;
    setOk(false);
    if (pw.length < 8) {
      setError(t("auth.child.err.passwordTooShort"));
      return;
    }
    setError(null);
    setPending(true);
    // The ≠8-digit-ID rule is enforced server-side by the BFF/service.
    const res = await bffResetChildPassword(childId, pw);
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setOk(true);
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <AppText variant="title" style={{ fontSize: 16 }}>
        {t("child.resetPw")}
      </AppText>
      <PasswordField
        label={t("parent.child.password")}
        value={pw}
        onChangeText={setPw}
        showLabel={t("mob.pw.show")}
        hideLabel={t("mob.pw.hide")}
        error={error}
      />
      <AppText variant="muted" style={{ fontSize: 12 }}>
        {t("parent.child.passwordHint")}
      </AppText>
      {ok && !pending ? (
        <AppText variant="muted" color={tokens.ok}>
          {t("auth.child.passwordReset")}
        </AppText>
      ) : null}
      <Button
        title={t("child.resetPwSubmit")}
        variant="ghost"
        pending={pending}
        onPress={() => void submit()}
      />
    </Card>
  );
}

export default function EditChildScreen() {
  const { t } = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const childrenQ = useQuery({ queryKey: ["children"], queryFn: fetchChildren });
  const child = (childrenQ.data ?? []).find((c) => c.profile_id === id) ?? null;

  // The saved rayon is not part of the children list read — fetch it directly
  // (RLS scopes the row to the linked parent) so the field preselects.
  const rayonQ = useQuery({
    queryKey: ["child-rayon", id],
    enabled: !!child,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from("students")
        .select("city_district_id")
        .eq("profile_id", id)
        .maybeSingle();
      if (error) throw error;
      const v = (data as { city_district_id?: string | null } | null)?.city_district_id;
      return typeof v === "string" ? v : "";
    },
  });

  if (childrenQ.isSuccess && !child) {
    // Unknown/foreign id — never render a form for someone else's child.
    return <Redirect href="/(parent)/(tabs)/home" />;
  }

  return (
    <Screen scroll>
      {childrenQ.isPending || (child && rayonQ.isPending) ? (
        <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
          <Skeleton height={20} width="70%" />
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : childrenQ.isError || rayonQ.isError ? (
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => {
            void childrenQ.refetch();
            void rayonQ.refetch();
          }}
        />
      ) : child ? (
        <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}>
          <EditForm
            key={child.profile_id}
            child={child}
            initialCityDistrictId={rayonQ.data ?? ""}
          />
          <Button
            title={t("childedit.back")}
            variant="ghost"
            style={{ marginTop: spacing.lg }}
            onPress={() => router.back()}
          />
        </View>
      ) : null}
    </Screen>
  );
}
