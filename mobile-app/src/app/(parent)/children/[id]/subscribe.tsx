// Subjects & subscription for ONE existing child (web /children/[id]/subscribe
// parity). The id param is validated against the parent's own children (RLS
// list) — a foreign/malformed id renders the not-your-child notice.
//
// PURCHASE-SILENT ON ANDROID (docs/STORE_PAYMENTS_COMPLIANCE.md): there is no
// subscribe wizard on mobile in ANY mode since the demo payment mode was
// deleted (owner, 2026-08-18). Every branch below is read-only or
// free-activation:
//   free modes → free notice + bffActivateFree, and the price-free subjects
//                editor when a plan is live
//   real / off → the live plan if there is one, otherwise status only
//                (mob.pay.notInApp)
// A live subscription is NEVER suppressed by the payment posture -- 'off' is
// also the fail-closed default when the config RPC fails, and this screen used
// to blank itself in exactly that case.
//
// ON iOS ONE THING IS ADDED AND NOTHING IS TAKEN AWAY: the Apple in-app
// purchase panel (src/features/iap), plus the Restore control Apple requires to
// exist and to be findable. Apple rejected the 2026-08-31 submission under
// Guideline 3.1.1 — on that storefront the fix is not silence, it is IAP.
// Everything is behind IAP_PLATFORM_SUPPORTED, a BUILD-TIME constant: an
// Android build renders exactly what it rendered yesterday, down to the
// mob.pay.notInApp sentence.
import React, { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { CopyableId } from "@/components/CopyableId";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { subjectLabel } from "@/lib/subjectLabel";
import { bffActivateFree } from "@/lib/api";
import {
  extractChildUniqueId,
  fmtDate,
  groupChildId,
  isCancellable,
  resolvePosture,
  subStatusKey,
} from "@/features/parent/commerce";
import { ManageSubjectsEditor } from "@/features/parent/ManageSubjectsEditor";
import {
  IAP_PLATFORM_SUPPORTED,
  IapPanel,
  RestoreAccessButton,
  useIapOffers,
  type IapSurfaceState,
} from "@/features/iap";
import {
  QK,
  fetchEntitledSubjects,
  useChildSubscriptions,
  useChildren,
  useInvalidateParentData,
  useParentFreeAccess,
  useSubjectOptions,
} from "@/features/parent/queries";
import { KeyRow, Pill, ScreenScroll, childDisplayName } from "@/features/parent/ui";

function IdReveal({ id, t }: { id: string; t: (k: string) => string }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        alignSelf: "center",
        maxWidth: "100%",
        backgroundColor: tokens.chipBg,
        borderRadius: radius.lg,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
      }}
    >
      {/* Tappable: the parent reads this number here more often than anywhere
          else, and typing eight digits into a child's login by hand is the
          step they get wrong. Copies the RAW digits, never the spaced display
          form — pasting "2721 0253" into the login field would fail and the
          parent would blame the ID. */}
      <CopyableId
        id={id}
        display={groupChildId(id)}
        fontSize={32}
        label={t("parent.child.idCopy")}
        copiedLabel={t("parent.child.idCopied")}
        a11yLabel={t("parent.child.idCopyA11y")}
      />
    </View>
  );
}

