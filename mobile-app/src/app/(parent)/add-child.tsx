// Add-Child WIZARD (web AddChildWizard parity, commerce-posture aware):
//   demo                → Info → Subjects → Plan → DemoPay sheet → Done (ID reveal)
//   giveaway / free acc → Info → (bffAddChild + bffActivateFree) → Done (instant ID)
//   real                → Info → Done: child created, ID pending, plans are
//                         completed on the family's WEB account (read-only money)
//   off                 → Info → Done: child created, ID pending, gate.paymentsOff
// The child is created ONCE (bffAddChild) and kept across retries — a failed
// free activation or an abandoned plan never duplicates the child. Every money
// step is re-validated by the BFF; this flow is presentation only.
import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { bffActivateFree, bffAddChild } from "@/lib/api";
import {
  ChildInfoForm,
  EMPTY_CHILD_INFO,
  buildAddChildFields,
  validateChildInfo,
  type ChildInfo,
  type ChildInfoErrors,
} from "@/features/parent/ChildInfoForm";
import { SubscribeFlow, type SubscribeStep } from "@/features/parent/SubscribeFlow";
import { extractChildUniqueId, groupChildId, resolvePosture } from "@/features/parent/commerce";
import {
  useCities,
  useGrades,
  useInvalidateParentData,
  useParentFreeAccess,
  useSchools,
  useSubjectOptions,
} from "@/features/parent/queries";
import { ScreenScroll } from "@/features/parent/ui";

type Phase = "info" | "flow" | "done";

const STEP_KEYS: Record<string, string> = {
  info: "addchild.step.info",
  subjects: "addchild.step.subjects",
  plan: "addchild.step.plan",
  payment: "addchild.step.payment",
  done: "addchild.step.done",
};

function StepIndicator({ steps, activeIdx }: { steps: string[]; activeIdx: number }) {
  const { tokens } = useTheme();
  const { t } = useT();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {steps.map((id, i) => {
        const active = i === activeIdx;
        const done = i < activeIdx;
        return (
          <View
            key={id}
            style={{
              backgroundColor: active ? tokens.accent : tokens.chipBg,
              borderRadius: radius.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
            }}
          >
            <AppText
              variant="label"
              color={active ? "#ffffff" : done ? tokens.accent : tokens.muted}
              style={{ fontSize: 12 }}
            >
              {t(STEP_KEYS[id])}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

export default function AddChildScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const config = useMobileConfig();
  const freeAccess = useParentFreeAccess();
  const subjects = useSubjectOptions();
  const grades = useGrades();
  const cities = useCities();
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

  async function submitInfo() {
    if (pending) return; // double-submit guard
    setServerError(null);
    const v = validateChildInfo(info);
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
            schools: (schools.data ?? []) as {
              id: string;
              name: string;
              is_private: boolean | null;
            }[],
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
          <StepIndicator steps={steps} activeIdx={activeIdx} />

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
              {serverError ? (
                <AppText variant="muted" color={tokens.danger}>
                  {serverError}
                </AppText>
              ) : null}
              <Button
                title={steps.length === 2 ? t("addchild.createChild") : t("addchild.next")}
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
            <Card style={{ gap: spacing.md, alignItems: "center" }}>
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
