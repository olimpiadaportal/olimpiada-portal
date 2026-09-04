// SUBSCRIPTION tab: child selector chips → per-child live-subscription card
// (brand gradient-border when a plan is live) + manage-subjects editor +
// cancel flow.
//
// PURCHASE-SILENT (docs/STORE_PAYMENTS_COMPLIANCE.md, owner 2026-08-18 — the
// demo payment mode is deleted). Two things went with it:
//   - the FABRICATED Billing section (next charge 29/01/2026, "≈ 18 AZN",
//     "MasterCard — 8475", expiry 11/2028) and the empty Invoices section. A
//     "demo data" disclaimer does not cure a displayed false price
//     (Guideline 2.3.1), and there is nothing truthful to put there yet, so
//     the section — and the three-way switcher around it — is gone.
//   - every amount. The card shows STATUS, the subjects and when access runs
//     to; the web account keeps the money.
// Posture decides only whether the free-activation path is offered. It does
// NOT decide what this tab says about payments: a live subscription is always
// shown, and a family without one always reads the same sentence
// (mob.pay.notInApp). See __tests__/no-payment-state.test.ts.
//
// iOS ADDS THE APPLE RAIL (src/features/iap) AND TAKES NOTHING AWAY. Apple
// rejected the 2026-08-31 submission under Guideline 3.1.1; on that storefront
// the answer is in-app purchase, not silence. The panel and the Restore control
// sit behind IAP_PLATFORM_SUPPORTED — a BUILD-TIME constant, never a server
// flag — so an Android build renders precisely what it rendered yesterday.
// The mob.pay.notInApp sentence is still here and is still what Android says.
import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  RefreshCw,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CmsProse } from "@/components/CmsProse";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  fmtDate,
  isCancellable,
  resolvePosture,
  subStatusKey,
} from "@/features/parent/commerce";
import { CancelSheet } from "@/features/parent/CancelSheet";
import {
  IAP_PLATFORM_SUPPORTED,
  IapPanel,
  RestoreAccessButton,
  useIapOffers,
  type IapSurfaceState,
} from "@/features/iap";
import { ManageSubjectsEditor } from "@/features/parent/ManageSubjectsEditor";
import {
  QK,
  fetchEntitledSubjects,
  useChildSubscriptions,
  useChildren,
  useInvalidateParentData,
  useParentFreeAccess,
  useSubjectOptions,
} from "@/features/parent/queries";
import {
  ChildChips,
  GradientBorderCard,
  KeyRow,
  Pill,
  ScreenScroll,
  childDisplayName,
} from "@/features/parent/ui";

