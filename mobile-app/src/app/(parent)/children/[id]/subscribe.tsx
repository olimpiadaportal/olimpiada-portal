// Subjects & subscription for ONE existing child (web /children/[id]/subscribe
// parity). The id param is validated against the parent's own children (RLS
// list) — a foreign/malformed id renders the not-your-child notice. Posture:
//   off        → gate.paymentsOff
//   free modes → free notice + bffActivateFree when the child has no login ID
//   real       → read-only note (money is managed on the family's web account)
//   demo       → live sub ? ManageSubjectsEditor : SubscribeFlow (wizard 2-4)
import React, { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { subjectLabel } from "@/lib/subjectLabel";
import { bffActivateFree } from "@/lib/api";
import {
  extractChildUniqueId,
  fmtMoney,
  groupChildId,
  isCancellable,
  resolvePosture,
  subStatusKey,
} from "@/features/parent/commerce";
import { ManageSubjectsEditor } from "@/features/parent/ManageSubjectsEditor";
import { SubscribeFlow } from "@/features/parent/SubscribeFlow";
import {
  useChildSubscriptions,
  useChildren,
  useInvalidateParentData,
  useParentFreeAccess,
  useSubjectOptions,
} from "@/features/parent/queries";
import { KeyRow, Pill, ScreenScroll, childDisplayName } from "@/features/parent/ui";

function IdReveal({ id }: { id: string }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        alignSelf: "center",
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
        {groupChildId(id)}
      </AppText>
    </View>
  );
}