export default function ChildSubscribeScreen() {
  const { tokens } = useTheme();
  const { t, locale } = useT();
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

  // WHAT THIS CHILD ALREADY OWNS — see the twin in (tabs)/subscription.tsx. An
  // Apple purchase writes an entitlement and NO `child_subscriptions` row, so
  // without it the subject just bought keeps its price button and the next tap
  // meets the server's double-billing refusal, in the DANGER colour, directly
  // under a payment that worked.
  //
  // The reader itself, and why it asks child_entitled_subjects rather than
  // my_accessible_subjects, is in features/parent/queries — shared with the
  // subscription tab and with the parent Home cards' access pill.
  const entitled = useQuery({
    // Keyed under the subscriptions key so useInvalidateParentData() — what
    // IapPanel calls once a purchase settles — refetches it by prefix, and the
    // bought subject leaves the offer list without an app restart. The same key
    // as the other two surfaces: one refetch answers for all three.
    queryKey: QK.entitled(id),
    queryFn: () => fetchEntitledSubjects(id),
    // Only the iOS offer filter reads it, and never for another family's
    // child. It stays out of `loading` for the same reason as in the twin: a
    // disabled query is pending forever, and the skeleton would never end on
    // Android.
    enabled: IAP_PLATFORM_SUPPORTED && child !== null,
  });

  // WHAT THE SCREEN SHOWS BACK. Subjects the live plan already lists are
  // dropped from the "already active" card: the same subject named twice,
  // under two headings, reads as two payments.
  const entitledSubjects = entitled.data ?? [];
  const planSubjectIds = new Set((liveSub?.subjects ?? []).map((s) => s.subject_id));
  const entitledExtra = entitledSubjects.filter((s) => !planSubjectIds.has(s.id));

  // iOS purchase surface. Called UNCONDITIONALLY and before every early return
  // below — it owns react-query hooks, and a hook that disappears on the
  // loading branch is a crash on the next render. Off iOS it fetches nothing
  // and answers state "off".
  const iap = useIapOffers(
    [
      ...(liveSub ? liveSub.subjects.map((s) => s.subject_id) : []),
      // Entitlements merged in: an in-app purchase writes no subscription row, so
      // the line above on its own keeps offering what the family just bought.
      ...entitledSubjects.map((s) => s.id),
    ],
    // THIS CHILD'S GRADE (migration 155) — the same rule the web page of the
    // same name applies, and the same one this child's arena applies last. A
    // subject their grade does not study buys an entitlement every child screen
    // then filters away: the parent pays and nothing on the phone changes.
    // `child` is resolved above, so a foreign/unknown id contributes no grade
    // and the list is simply not narrowed — never narrowed by someone else's.
    child?.grade_id ?? null,
  );
  // THE OFFERS WAIT FOR THE ENTITLEMENT READ — on iOS only. The two reads
  // race: the StoreKit catalogue is cached for ten minutes while `entitled`
  // refetches after every purchase, so the offer list could paint first and
  // briefly show a price button for a subject this child already owns. One tap
  // on it opens the store sheet for a purchase the server then refuses, and the
  // refusal renders in the DANGER colour directly under a payment that worked.
  //
  // Folded into the PANEL's state, never into `loading` above: "loading" is a
  // state the panel already renders honestly (mob.iap.loading), while this
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
  // Does the panel actually put something on screen? "off"/"none" render null,
  // and in that case the screen keeps the sentence it has always shown.
  const iapVisible = IAP_PLATFORM_SUPPORTED && iapState !== "off" && iapState !== "none";

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

  // `entitled` is refreshed on iOS ONLY — refetch() ignores `enabled`, so an
  // unguarded entry would fire the RPC from an Android pull.
  const { refreshing, onRefresh } = usePullRefresh([
    children,
    subs,
    IAP_PLATFORM_SUPPORTED && entitled,
    freeAccess,
    config,
  ]);

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
      <ScreenScroll onRefresh={onRefresh} refreshing={refreshing}>
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
    // A pull still re-reads the list, so a child created on another device
    // resolves here without leaving the screen.
    return (
      <ScreenScroll onRefresh={onRefresh} refreshing={refreshing}>
        <GateNotice title={t("sub.title")} body={t("sub.err.notYourChild")} />
        <Button title={t("addchild.back")} variant="ghost" onPress={() => router.back()} />
      </ScreenScroll>
    );
  }

  const childName = childDisplayName(child);
  const knownId = revealedId ?? child.child_unique_id;

  // A subject's OWN cycle, named. NULL inherits the subscription default.
  const cycleName = (iv: string | null) =>
    iv === "week" ? t("pricing.weekly") : iv === "year" ? t("pricing.yearly") : t("pricing.monthly");

  // Compact live-subscription summary. STATUS + WHAT IS ACTIVE + until when —
  // never an amount and never a next-charge date (store compliance: show what
  // is active, not what it costs).
  const liveSubCard = liveSub ? (
    <Card style={{ gap: spacing.sm }}>
      <Pill label={t(subStatusKey(liveSub.status))} tone="ok" />
      {/* Migration 109: one line PER SUBJECT — each carries its own cycle, so a
          single "Odenis dovru" value would be wrong for a mixed plan. */}
      <KeyRow
        label={t("plan.cycle")}
        value={
          liveSub.subjects.length > 0
            ? liveSub.subjects
                .map(
                  (s) =>
                    subjectLabel(t, s.code, s.name) +
                    " · " +
                    cycleName(s.interval ?? liveSub.billing_interval),
                )
                .join("\n")
            : cycleName(liveSub.billing_interval)
        }
      />
      {/* current_period_end is when COVERAGE ends (the MAX of the subject
          periods) — the honest read-only fact. next_renewal_at is a charge
          date and is deliberately not shown. */}
      <KeyRow
        label={t("mob.sub.accessUntil")}
        value={fmtDate(liveSub.current_period_end, locale)}
      />
    </Card>
  ) : null;

  // WHAT AN IN-APP PURCHASE ACTUALLY PRODUCES: one row in `entitlements`, no
  // `child_subscriptions` row at all — which is exactly what `liveSubCard`
  // above can never show. Without this card the screen removed the offer and
  // put NOTHING in its place, so a parent (and a reviewer) watched money go in
  // and the screen report nothing back: the Guideline 3.1.1 impression this
  // rail exists to remove.
  const entitledCard =
    entitledExtra.length > 0 ? (
      <Card style={{ gap: spacing.sm }}>
        <Pill label={t("mob.sub.accessActive")} tone="ok" />
        <KeyRow
          label={t("mob.sub.activeSubjects")}
          value={entitledExtra.map((s) => subjectLabel(t, s.code, s.name)).join(", ")}
        />
      </Card>
    ) : null;

  return (
    <ScreenScroll onRefresh={onRefresh} refreshing={refreshing}>
      <AppText variant="muted">{childName}</AppText>

      {/* WHAT THIS FAMILY HAS COMES FIRST, ALWAYS.
          This screen used to branch on posture.paymentsOff BEFORE rendering the
          live-subscription card, so in mode `off` a family with a real active
          plan saw only "not managed here" and their actual entitlement was
          suppressed. `off` is also the client's fail-closed default, so a failed
          config RPC blanked the screen for everyone. Entitlement is never
          conditional on a payment flag. */}
      {posture.freeFlow ? (
        <>
          <Card>
            <AppText>
              {t("mob.gate.allOpen")}
            </AppText>
          </Card>
          {revealedId ? (
            <Card style={{ gap: spacing.md }}>
              <AppText variant="title" style={{ textAlign: "center" }}>
                {t("freeact.done")}
              </AppText>
              <IdReveal id={revealedId} t={t} />
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
              covered={liveSub.subjects.map((s) => ({
                subjectId: s.subject_id,
                interval: s.interval,
                pendingInterval: s.pending_interval,
                removeAt: s.remove_at,
              }))}
              defaultInterval={liveSub.billing_interval}
              onSaved={invalidate}
            />
          ) : null}
        </>
      ) : (
        // 'real': read-only on Android. The plan itself is not started, changed
        // or paid for anywhere in this app.
        <>
          {liveSubCard}
          {/* ANDROID ONLY — see the same guard in (tabs)/subscription.tsx.
              "Subscriptions are not managed in this app" is policy-safe on
              Android and a written 3.1.1 confession on iOS, where it used to
              appear whenever the catalogue was empty. iOS renders nothing
              instead: an empty area claims nothing, while the obvious
              alternative ("not available right now") is the 2.1.0 rejection. */}
          {iapVisible || IAP_PLATFORM_SUPPORTED ? null : (
            <Card>
              <AppText variant="muted">{t("mob.pay.notInApp")}</AppText>
            </Card>
          )}
        </>
      )}

      {/* OUTSIDE THE POSTURE FORK, for the same reason the live plan is: what a
          family OWNS is never conditional on a payment flag, and a subject
          activated during a free window is still theirs after it closes. */}
      {entitledCard}

      {/* iOS ONLY, in BOTH postures. The panel renders null unless there is
          something priced to offer, so a free window shows the notice above and
          nothing else. */}
      {IAP_PLATFORM_SUPPORTED ? (
        <IapPanel
          studentProfileId={id}
          state={iapState}
          offers={iap.offers}
          refetch={iap.refetch}
          onSettled={invalidate}
        />
      ) : null}

      {/* RESTORE IS UNCONDITIONAL ON iOS — including when nothing is for sale.
          Apple requires the control to exist and to be findable; a family that
          reinstalls or switches device must get back what they paid for. */}
      {IAP_PLATFORM_SUPPORTED ? (
        <Card style={{ gap: spacing.md }}>
          <RestoreAccessButton />
        </Card>
      ) : null}
    </ScreenScroll>
  );
}
