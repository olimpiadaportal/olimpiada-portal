// Add-Child WIZARD (web AddChildWizard parity, commerce-posture aware,
// redesigned: StepDots progress + one clean section per step + a summary card
// before submit):
//   demo                → Info → Subjects → Plan → DemoPay sheet → Done (ID reveal)
//   giveaway / free acc → Info → (bffAddChild + bffActivateFree) → Done (instant ID)
//   real                → Info → Done: child created, ID pending, plans are
//                         completed on the family's WEB account (read-only money)
//   off                 → Info → Done: child created, ID pending, gate.paymentsOff
// Round 21: the District (rayon) field lives between City and School — shown
// only when the city has active rayons, required then, narrows the school
// list; city_district_id goes to the BFF (which re-validates and maps a miss
// to addchild.err.districtRequired). The child is created ONCE (bffAddChild)
// and kept across retries — a failed free activation or an abandoned plan
// never duplicates the child. Every money step is re-validated by the BFF;
// this flow is presentation only.
import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { PartyPopper } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { StepDots } from "@/components/StepDots";
import { Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { bffActivateFree, bffAddChild } from "@/lib/api";
import {
  ChildInfoForm,
  EMPTY_CHILD_INFO,
  buildAddChildFields,
  rayonsOfCity,
  validateChildInfo,
  type ChildInfo,
  type ChildInfoErrors,
} from "@/features/parent/ChildInfoForm";
import { SubscribeFlow, type SubscribeStep } from "@/features/parent/SubscribeFlow";
import { extractChildUniqueId, groupChildId, resolvePosture } from "@/features/parent/commerce";
import {
  useCities,
  useCityDistricts,
  useGrades,
  useInvalidateParentData,
  useParentFreeAccess,
  useSchools,
  useSubjectOptions,
} from "@/features/parent/queries";
import { KeyRow, ScreenScroll } from "@/features/parent/ui";

type Phase = "info" | "flow" | "done";

const STEP_KEYS: Record<string, string> = {
  info: "addchild.step.info",
  subjects: "addchild.step.subjects",
  plan: "addchild.step.plan",
  payment: "addchild.step.payment",
  done: "addchild.step.done",
};

/** StepDots + "2/5 · Fənlər" eyebrow — the wizard's progress header. */
function StepProgress({ steps, activeIdx }: { steps: string[]; activeIdx: number }) {
  const { t } = useT();
  return (
    <View style={{ gap: spacing.sm }}>
      <StepDots count={steps.length} index={activeIdx} />
      <AppText variant="eyebrow">
        {activeIdx + 1}/{steps.length} · {t(STEP_KEYS[steps[activeIdx]] ?? "addchild.step.info")}
      </AppText>
    </View>
  );
}

export default function AddChildScreen() {
  const { tokens } = useTheme();
  const { t, locale } = useT();
  const router = useRouter();
  const config = useMobileConfig();
  const freeAccess = useParentFreeAccess();
  const subjects = useSubjectOptions();
  const grades = useGrades();
  const cities = useCities();
  const districts = useCityDistricts();
  const invalidate = useInvalidateParentData();

  const [info, setInfo] = useState<ChildInfo>(EMPTY_CHILD_INFO);
  const [errors, setErrors] = useState<ChildInfoErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("info");
  const [flowStep, setFlowStep] = useState<SubscribeStep>("subjects");
  const [doneId, setDoneId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const schools = useSchools(info.cityId);
  const mode = config.data?.payment.mode ?? "off";
  const posture = resolvePosture(mode, freeAccess.data?.active === true);

  // Rayon requirement of the chosen city (drives validation + the summary).
  const cityRayons = rayonsOfCity(districts.data, info.cityId);
  const hasDistricts = cityRayons.length > 0;

  // Ordered indicator steps for the resolved posture.
  const steps = posture.demoPay
    ? ["info", "subjects", "plan", "payment", "done"]
    : ["info", "done"];
  const activeIdx =
    phase === "info"
      ? 0
      : phase === "done"
        ? steps.length - 1
        : flowStep === "subjects"
          ? 1
          : 2;

  // ---- summary card inputs (resolved display names) ------------------------
  const cityName = ((cities.data ?? []) as { id: string; name: string }[]).find(
    (c) => c.id === info.cityId,
  )?.name;
  const rayonName = cityRayons.find((d) => d.id === info.cityDistrictId)?.name;
  const schoolName = ((schools.data ?? []) as { id: string; name: string }[]).find(
    (s) => s.id === info.schoolId,
  )?.name;
  const gradeRow = ((grades.data ?? []) as { id: string; level: number; name: string }[]).find(
    (g) => g.id === info.gradeId,
  );
  const summaryReady =
    info.firstName.trim().length > 0 &&
    info.lastName.trim().length > 0 &&
    !!cityName &&
    (!hasDistricts || !!rayonName) &&
    !!schoolName &&
    !!gradeRow;

  async function submitInfo() {
    if (pending) return; // double-submit guard
    setServerError(null);
    const v = validateChildInfo(info, hasDistricts);
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setPending(true);
    try {
      // Create the child once; retries (e.g. a failed free activation) reuse it.
      let sid = studentProfileId;
      if (!sid) {
        const res = await bffAddChild(
          buildAddChildFields(info, {
            grades: (grades.data ?? []) as { id: string; level: number; name: string }[],
            cities: (cities.data ?? []) as { id: string; name: string }[],
            schools: (schools.data ?? []) as { id: string; name: string }[],
          }),
        );
        if (!res.ok) {
          setServerError(t(res.error));
          return;
        }
        sid = res.data?.student_profile_id ?? null;
        if (!sid) {
          setServerError(t("auth.child.err.createFailed"));
          return;
        }
        setStudentProfileId(sid);
        invalidate();
      }

      if (posture.freeFlow) {
        // Giveaway / free-access window: grant + allocate the ID immediately.
        const grant = await bffActivateFree(sid);
        if (!grant.ok) {
          setServerError(t(grant.error));
          return; // the child exists — pressing again retries activation only.
        }
        setDoneId(extractChildUniqueId(grant.data));
        invalidate();
        setPhase("done");
        return;
      }

      if (posture.demoPay) {
        setPhase("flow"); // Subjects → Plan → DemoPay
        return;
      }

      // 'real' (web-only money) and 'off': the child exists with a pending ID.
      setPhase("done");
    } finally {
      setPending(false);
    }
  }

  function resetForAnother() {
    setInfo(EMPTY_CHILD_INFO);
    setErrors({});
    setServerError(null);
    setStudentProfileId(null);
    setDoneId(null);
    setFlowStep("subjects");
    setPhase("info");
  }

  const configLoading = config.isPending || freeAccess.isPending;

  return (
    <ScreenScroll keyboard>
      {configLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={28} width="60%" />
          <Skeleton height={220} />
        </View>
      ) : (
        <>
          <StepProgress steps={steps} activeIdx={activeIdx} />

          {phase === "info" ? (
            <>
              <AppText variant="muted">{t("parent.child.intro")}</AppText>
              <ChildInfoForm
                value={info}
                onChange={(patch) => {
                  setInfo((p) => ({ ...p, ...patch }));
                  setServerError(null);
                }}
                errors={errors}
                disabled={pending}
              />

              {/* Summary card — appears once every selection resolves. */}
              {summaryReady ? (
                <Card style={{ gap: spacing.xs }}>
                  <AppText variant="eyebrow">{t("addchild.summary")}</AppText>
                  <KeyRow
                    label={t("parent.child.first")}
                    value={`${info.firstName.trim()} ${info.lastName.trim()}`.trim()}
                  />
                  <KeyRow label={t("addchild.field.city")} value={cityName ?? "—"} />
                  {hasDistricts ? (
                    <KeyRow label={t("addchild.field.district")} value={rayonName ?? "—"} />
                  ) : null}
                  <KeyRow label={t("addchild.field.school")} value={schoolName ?? "—"} />
                  <KeyRow
                    label={t("addchild.field.grade")}
                    value={gradeRow ? formatGradeLabel(gradeRow.level, locale, gradeRow.name) : "—"}
                  />
                </Card>
              ) : null}

              {serverError ? (
                <AppText variant="muted" color={tokens.danger}>
                  {serverError}
                </AppText>
              ) : null}
              <Button
                title={steps.length === 2 ? t("addchild.createChild") : t("addchild.next")}
                variant="gradient"
                pending={pending}
                pendingTitle={t("parent.child.submitting")}
                onPress={() => void submitInfo()}
              />
            </>
          ) : null}

          {phase === "flow" && studentProfileId ? (
            <SubscribeFlow
              studentId={studentProfileId}
              subjects={subjects.data ?? []}
              onStepChange={setFlowStep}
              onDone={(id) => {
                setDoneId(id);
                invalidate();
                setPhase("done");
              }}
            />
          ) : null}

          {phase === "done" ? (
            <Card variant="hero" style={{ gap: spacing.md, alignItems: "center" }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: radius.md,
                  backgroundColor: tokens.pillBg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <PartyPopper size={28} color={tokens.accent} strokeWidth={2} />
              </View>
              {posture.paymentsOff ? (
                <>
                  <AppText variant="title" style={{ textAlign: "center" }}>
                    {t("parent.child.created")}
                  </AppText>
                  <AppText variant="muted" style={{ textAlign: "center" }}>
                    {t("gate.paymentsOff")}
                  </AppText>
                </>
              ) : posture.webOnly ? (
                <>
                  <AppText variant="title" style={{ textAlign: "center" }}>
                    {t("parent.child.created")}
                  </AppText>
                  <AppText variant="muted" style={{ textAlign: "center" }}>
                    {t("mob.addchild.webPlan")}
                  </AppText>
                </>
              ) : (
                <>
                  <AppText variant="title" style={{ textAlign: "center" }}>
                    {posture.mode === "giveaway"
                      ? t("addchild.giveawayGranted")
                      : posture.freeFlow
                        ? t("addchild.freeAccessGranted")
                        : t("pay.success")}
                  </AppText>
                  <AppText variant="muted" style={{ textAlign: "center" }}>
                    {t("pay.idRevealed")}
                  </AppText>
                  {doneId ? (
                    <View
                      style={{
                        backgroundColor: tokens.chipBg,
                        borderRadius: radius.lg,
                        paddingVertical: spacing.lg,
                        paddingHorizontal: spacing.xl,
                      }}
                    >
                      <AppText
                        variant="mono"
                        color={tokens.accent}
                        style={{ fontSize: 32, fontWeight: "800", letterSpacing: 2 }}
                      >
                        {groupChildId(doneId)}
                      </AppText>
                    </View>
                  ) : null}
                  <AppText variant="muted" style={{ textAlign: "center" }}>
                    {t("parent.child.idNote")}
                  </AppText>
                </>
              )}
              <Button
                title={t("parent.dash.title")}
                style={{ alignSelf: "stretch" }}
                onPress={() => router.replace("/(parent)/(tabs)/home")}
              />
              <Button
                title={t("parent.child.another")}
                variant="ghost"
                style={{ alignSelf: "stretch" }}
                onPress={resetForAnother}
              />
            </Card>
          ) : null}
        </>
      )}
    </ScreenScroll>
  );
}
