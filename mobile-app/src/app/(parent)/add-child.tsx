// Add-Child WIZARD (web AddChildWizard parity, redesigned: StepDots progress +
// one clean section per step + a summary card before submit). Since the demo
// payment mode was deleted (owner, 2026-08-18) the wizard is always TWO steps —
// the app has no purchase flow in any mode (docs/STORE_PAYMENTS_COMPLIANCE.md):
//   giveaway / free acc → Info → (bffAddChild + bffActivateFree) → Done
//   real / off          → Info → Done
// ONE Done screen in every posture, and it always shows the 8-digit login ID:
// migration 146 allocates it inside create_child_account, so there is no such
// thing as a created child without one. Only the headline differs (free access
// granted vs. account created + subject access not active yet).
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
import { CopyableId } from "@/components/CopyableId";
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
import {
  ChildAvatarPicker,
  applyChildAvatarChoice,
  type ChildAvatarChoice,
} from "@/features/parent/ChildAvatarPicker";
import { extractChildUniqueId, groupChildId, resolvePosture } from "@/features/parent/commerce";
import {
  useCities,
  useCityDistricts,
  useGrades,
  useInvalidateParentData,
  useParentFreeAccess,
  useSchools,
} from "@/features/parent/queries";
import { KeyRow, ScreenScroll } from "@/features/parent/ui";

type Phase = "info" | "done";

const STEPS = ["info", "done"] as const;

const STEP_KEYS: Record<string, string> = {
  info: "addchild.step.info",
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
  const grades = useGrades();
  const cities = useCities();
  const districts = useCityDistricts();
  const invalidate = useInvalidateParentData();

  const [info, setInfo] = useState<ChildInfo>(EMPTY_CHILD_INFO);
  const [avatar, setAvatar] = useState<ChildAvatarChoice>({ kind: "default" });
  const [errors, setErrors] = useState<ChildInfoErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("info");
  const [doneId, setDoneId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const schools = useSchools(info.cityId);
  const mode = config.data?.payment.mode ?? "off";
  const posture = resolvePosture(mode, freeAccess.data?.active === true);

  // Rayon requirement of the chosen city (drives validation + the summary).
  const cityRayons = rayonsOfCity(districts.data, info.cityId);
  const hasDistricts = cityRayons.length > 0;

  const activeIdx = phase === "info" ? 0 : 1;

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
        // The id comes back with the child now. Capturing it here (rather
        // than only in the free-access branch below) is what lets the
        // success screen be the same screen in every payment posture.
        setDoneId(extractChildUniqueId(res.data));
        // Avatar apply is BEST-EFFORT right after creation (the endpoint needs
        // the new student id): a failed preset/photo write must NEVER block
        // the wizard — the parent can retry from the Edit screen. "default"
        // needs no call (it IS the created state).
        if (avatar.kind !== "default") {
          try {
            await applyChildAvatarChoice(sid, avatar);
          } catch {
            // ignore — initials bubble stays until the parent retries in Edit
          }
        }
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

      // 'real' and 'off': the child exists AND can sign in. Nothing is
      // pending -- subject access is inactive, which the screen says.
      setPhase("done");
    } finally {
      setPending(false);
    }
  }

  function resetForAnother() {
    setInfo(EMPTY_CHILD_INFO);
    setAvatar({ kind: "default" });
    setErrors({});
    setServerError(null);
    setStudentProfileId(null);
    setDoneId(null);
    setPhase("info");
  }

  const configLoading = config.isPending || freeAccess.isPending;

  return (
    <ScreenScroll>
      {configLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={28} width="60%" />
          <Skeleton height={220} />
        </View>
      ) : (
        <>
          <StepProgress steps={[...STEPS]} activeIdx={activeIdx} />

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

              {/* Optional avatar choice — applied AFTER the child exists. */}
              <Card style={{ gap: spacing.xs }}>
                <ChildAvatarPicker
                  value={avatar}
                  onChange={setAvatar}
                  childName={`${info.firstName.trim()} ${info.lastName.trim()}`.trim()}
                  disabled={pending}
                  t={t}
                />
              </Card>

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
                title={t("addchild.createChild")}
                variant="gradient"
                pending={pending}
                pendingTitle={t("parent.child.submitting")}
                onPress={() => void submitInfo()}
              />
            </>
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
              {/* ONE SUCCESS SCREEN, NOT TWO.
                  This used to fork on posture.freeFlow, and the fork decided
                  whether the parent was told their child's login ID at all: the
                  other arm rendered the web string gate.paymentsOff ("new
                  subscriptions and packages cannot be opened right now") and
                  then mob.addchild.idPending, promising an ID "as soon as a
                  subject subscription is active" — which, with payments off, no
                  screen in this app could ever bring about.

                  The ID is allocated when the child is created (migration 146).
                  It is identity, not entitlement: the child can sign in, and
                  what they see inside is governed by their subject access, not
                  by this screen. So the ID is shown the same way every time and
                  only the headline differs. */}
              <AppText variant="title" style={{ textAlign: "center" }}>
                {!posture.freeFlow
                  ? t("parent.child.created")
                  : posture.mode === "giveaway"
                    ? t("addchild.giveawayGranted")
                    : t("addchild.freeAccessGranted")}
              </AppText>
              <AppText variant="muted" style={{ textAlign: "center" }}>
                {posture.freeFlow ? t("pay.idRevealed") : t("mob.addchild.idReady")}
              </AppText>
              {doneId ? (
                <View
                  style={{
                    maxWidth: "100%",
                    backgroundColor: tokens.chipBg,
                    borderRadius: radius.lg,
                    paddingVertical: spacing.lg,
                    paddingHorizontal: spacing.xl,
                  }}
                >
                  {/* The ID is a number: on 320pt / large font scale it
                      scales to fit, never wraps or truncates. */}
                  <CopyableId
                    id={doneId}
                    display={groupChildId(doneId)}
                    fontSize={32}
                    label={t("parent.child.idCopy")}
                    copiedLabel={t("parent.child.idCopied")}
                    a11yLabel={t("parent.child.idCopyA11y")}
                  />
                </View>
              ) : null}
              <AppText variant="muted" style={{ textAlign: "center" }}>
                {t("parent.child.idNote")}
              </AppText>
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