export default function ChildSubscribeScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const config = useMobileConfig();
  const freeAccess = useParentFreeAccess();
  const children = useChildren();
  const subs = useChildSubscriptions();
  const subjects = useSubjectOptions();
  const invalidate = useInvalidateParentData();

  const [freePending, setFreePending] = useState(false);
  const [freeError, setFreeError] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [subscribedId, setSubscribedId] = useState<string | null>(null);
  const [flowDone, setFlowDone] = useState(false);

  const loading =
    config.isPending || freeAccess.isPending || children.isPending || subs.isPending;
  const posture = resolvePosture(
    config.data?.payment.mode ?? "off",
    freeAccess.data?.active === true,
  );

  const child = (children.data ?? []).find((c) => c.profile_id === id) ?? null;
  // The most recent LIVE subscription for this child.
  const liveSub =
    (subs.data ?? []).find(
      (s) => s.student_profile_id === id && isCancellable(s.status),
    ) ?? null;

  async function activateFree() {
    if (freePending) return;
    setFreePending(true);
    setFreeError(null);
    const res = await bffActivateFree(id);
    setFreePending(false);
    if (!res.ok) {
      setFreeError(t(res.error));
      return;
    }
    setRevealedId(extractChildUniqueId(res.data));
    invalidate();
  }

  const onRefresh = () => {
    void children.refetch();
    void subs.refetch();
    void freeAccess.refetch();
  };

  if (loading) {
    return (
      <ScreenScroll>
        <Skeleton height={24} width="50%" />
        <Skeleton height={160} />
        <Skeleton height={240} />
      </ScreenScroll>
    );
  }

  if (children.isError) {
    return (
      <ScreenScroll onRefresh={onRefresh} refreshing={children.isRefetching}>
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => void children.refetch()}
        />
      </ScreenScroll>
    );
  }

  if (!child) {
    // Ownership miss (or bad deep link): never render another family's child.
    return (
      <ScreenScroll>
        <GateNotice title={t("sub.title")} body={t("sub.err.notYourChild")} />
        <Button title={t("addchild.back")} variant="ghost" onPress={() => router.back()} />
      </ScreenScroll>
    );
  }

  const childName = childDisplayName(child);
  const knownId = revealedId ?? child.child_unique_id;

  // Compact live-subscription summary (status/interval/total/subjects).
  const liveSubCard = liveSub ? (
    <Card style={{ gap: spacing.sm }}>
      <Pill label={t(subStatusKey(liveSub.status))} tone="ok" />
      <KeyRow
        label={t("subscription.interval")}
        value={
          liveSub.billing_interval === "week"
            ? t("pricing.weekly")
            : liveSub.billing_interval === "year"
              ? t("pricing.yearly")
              : t("pricing.monthly")
        }
      />
      <KeyRow
        label={t("billing.totalLabel")}
        value={fmtMoney(liveSub.total_amount ?? 0, liveSub.currency)}
      />
      {liveSub.subjects.length > 0 ? (
        <KeyRow
          label={t("subscription.subjects")}
          value={liveSub.subjects.map((s) => subjectLabel(t, s.code, s.name)).join(", ")}
        />
      ) : null}
    </Card>
  ) : null;

  return (
    <ScreenScroll onRefresh={onRefresh} refreshing={subs.isRefetching || children.isRefetching}>
      <AppText variant="muted">{childName}</AppText>

      {flowDone ? (
        // Demo subscribe finished — success + (new) login ID reveal.
        <Card style={{ gap: spacing.md }}>
          <AppText variant="title" style={{ textAlign: "center" }}>
            {t("pay.success")}
          </AppText>
          {subscribedId ? (
            <>
              <AppText variant="muted" style={{ textAlign: "center" }}>
                {t("pay.idRevealed")}
              </AppText>
              <IdReveal id={subscribedId} />
              <AppText variant="muted" style={{ textAlign: "center" }}>
                {t("parent.child.idNote")}
              </AppText>
            </>
          ) : (
            <AppText variant="muted" style={{ textAlign: "center" }}>
              {t("sub.done")}
            </AppText>
          )}
          <Button
            title={t("parent.dash.title")}
            onPress={() => router.replace("/(parent)/(tabs)/home")}
          />
        </Card>
      ) : posture.paymentsOff ? (
        <GateNotice title={t("sub.title")} body={t("gate.paymentsOff")} />
      ) : posture.freeFlow ? (
        <>
          <Card>
            <AppText>
              {posture.mode === "giveaway" ? t("gate.giveawayFree") : t("gate.freeAccess")}
            </AppText>
          </Card>
          {revealedId ? (
            <Card style={{ gap: spacing.md }}>
              <AppText variant="title" style={{ textAlign: "center" }}>
                {t("freeact.done")}
              </AppText>
              <IdReveal id={revealedId} />
              <AppText variant="muted" style={{ textAlign: "center" }}>
                {t("parent.child.idNote")}
              </AppText>
            </Card>
          ) : !liveSub && !knownId ? (
            // A brand-new child must still get a login ID inside the free window.
            <Card style={{ gap: spacing.md }}>
              <AppText variant="muted">{t("freeact.note")}</AppText>
              {freeError ? (
                <AppText variant="muted" color={tokens.danger}>
                  {freeError}
                </AppText>
              ) : null}
              <Button
                title={t("freeact.cta")}
                pending={freePending}
                pendingTitle={t("freeact.activating")}
                onPress={() => void activateFree()}
              />
            </Card>
          ) : liveSub ? (
            <ManageSubjectsEditor
              studentId={id}
              subjects={subjects.data ?? []}
              coveredIds={liveSub.subjects.map((s) => s.subject_id)}
              interval={liveSub.billing_interval}
              posture={posture}
              onSaved={invalidate}
            />
          ) : null}
        </>
      ) : posture.webOnly ? (
        <>
          {liveSubCard}
          <Card>
            <AppText variant="muted">{t("mob.pay.webOnly")}</AppText>
          </Card>
        </>
      ) : liveSub ? (
        <>
          {liveSubCard}
          <ManageSubjectsEditor
            studentId={id}
            subjects={subjects.data ?? []}
            coveredIds={liveSub.subjects.map((s) => s.subject_id)}
            interval={liveSub.billing_interval}
            posture={posture}
            onSaved={invalidate}
          />
        </>
      ) : (
        <SubscribeFlow
          studentId={id}
          subjects={subjects.data ?? []}
          onDone={(newId) => {
            setSubscribedId(newId);
            setFlowDone(true);
            invalidate();
          }}
        />
      )}
    </ScreenScroll>
  );
}
