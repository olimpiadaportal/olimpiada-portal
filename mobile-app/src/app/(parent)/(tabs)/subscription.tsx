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
import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays, CreditCard, FileText, RefreshCw } from "lucide-react-native";
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
import { fmtDate, isCancellable, resolvePosture, subStatusKey } from "@/features/parent/commerce";
import { CancelSheet } from "@/features/parent/CancelSheet";
import { ManageSubjectsEditor } from "@/features/parent/ManageSubjectsEditor";
import {
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

  const loading =
    config.isPending || children.isPending || subs.isPending || freeAccess.isPending;
  const { refreshing, onRefresh } = usePullRefresh([children, subs, freeAccess, config]);

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
        <Pill label={t(subStatusKey(liveSub?.status))} tone={liveSub ? "ok" : "muted"} />
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
      ) : (
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
              {liveSub ? (
                // Managing a plan the family ALREADY has — removing a subject,
                // restoring one they cancelled — is not purchasing, so it stays.
                // Adds are gated whenever a new charge would be required.
                manageBlock(!posture.freeFlow)
              ) : (
                <Card>
                  <AppText variant="muted">{t("mob.pay.notInApp")}</AppText>
                </Card>
              )}
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
    </ScreenScroll>
  );
}
