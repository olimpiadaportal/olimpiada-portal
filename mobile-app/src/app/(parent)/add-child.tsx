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
import React, { useEffect, useMemo, useState } from "react";
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
import { goToTab } from "@/lib/navigation";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { bffActivateFree, bffAddChild } from "@/lib/api";
import {
  ChildInfoForm,
  EMPTY_CHILD_INFO,
  buildAddChildFields,
  hasGenderChoice,
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
import {
  clearPrefilledFields,
  decidePrefill,
  isPristineChildInfo,
  pickPrefillSource,
  type SourceLocation,
} from "@/features/parent/childPrefill";
import { extractChildUniqueId, groupChildId, resolvePosture } from "@/features/parent/commerce";
import {
  useAccountId,
  useChildRayon,
  useChildren,
  useCities,
  useCityDistricts,
  useGrades,
  useInvalidateParentData,
  useParentFreeAccess,
  useSchools,
} from "@/features/parent/queries";
import { KeyRow, ScreenScroll, childDisplayName } from "@/features/parent/ui";

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
  const [entryChoice, setEntryChoice] = useState<"choose" | "create">("choose");

  const schools = useSchools(info.cityId);
  const mode = config.data?.payment.mode ?? "off";
  const posture = resolvePosture(mode, freeAccess.data?.active === true);

  // ---- SECOND CHILD: SEED THE SHARED HOUSEHOLD FIELDS ----------------------
  // The rule itself is pure and lives in features/parent/childPrefill.ts (which
  // field is shared, which child is the source, and when it is too late to
  // seed); this is only the wiring. Nothing here runs for a parent's FIRST
  // child: pickPrefillSource returns null and the decision is "skip", so that
  // screen behaves exactly as it did before this feature existed.
  const accountId = useAccountId();
  const childrenQ = useChildren();
  const prefillSource = pickPrefillSource(childrenQ.data, accountId);
  const rayonQ = useChildRayon(prefillSource?.profile_id ?? null);
  const sourceSchools = useSchools(prefillSource?.district_id ?? "");
  // `decided` is FINAL and is what makes a cleared field STAY cleared: after
  // the parent empties the prefilled fields the form is pristine again, and
  // only this flag stops the seed from helpfully refilling it. `from` is the
  // source child's name while the notice is on screen.
  const [prefill, setPrefill] = useState<{ decided: boolean; from: string | null }>({
    decided: false,
    from: null,
  });

  // WHAT THE CATALOGUE SAYS ABOUT THE SOURCE CHILD'S LOCATION *TODAY* — the
  // rule that consumes it is pure and lives in childPrefill.ts. Nothing here
  // judges the source: it reports what the same catalogues this form renders
  // from currently hold, and the school row is passed WHOLE (including a NULL
  // `city_district_id`, which is a real and selectable kind of school) instead
  // of being reduced to a valid/invalid flag. Collapsing it to a boolean is
  // what used to cost the parent the city and the school as well as the rayon.
  const sourceCityId = prefillSource?.district_id ?? "";
  const sourceLocation: SourceLocation = useMemo(() => {
    const rayons = rayonsOfCity(districts.data, sourceCityId);
    const school =
      (sourceSchools.data ?? []).find((s) => s.id === prefillSource?.school_id) ?? null;
    return {
      cityActive: !!sourceCityId && (cities.data ?? []).some((c) => c.id === sourceCityId),
      cityHasRayons: rayons.length > 0,
      rayonIds: rayons.map((r) => r.id),
      school: school ? { id: school.id, rayonId: school.city_district_id ?? "" } : null,
    };
  }, [cities.data, districts.data, sourceSchools.data, sourceCityId, prefillSource?.school_id]);

  useEffect(() => {
    if (prefill.decided) return;
    const decision = decidePrefill({
      childrenReady: childrenQ.isSuccess && !childrenQ.isFetching,
      source: prefillSource,
      // `useSchools("")` is DISABLED and never succeeds, so a sibling with no
      // city on file would leave this false forever and the decision would
      // wait for a read that is not running. Ask for that query only when it
      // was actually started.
      catalogReady:
        cities.isSuccess && districts.isSuccess && (!sourceCityId || sourceSchools.isSuccess),
      rayon: {
        status: rayonQ.isPending ? "pending" : rayonQ.isError ? "error" : "ready",
        id: rayonQ.data ?? "",
      },
      location: sourceLocation,
      // The reads land after the first render, so the parent can already be
      // typing. Their input wins — and the seed is settled for good rather
      // than left armed, so nothing appears under their fingers later.
      pristine: isPristineChildInfo(info),
    });
    if (decision.kind === "wait") return;
    if (decision.kind === "skip") {
      setPrefill({ decided: true, from: null });
      return;
    }
    // All four fields in ONE update: the cascade effect inside ChildInfoForm
    // drops a school that does not belong to the current city + rayon, so a
    // school seeded without its city would be wiped the moment the school list
    // for that city arrives. Seeding them together also hands the prefilled
    // pair to that same check, which is what keeps a stale school (archived, or
    // narrowed away by the rayon) from surviving into the payload.
    setInfo((prev) => ({ ...prev, ...decision.patch }));
    setPrefill({ decided: true, from: childDisplayName(decision.from) });
  }, [
    prefill.decided,
    childrenQ.isSuccess,
    childrenQ.isFetching,
    prefillSource,
    cities.isSuccess,
    districts.isSuccess,
    rayonQ.isPending,
    rayonQ.isError,
    rayonQ.data,
    sourceCityId,
    sourceLocation,
    sourceSchools.isSuccess,
    info,
  ]);

  // Every select on this screen reads an ADMIN-MANAGED catalog cached for ten
  // minutes, and the screen had no refresh affordance of any kind: when an
  // admin added a school, the parent had no gesture that could reach it — the
  // only way out was to kill the app. The hook also brings silent
  // refresh-on-focus, which is what actually covers "the admin just added it".
  // Schools are fetched per city and disabled until one is chosen.
  const { refreshing, onRefresh } = usePullRefresh([
    config,
    freeAccess,
    grades,
    cities,
    districts,
    info.cityId ? schools : null,
    // The prefill's two reads. They matter on a pull for the same reason the
    // catalogs do: a parent who just corrected a sibling's school in
    // Edit-Child, then came here, is holding the only gesture that can bring
    // the corrected value into the suggestion.
    childrenQ,
    prefillSource ? rayonQ : null,
    prefillSource ? sourceSchools : null,
  ]);

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
    // ONE refusal, two readers. The first clause is the parent's: the form has
    // an unanswered required field and `v` says which. The second is the
    // COMPILER's — it narrows `info` to the shape buildAddChildFields accepts,
    // which is how the gender key below stopped being a conditional spread that
    // could silently drop itself. They refuse exactly the same forms.
    if (Object.keys(v).length > 0 || !hasGenderChoice(info)) return;

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

  async function resetForAnother() {
    await invalidate();
    setInfo(EMPTY_CHILD_INFO);
    setAvatar({ kind: "default" });
    setErrors({});
    setServerError(null);
    setStudentProfileId(null);
    setDoneId(null);
    setPhase("info");
    // Re-arm the prefill. "Add another child" is precisely the case Item 7
    // exists for, and the child just created — already in the refreshed list —
    // is the newest household state, so it becomes the next source.
    setPrefill({ decided: false, from: null });
  }

  const configLoading = config.isPending || freeAccess.isPending;

  if (entryChoice === "choose") {
    return (
      <ScreenScroll>
        <AppText variant="title">{t("link.choice.title")}</AppText>
        <Card style={{ gap: spacing.md }}>
          <AppText variant="heading">{t("link.choice.create")}</AppText>
          <AppText variant="muted">{t("link.choice.createBody")}</AppText>
          <Button title={t("link.choice.create")} onPress={() => setEntryChoice("create")} />
        </Card>
        <Card style={{ gap: spacing.md }}>
          <AppText variant="heading">{t("link.choice.existing")}</AppText>
          <AppText variant="muted">{t("link.choice.existingBody")}</AppText>
          <Button title={t("link.choice.existing")} variant="ghost" onPress={() => router.push("/(parent)/link-child" as never)} />
        </Card>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={onRefresh}>
      {configLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={28} width="60%" />
          <Skeleton height={220} />
        </View>
      ) : (
        <>
          <StepProgress steps={[...STEPS]} activeIdx={activeIdx} />

          {/* NO "SAVED LESS THAN IT WAS ASKED" NOTICE ANY MORE, and the reason
              is the migration rather than a change of mind about telling the
              parent. The only warning this screen could ever receive was a
              gender that the core wrote AFTER the provisioning transaction and
              failed to store; migration 178 gives create_child_account a
              p_gender argument, so the answer is committed with the child or
              the child is not created at all. There is no partial save left to
              report. If a future field is ever written outside that
              transaction, the notice comes back OUTSIDE every phase branch —
              a warning can be pending on "info" too, because the free flow can
              create the child and then fail its grant. */}

          {phase === "info" ? (
            <>
              <AppText variant="muted">{t("parent.child.intro")}</AppText>

              {/* A FORM THAT ARRIVES FULL HAS TO SAY SO.
                  Silence here is the failure mode: a parent who does not notice
                  the seeded city, rayon and school submits a second child into
                  the first one's school without ever deciding to. So the notice
                  names the child the values came from — which is also how the
                  "most recently created sibling wins" rule becomes visible when
                  two children disagree — and says the values can be changed.

                  ONE CLEAR CONTROL, NOT FOUR. Every prefilled field is
                  required, so a per-field clear could only produce an invalid
                  form; and the city, rayon and school are SelectFields whose
                  sheets carry no "clear" row on purpose. Without this button
                  the "delete a prefilled value" half of the requirement would
                  not exist for three of the four fields. It empties exactly the
                  seeded fields — a first name, grade, gender or password the
                  parent has already entered survives — and retires the notice,
                  which is also what stops the seed running again. */}
              {prefill.from ? (
                <Card
                  variant="flat"
                  style={{ gap: spacing.sm, borderColor: tokens.accent }}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  <AppText variant="eyebrow">{t("mob.addchild.prefill.title")}</AppText>
                  <AppText variant="muted">
                    {t("mob.addchild.prefill.body").replace("{name}", prefill.from)}
                  </AppText>
                  {/* Stretched, not content-width: the az and ru labels are
                      long enough to overflow a 320pt card otherwise. */}
                  <Button
                    title={t("mob.addchild.prefill.clear")}
                    variant="ghost"
                    disabled={pending}
                    style={{ alignSelf: "stretch" }}
                    onPress={() => {
                      setInfo(clearPrefilledFields);
                      setPrefill({ decided: true, from: null });
                      setServerError(null);
                    }}
                  />
                </Card>
              ) : null}

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
              {/* goToTab(), not replace(): replacing this screen with the
                  tab route mounts a SECOND tab navigator over the one already
                  under this wizard, and the next back press then lands on Home
                  through it instead of popping (lib/navigation.ts). */}
              <Button
                title={t("parent.dash.title")}
                style={{ alignSelf: "stretch" }}
                onPress={() => goToTab(router, "/(parent)/(tabs)/home")}
              />
              <Button
                title={t("parent.child.another")}
                variant="ghost"
                style={{ alignSelf: "stretch" }}
                onPress={() => void resetForAnother()}
              />
            </Card>
          ) : null}
        </>
      )}
    </ScreenScroll>
  );
}
