// SUBSCRIPTION tab (web /subscription one-page billing center parity,
// redesigned): child selector chips → per-child live-subscription card (brand
// gradient-border when a plan is live) + manage-subjects editor
// (posture-aware) + cancel flow, plus the owner-approved, clearly labeled DEMO
// Billing and Invoices sections (billing.demoNote) restyled to the new visual
// system. Posture: editor runs in demo (payment-first sheet) and free modes
// (direct); 'real' shows the web-only note; 'off' shows gate.paymentsOff.
import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  CreditCard,
  FileText,
  Receipt,
  RefreshCw,
  Wallet,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { Segmented } from "@/components/Segmented";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { subjectLabel } from "@/lib/subjectLabel";
import {
  fmtDate,
  fmtMoney,
  isCancellable,
  resolvePosture,
  subStatusKey,
} from "@/features/parent/commerce";
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

type SectionId = "plans" | "billing" | "invoices";

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

  const [section, setSection] = useState<SectionId>("plans");
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
  const onRefresh = () => {
    void children.refetch();
    void subs.refetch();
    void freeAccess.refetch();
    void config.refetch();
  };

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
      <ScreenScroll onRefresh={onRefresh} refreshing={children.isRefetching || subs.isRefetching}>
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
          <KeyRow
            icon={<RefreshCw size={16} color={tokens.muted} strokeWidth={2} />}
            label={t("subscription.interval")}
            value={intervalName(liveSub.billing_interval)}
          />
          <KeyRow
            icon={<CalendarDays size={16} color={tokens.muted} strokeWidth={2} />}
            label={t("billing.row.next")}
            value={fmtDate(liveSub.current_period_end, locale)}
          />
          <KeyRow
            icon={<Wallet size={16} color={tokens.muted} strokeWidth={2} />}
            label={t("billing.totalLabel")}
            value={fmtMoney(liveSub.total_amount ?? 0, liveSub.currency)}
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

  return (
    <ScreenScroll onRefresh={onRefresh} refreshing={children.isRefetching || subs.isRefetching}>
      <AppText variant="muted">{t("subscription.subtitle")}</AppText>

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

          <Segmented
            options={[
              { value: "plans" as const, label: t("billing.tab.plans") },
              { value: "billing" as const, label: t("billing.tab.billing") },
              { value: "invoices" as const, label: t("billing.tab.invoices") },
            ]}
            value={section}
            onChange={setSection}
          />

          {posture.freeFlow ? (
            <Card>
              <AppText variant="muted">
                {posture.mode === "giveaway" ? t("billing.giveawayNote") : t("gate.freeAccess")}
              </AppText>
            </Card>
          ) : null}

          {section === "plans" && selected ? (
            <View style={{ gap: spacing.lg }}>
              {/* Live subscription summary — gradient border marks an ACTIVE plan. */}
              {liveSub ? (
                <GradientBorderCard>{planSummary}</GradientBorderCard>
              ) : (
                <Card>{planSummary}</Card>
              )}

              {posture.paymentsOff ? (
                <GateNotice title={t("billing.plansTitle")} body={t("gate.paymentsOff")} />
              ) : posture.webOnly ? (
                <Card>
                  <AppText variant="muted">{t("mob.pay.webOnly")}</AppText>
                </Card>
              ) : liveSub ? (
                <>
                  <ManageSubjectsEditor
                    studentId={selected.profile_id}
                    subjects={subjects.data ?? []}
                    coveredIds={liveSub.subjects.map((s) => s.subject_id)}
                    interval={liveSub.billing_interval}
                    posture={posture}
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
              ) : posture.freeFlow ? null : (
                // demo mode, no live plan → start one on the subscribe screen.
                <Button
                  title={t("subscription.startPlan")}
                  variant="gradient"
                  onPress={() =>
                    router.push({
                      pathname: "/(parent)/children/[id]/subscribe",
                      params: { id: selected.profile_id },
                    })
                  }
                />
              )}
            </View>
          ) : null}

          {section === "billing" ? (
            <Card style={{ gap: spacing.sm }}>
              <SectionHeader title={t("billing.billingTitle")} />
              <KeyRow
                icon={<FileText size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("billing.current")}
                value={t("pricing.plan.monthly.name")}
              />
              <KeyRow
                icon={<RefreshCw size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("billing.row.cycle")}
                value={t("pricing.monthly")}
              />
              <KeyRow
                icon={<CalendarDays size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("billing.row.next")}
                value="29/01/2026"
              />
              <KeyRow
                icon={<Wallet size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("billing.totalLabel")}
                value="≈ 18 AZN"
              />
              <KeyRow
                icon={<CreditCard size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("billing.row.method")}
                value={t("billing.cardEnding")}
              />
              <KeyRow
                icon={<CalendarDays size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("billing.row.expiry")}
                value="11/2028"
              />
              <KeyRow
                icon={<Receipt size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("billing.row.status")}
                value={t("billing.defaultMethod")}
              />
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <Button title={t("billing.changeMethod")} variant="ghost" disabled onPress={() => {}} />
                <Button title={t("billing.addCard")} variant="ghost" disabled onPress={() => {}} />
                <AppText variant="muted" style={{ textAlign: "center", fontSize: 12 }}>
                  {t("billing.soon")}
                </AppText>
              </View>
              <AppText variant="muted" style={{ marginTop: spacing.sm, fontSize: 12 }}>
                {t("billing.demoNote")}
              </AppText>
            </Card>
          ) : null}

          {section === "invoices" ? (
            <View style={{ gap: spacing.md }}>
              <SectionHeader title={t("billing.invoicesTitle")} />
              {[
                { id: "INV-2026-001", date: t("billing.date1") },
                { id: "INV-2025-012", date: t("billing.date2") },
              ].map((row) => (
                <Card key={row.id} style={{ gap: spacing.xs }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                    <FileText size={18} color={tokens.accent} strokeWidth={2} />
                    <AppText variant="mono" style={{ flex: 1, fontWeight: "700" }}>
                      {row.id}
                    </AppText>
                    <Pill label={t("billing.paid")} tone="ok" />
                  </View>
                  <KeyRow label={t("billing.col.date")} value={row.date} />
                  <KeyRow label={t("billing.col.plan")} value={t("pricing.plan.monthly.name")} />
                  <KeyRow label={t("billing.col.subjects")} value={t("billing.threeSubjects")} />
                  <KeyRow label={t("billing.col.amount")} value="≈ 18 AZN" />
                  <AppText variant="muted" color={tokens.muted} style={{ fontSize: 12 }}>
                    {t("billing.download")} — {t("billing.soon")}
                  </AppText>
                </Card>
              ))}
              <AppText variant="muted" style={{ fontSize: 12 }}>
                {t("billing.demoNote")}
              </AppText>
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