export default function ParentSubscription() {
  const { tokens } = useTheme();
  const { t, locale } = useT();
  const router = useRouter();

  const config = useMobileConfig();
  const freeAccess = useParentFreeAccess();
  const children = useChildren();
  const subs = useChildSubscriptions();
  const subjects = useSubjectOptions();
  const invalidate = useInvalidateParentData();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Captured when the sheet opens so it survives the post-cancel refetch.
  const [cancelTarget, setCancelTarget] = useState<{
    subId: string;
    studentId: string;
    name: string;
  } | null>(null);

  const posture = resolvePosture(
    config.data?.payment.mode ?? "off",
    freeAccess.data?.active === true,
  );

  const list = children.data ?? [];
  const selected = list.find((c) => c.profile_id === selectedId) ?? list[0] ?? null;
  const liveSub = selected
    ? (subs.data ?? []).find(
        (s) => s.student_profile_id === selected.profile_id && isCancellable(s.status),
      ) ?? null
    : null;

  // WHAT THIS CHILD ALREADY OWNS — the half `liveSub` cannot see. An Apple
  // purchase writes ONE row, an entitlement, and no `child_subscriptions` row,
  // so the subject a parent bought a minute ago kept its price button here, and
  // tapping it again met the server's double-billing refusal — rendered in the
  // DANGER colour directly under a payment that had worked.
  //
  // The reader (and the reasoning behind child_entitled_subjects, the kept
  // code/name and the fail-OPEN empty list) lives in features/parent/queries —
  // the parent Home cards read the same rows to decide their access pill, and
  // one contract is why the three surfaces cannot disagree about a purchase.
  const entitled = useQuery({
    // Keyed UNDER the subscriptions key on purpose. react-query invalidates by
    // prefix, so useInvalidateParentData() — what IapPanel calls the moment a
    // purchase settles, and what the cancel sheet and the subjects editor call
    // too — already refetches this, and the bought subject leaves the offer
    // list without an app restart. Home shares the key, so it inherits both.
    queryKey: QK.entitled(selected?.profile_id ?? "-"),
    queryFn: () => fetchEntitledSubjects(selected?.profile_id ?? ""),
    // Only the iOS offer filter reads it: an Android build must issue no
    // request it did not issue yesterday. That is also why it stays out of
    // `loading` below — a disabled query is pending forever, and the skeleton
    // would never end on Android.
    enabled: IAP_PLATFORM_SUPPORTED && selected !== null,
  });

  // WHAT THE CARD SHOWS. Subjects the live plan already lists are dropped from
  // the "already active" line: the same subject named twice, under two
  // headings, reads as two payments.
  const entitledSubjects = entitled.data ?? [];
  const planSubjectIds = new Set((liveSub?.subjects ?? []).map((s) => s.subject_id));
  const entitledExtra = entitledSubjects.filter((s) => !planSubjectIds.has(s.id));

  const loading =
    config.isPending || children.isPending || subs.isPending || freeAccess.isPending;
  // `entitled` is refreshed on iOS ONLY — refetch() ignores `enabled`, so an
  // unguarded entry would fire the RPC from an Android pull.
  const { refreshing, onRefresh } = usePullRefresh([
    children,
    subs,
    IAP_PLATFORM_SUPPORTED && entitled,
    freeAccess,
    config,
  ]);

  // iOS purchase surface for the SELECTED child. Called unconditionally and
  // before the early returns below — it owns react-query hooks, and a hook that
  // vanishes on the loading branch is a crash on the next render. Off iOS it
  // fetches nothing and answers state "off".
  const iap = useIapOffers(
    [
      ...(liveSub ? liveSub.subjects.map((s) => s.subject_id) : []),
      // Entitlements merged in: an in-app purchase writes no subscription row, so
      // the line above on its own keeps offering what the family just bought.
      ...entitledSubjects.map((s) => s.id),
    ],
    // SCOPED TO THE SELECTED CHILD'S GRADE (migration 155), the same rule the
    // web subscribe page applies and the same one the child's own screens apply
    // last. Fizika is taught in grades 7-11 only: without this a parent could
    // buy it for a grade-3 child, and the arena — which runs the identical rule
    // — would then drop the entitlement it produced and render nothing at all.
    // A paid purchase that changes nothing on screen is the Guideline 3.1.1
    // reading this rail exists to remove.
    selected?.grade_id ?? null,
  );
  // THE OFFERS WAIT FOR THE ENTITLEMENT READ — on iOS only. The two reads
  // race: the StoreKit catalogue is cached for ten minutes while `entitled`
  // refetches after every purchase, so the offer list could paint first and
  // briefly show a price button for a subject this child already owns. One tap
  // on it opens the store sheet for a purchase the server then refuses, and the
  // refusal renders in the DANGER colour directly under a payment that worked.
  //
  // Folded into the PANEL's state, never into `loading` above: "loading" is a
  // state the panel already renders honestly (mob.iap.loading), while the
  // screen's skeleton must not hang on a query that is DISABLED — and so
  // pending forever — on Android. Off iOS the constant is false at build time
  // and this is just `iap.state`, which is "off".
  //
  // `isPending` COVERS THE COLD LOAD ONLY. After a purchase, `entitled`
  // refetches while already holding data, so it stays `success` and this guard
  // is false for the whole of that window — the post-purchase half is handled
  // inside IapPanel, which drops the subject it just sold from its own offer
  // list and lets this read confirm it afterwards.
  const iapState: IapSurfaceState =
    IAP_PLATFORM_SUPPORTED && entitled.isPending ? "loading" : iap.state;
  const iapVisible = IAP_PLATFORM_SUPPORTED && iapState !== "off" && iapState !== "none";

  const intervalName = (iv: string | null) =>
    iv === "week" ? t("pricing.weekly") : iv === "year" ? t("pricing.yearly") : t("pricing.monthly");

  if (loading) {
    return (
      <ScreenScroll>
        <Skeleton height={36} width="70%" />
        <Skeleton height={160} />
        <Skeleton height={240} />
      </ScreenScroll>
    );
  }

  if (children.isError || subs.isError) {
    return (
      <ScreenScroll onRefresh={onRefresh} refreshing={refreshing}>
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={onRefresh}
        />
      </ScreenScroll>
    );
  }

  // The live-plan summary body (shared by the gradient-border and plain cards).
  const planSummary = selected ? (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <AppText variant="title" style={{ flex: 1 }}>
          {childDisplayName(selected)}
        </AppText>
        {/* AN ENTITLEMENT IS NOT A SUBSCRIPTION ROW. This pill read "No
            subscription", in the muted tone, to a parent who had paid Apple
            thirty seconds earlier. It now reports the ACCESS when that is what
            exists; the subscription vocabulary is kept for the families who
            actually hold a subscription. */}
        <Pill
          label={
            !liveSub && entitledSubjects.length > 0
              ? t("mob.sub.accessActive")
              : t(subStatusKey(liveSub?.status))
          }
          tone={liveSub || entitledSubjects.length > 0 ? "ok" : "muted"}
        />
      </View>
      {liveSub ? (
        <>
          {/* Migration 109: one row PER SUBJECT — each carries its own cycle,
              so a single "Ödəniş dövrü" value would be wrong for a mixed plan. */}
          <KeyRow
            icon={<RefreshCw size={16} color={tokens.muted} strokeWidth={2} />}
            label={t("plan.cycle")}
            value={
              liveSub.subjects.length > 0
                ? liveSub.subjects
                    .map(
                      (s) =>
                        `${subjectLabel(t, s.code, s.name)} · ${intervalName(
                          s.interval ?? liveSub.billing_interval,
                        )}`,
                    )
                    .join("\n")
                : intervalName(liveSub.billing_interval)
            }
          />
          {/* current_period_end is when COVERAGE ends. next_renewal_at is a
              charge date and total_amount is an amount — neither belongs in a
              purchase-silent binary. */}
          <KeyRow
            icon={<CalendarDays size={16} color={tokens.muted} strokeWidth={2} />}
            label={t("mob.sub.accessUntil")}
            value={fmtDate(liveSub.current_period_end, locale)}
          />
          <KeyRow
            icon={<FileText size={16} color={tokens.muted} strokeWidth={2} />}
            label={t("subscription.subjects")}
            value={
              liveSub.subjects.length > 0
                ? liveSub.subjects.map((s) => subjectLabel(t, s.code, s.name)).join(", ")
                : t("billing.noSubjects")
            }
          />
        </>
      ) : null}
      {/* WHAT AN IN-APP PURCHASE ACTUALLY PRODUCES: one row in `entitlements`,
          no `child_subscriptions` row at all — which is why `liveSub` above is
          null for a family whose only purchase went through Apple. Without this
          line the screen deleted the offer and put NOTHING in its place, so a
          reviewer watched money go in and read "no subjects selected yet": the
          exact Guideline 3.1.1 impression this rail exists to remove.

          It REPLACES that sentence rather than sitting above it — a card that
          says both "Active subjects: Riyaziyyat" and "no subjects selected
          yet" is worse than either line alone. */}
      {entitledExtra.length > 0 ? (
        <KeyRow
          icon={<CheckCircle2 size={16} color={tokens.ok} strokeWidth={2} />}
          label={t("mob.sub.activeSubjects")}
          value={entitledExtra.map((s) => subjectLabel(t, s.code, s.name)).join(", ")}
        />
      ) : liveSub ? null : (
        <AppText variant="muted">{t("billing.noSubjects")}</AppText>
      )}
    </View>
  ) : null;

  // Manage-subjects editor + cancel flow for the live plan. addsDisabled runs
  // the editor in REMOVAL-ONLY mode: the server deliberately keeps removals
  // (and cancellation) legal while payments are off — a parent must always be
  // able to stop paying — and blocks only adds.
  const manageBlock = (addsDisabled: boolean) =>
    selected && liveSub ? (
      <>
        <ManageSubjectsEditor
          studentId={selected.profile_id}
          subjects={subjects.data ?? []}
          covered={liveSub.subjects.map((s) => ({
            subjectId: s.subject_id,
            interval: s.interval,
            pendingInterval: s.pending_interval,
            removeAt: s.remove_at,
          }))}
          defaultInterval={liveSub.billing_interval}
          addsDisabled={addsDisabled}
          onSaved={invalidate}
        />
        <Button
          title={t("subscription.cancelBtn")}
          variant="danger"
          onPress={() =>
            setCancelTarget({
              subId: liveSub.id,
              studentId: selected.profile_id,
              name: childDisplayName(selected),
            })
          }
        />
      </>
    ) : null;

  return (
    <ScreenScroll onRefresh={onRefresh} refreshing={refreshing}>
      <CmsProse text={t("subscription.subtitle")} />

      {list.length === 0 ? (
        <EmptyState
          title={t("parent.dash.noChildren")}
          icon={<CreditCard size={26} color={tokens.muted} strokeWidth={2} />}
          action={{
            label: t("parent.dash.addChild"),
            onPress: () => router.push("/(parent)/add-child"),
          }}
        />
      ) : (
        <>
          {list.length > 1 ? (
            <ChildChips
              childrenList={list}
              selectedId={selected?.profile_id ?? null}
              onSelect={setSelectedId}
              accessibilityLabel={t("billing.selectChild")}
            />
          ) : null}

          {posture.freeFlow ? (
            <Card>
              <AppText variant="muted">
                {/* One sentence for both free windows. The web copy frames
                    them in payment terms ("at no cost right now"), which
                    implies a cost later — the steering shape a store build
                    must not carry. What the family needs is what is OPEN. */}
                {t("mob.gate.allOpen")}
              </AppText>
            </Card>
          ) : null}

          {selected ? (
            <View style={{ gap: spacing.lg }}>
              {/* Live subscription summary — gradient border marks an ACTIVE plan. */}
              {liveSub ? (
                <GradientBorderCard>{planSummary}</GradientBorderCard>
              ) : (
                <Card>{planSummary}</Card>
              )}

              {/* NO PAYMENT STATE IS REPORTED HERE, EVER.
                  This tab used to branch on `posture.paymentsOff` and render
                  the WEB string `gate.paymentsOff` — "Payments are temporarily
                  paused. New subscriptions and purchases are unavailable right
                  now." Apple rejected the 2026-08-26 submission over it under
                  2.1.0 App Completeness, and it broke this project's own rule
                  that payment posture is a build-time constant and never a
                  server flag.

                  What a family HAS is shown above and is always real. What they
                  cannot do here is one unchanging sentence that is true whatever
                  the server says. An empty branch is not an option either — a
                  blank tab reads as unfinished, which is the same rejection. */}
              {liveSub
                ? // Managing a plan the family ALREADY has — removing a subject,
                  // restoring one they cancelled — is not purchasing, so it
                  // stays. Adds are gated whenever a new charge would be
                  // required.
                  manageBlock(!posture.freeFlow)
                : null}

              {/* iOS ONLY. Renders null unless there is something priced to
                  offer, so it never shows a heading over an empty box. */}
              {IAP_PLATFORM_SUPPORTED ? (
                <IapPanel
                  studentProfileId={selected.profile_id}
                  state={iapState}
                  offers={iap.offers}
                  refetch={iap.refetch}
                  onSettled={invalidate}
                />
              ) : null}

              {/* ANDROID ONLY, and the platform test is the whole point.
                  "Subscriptions are not managed in this app" is true and
                  policy-safe on Android, which is consumption-only by Google's
                  rules and says nothing about where to go instead.

                  On iOS that same sentence is a WRITTEN 3.1.1 CONFESSION shown
                  to the reviewer — and it used to appear there whenever the
                  catalogue was empty, which is exactly the state a forgotten
                  activation leaves us in. The tempting alternative ("not
                  available right now") is worse: that is the 2.1.0 App
                  Completeness rejection we already took in August.

                  So iOS renders NOTHING here. An empty area claims nothing and
                  confesses nothing. The real protection is that the catalogue
                  is never empty at review time — scripts/submission-preflight.mjs
                  fails on it — and this is the second line of defence. */}
              {!liveSub && !iapVisible && !IAP_PLATFORM_SUPPORTED ? (
                <Card>
                  <AppText variant="muted">{t("mob.pay.notInApp")}</AppText>
                </Card>
              ) : null}
            </View>
          ) : null}

          {cancelTarget ? (
            <CancelSheet
              visible
              onClose={() => setCancelTarget(null)}
              subscriptionId={cancelTarget.subId}
              studentId={cancelTarget.studentId}
              childName={cancelTarget.name}
              onCanceled={invalidate}
            />
          ) : null}
        </>
      )}

      {/* RESTORE SITS OUTSIDE THE CHILDREN FORK, on purpose. It is rendered
          even when nothing is for sale and even when the family has no children
          yet: Apple requires the control to exist and to be findable, and what
          it restores is an ACCOUNT's history, so it must not depend on whether
          a child chip happens to be selected. */}
      {IAP_PLATFORM_SUPPORTED ? (
        <Card style={{ gap: spacing.md }}>
          <RestoreAccessButton />
        </Card>
      ) : null}
    </ScreenScroll>
  );
}
