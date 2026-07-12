// Parent edits a child's info (web ChildInfoEditForm parity): first/last name,
// city → school cascade + grade (ALL selects submit database UUIDs), read-only
// 8-digit login ID, and an optional child-password reset. Round-18 lessons are
// baked in: fully controlled state that NEVER clears on save, the cascade keeps
// a still-valid school and clears a foreign one, per-field required errors, and
// a pending double-submit guard. Writes go through the ownership-checked BFF.
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PasswordField, TextField } from "@/components/TextField";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { spacing } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { fetchChildren, fetchCities, fetchGrades, fetchSchools, type ChildRow } from "@/lib/data";
import { bffEditChild, bffResetChildPassword } from "@/lib/api";
import { SelectField, type SelectOption } from "@/features/profile/SelectField";

type FieldErrors = Partial<Record<"first" | "last" | "city" | "school" | "grade", string>>;

function EditForm({ child }: { child: ChildRow }) {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(child.first_name ?? "");
  const [lastName, setLastName] = useState(child.last_name ?? "");
  const [districtId, setDistrictId] = useState(child.district_id ?? "");
  const [schoolId, setSchoolId] = useState(child.school_id ?? "");
  const [gradeId, setGradeId] = useState(child.grade_id ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const citiesQ = useQuery({ queryKey: ["cities"], queryFn: fetchCities });
  const gradesQ = useQuery({ queryKey: ["grades"], queryFn: fetchGrades });
  const schoolsQ = useQuery({
    queryKey: ["schools", districtId],
    enabled: !!districtId,
    queryFn: () => fetchSchools(districtId),
  });

  const citySchools = useMemo(
    () => (schoolsQ.data ?? []) as { id: string; name: string; is_private: boolean | null }[],
    [schoolsQ.data],
  );

  // Cascade rule (web handleCityChange parity): a school belongs to exactly
  // one city, so changing to a DIFFERENT city always clears the selection —
  // a stale/foreign school UUID can never be posted. Re-selecting the same
  // city keeps the still-valid school. Submit re-checks membership below.
  function handleCityChange(nextCityId: string) {
    if (nextCityId !== districtId) setSchoolId("");
    setDistrictId(nextCityId);
  }

  const cityOptions: SelectOption[] = (citiesQ.data ?? []).map((c: any) => ({
    id: String(c.id),
    label: String(c.name),
  }));
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
  const gradeOptions: SelectOption[] = (gradesQ.data ?? []).map((g: any) => ({
    id: String(g.id),
    label: formatGradeLabel(g.level, locale, g.name),
  }));

  async function submit() {
    if (pending) return; // double-submit guard
    setSaved(false);
    setError(null);

    const errs: FieldErrors = {};
    if (!firstName.trim()) errs.first = t("auth.child.err.firstNameRequired");
    if (!lastName.trim()) errs.last = t("auth.child.err.lastNameRequired");
    if (!districtId) errs.city = t("addchild.err.cityRequired");
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
      school_id: schoolId,
      // Display-name fallbacks derived from the selections (web parity).
      city: cityOptions.find((c) => c.id === districtId)?.label ?? "",
      school_name: citySchools.find((s) => s.id === schoolId)?.name ?? "",
      class_grade: (gradesQ.data ?? []).find((g: any) => String(g.id) === gradeId)?.name ?? "",
    });
    setPending(false);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    setSaved(true);
    void queryClient.invalidateQueries({ queryKey: ["children"] });
  }

  return (
    <View style={{ gap: spacing.lg }}>
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

  if (childrenQ.isSuccess && !child) {
    // Unknown/foreign id — never render a form for someone else's child.
    return <Redirect href="/(parent)/(tabs)/home" />;
  }

  return (
    <Screen scroll>
      {childrenQ.isPending ? (
        <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
          <Skeleton height={20} width="70%" />
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : childrenQ.isError ? (
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => void childrenQ.refetch()}
        />
      ) : child ? (
        <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}>
          <EditForm key={child.profile_id} child={child} />
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
