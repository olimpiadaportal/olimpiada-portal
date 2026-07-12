// OLYMPIADS tab (web parent catalog parity): active packages with cover /
// subject / grade / price / event date, a child selector, per-child "owned"
// pills, a detail sheet and the posture-aware Buy flow. Packages are ALWAYS
// purchases — giveaway/free-access do NOT make them free (web Round 13.1):
// demo AND giveaway buy through the demo sheet; 'real' is read-only (web
// account note); 'off' shows gate.paymentsOff. Idempotency-Key = pkg:child.
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { formatGradeLabel } from "@/lib/gradeLabel";
import { publicStorageUrl, type OlympiadPackageRow } from "@/lib/data";
import { bffPurchaseOlympiad } from "@/lib/api";
import { fmtDate, fmtMoney, resolvePosture } from "@/features/parent/commerce";
import { DemoPaySheet } from "@/features/parent/DemoPaySheet";
import {
  useChildren,
  useInvalidateParentData,
  useOlympiadCatalog,
  useOlympiadPurchases,
  useParentFreeAccess,
} from "@/features/parent/queries";
import {
  ChildChips,
  KeyRow,
  Pill,
  ScreenScroll,
  SheetShell,
  childDisplayName,
} from "@/features/parent/ui";

function Chip({ label }: { label: string }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        backgroundColor: tokens.chipBg,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: 2,
      }}
    >
      <AppText variant="label" color={tokens.chipText} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

export default function ParentOlympiads() {
  const { tokens } = useTheme();
  const { t, locale } = useT();
  const router = useRouter();

  const config = useMobileConfig();
  const freeAccess = useParentFreeAccess();
  const olympiadOn = config.data?.flags.olympiadModule === true;
  const children = useChildren();
  const catalog = useOlympiadCatalog(locale, olympiadOn);
  const purchases = useOlympiadPurchases(olympiadOn);
  const invalidate = useInvalidateParentData();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OlympiadPackageRow | null>(null);
  const [buying, setBuying] = useState<OlympiadPackageRow | null>(null);
  const [buyPending, setBuyPending] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [successFor, setSuccessFor] = useState<string | null>(null);
  // Render-stable "now" for the past-event check (impure calls stay out of render).
  const [now] = useState(() => Date.now());

  const posture = resolvePosture(
    config.data?.payment.mode ?? "off",
    freeAccess.data?.active === true,
  );
  // Buying runs via the demo-style sheet in BOTH demo and giveaway modes.
  const canBuy = posture.demoPay || posture.mode === "giveaway";

  const list = children.data ?? [];
  const selected = list.find((c) => c.profile_id === selectedId) ?? list[0] ?? null;

  const ownedForSelected = new Set(
    (purchases.data ?? [])
      .filter((p) => p.student_profile_id === selected?.profile_id)
      .map((p) => p.olympiad_package_id),
  );

  if (config.data && !olympiadOn) {
    return (
      <ScreenScroll>
        <GateNotice title={t("poly.title")} body={t("gate.olympiadOff")} />
      </ScreenScroll>
    );
  }

  const loading = config.isPending || children.isPending || catalog.isPending;
  const onRefresh = () => {
    void children.refetch();
    void catalog.refetch();
    void purchases.refetch();
  };

  async function confirmBuy() {
    if (!buying || !selected || buyPending) return;
    setBuyPending(true);
    setBuyError(null);
    const res = await bffPurchaseOlympiad(
      buying.id,
      selected.profile_id,
      `${buying.id}:${selected.profile_id}`,
    );
    setBuyPending(false);
    if (!res.ok) {
      setBuyError(t(res.error));
      return;
    }
    setBuying(null);
    setSuccessFor(buying.id);
    invalidate();
  }

  function startBuy(pkg: OlympiadPackageRow) {
    setDetail(null);
    setBuyError(null);
    setSuccessFor(null);
    setBuying(pkg);
  }

  const priceText = (pkg: OlympiadPackageRow) =>
    pkg.price_amount > 0 ? fmtMoney(pkg.price_amount, pkg.currency) : t("poly.free");
  const isPast = (pkg: OlympiadPackageRow) => {
    const ts = pkg.event_starts_at ? Date.parse(pkg.event_starts_at) : NaN;
    return Number.isFinite(ts) && ts <= now;
  };

  return (
    <ScreenScroll
      onRefresh={onRefresh}
      refreshing={catalog.isRefetching || purchases.isRefetching}
    >
      <AppText variant="muted">{t("poly.subtitle")}</AppText>

      {loading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={36} width="70%" />
          <Skeleton height={220} />
          <Skeleton height={220} />
        </View>
      ) : children.isError || catalog.isError ? (
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={onRefresh}
        />
      ) : (
        <>
          {list.length === 0 ? (
            <>
              <EmptyState title={t("poly.noChildren")} />
              <Button
                title={t("poly.addChild")}
                onPress={() => router.push("/(parent)/add-child")}
              />
            </>
          ) : (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label">{t("poly.chooseChild")}</AppText>
              <ChildChips
                childrenList={list}
                selectedId={selected?.profile_id ?? null}
                onSelect={setSelectedId}
                accessibilityLabel={t("poly.chooseChild")}
              />
            </View>
          )}

          {posture.paymentsOff ? (
            <Card>
              <AppText variant="muted">{t("gate.paymentsOff")}</AppText>
            </Card>
          ) : posture.webOnly ? (
            <Card>
              <AppText variant="muted">{t("mob.pay.webOnly")}</AppText>
            </Card>
          ) : null}

          {successFor ? (
            <Card>
              <AppText color={tokens.ok}>{t("poly.modal.success")}</AppText>
            </Card>
          ) : null}

          {(catalog.data ?? []).length === 0 ? (
            <EmptyState title={t("poly.none")} />
          ) : (
            <View style={{ gap: spacing.lg }}>
              {(catalog.data ?? []).map((pkg) => {
                const owned = ownedForSelected.has(pkg.id);
                const past = isPast(pkg);
                return (
                  <Card key={pkg.id} style={{ gap: spacing.sm, padding: 0, overflow: "hidden" }}>
                    {pkg.cover ? (
                      <Image
                        source={{ uri: publicStorageUrl(pkg.cover.bucket, pkg.cover.path) }}
                        style={{ width: "100%", aspectRatio: 16 / 9 }}
                        contentFit="cover"
                        accessibilityLabel={pkg.title}
                        transition={150}
                      />
                    ) : null}
                    <View style={{ padding: spacing.lg, gap: spacing.sm }}>
                      <View
                        style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                      >
                        <AppText variant="title" style={{ flex: 1 }}>
                          {pkg.title}
                        </AppText>
                        {owned ? <Pill label={t("poly.owned")} tone="ok" /> : null}
                        {past ? <Pill label={t("oly4.status.held")} tone="muted" /> : null}
                      </View>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                        {pkg.subject?.name ? <Chip label={pkg.subject.name} /> : null}
                        {pkg.grade ? (
                          <Chip label={formatGradeLabel(pkg.grade.level, locale, pkg.grade.name)} />
                        ) : null}
                        <Chip label={`${pkg.questions_per_attempt} ${t("poly.questions")}`} />
                        <Chip label={`${pkg.duration_minutes} ${t("mob.unit.min")}`} />
                      </View>
                      <KeyRow
                        label={t("oly4.date")}
                        value={
                          pkg.event_starts_at
                            ? fmtDate(pkg.event_starts_at, locale, true)
                            : t("oly4.dateTbd")
                        }
                      />
                      <KeyRow label={t("poly.price")} value={priceText(pkg)} strong />
                      <View style={{ flexDirection: "row", gap: spacing.sm }}>
                        <Button
                          title={t("oly4.details")}
                          variant="ghost"
                          style={{ flex: 1, minHeight: 44, paddingVertical: spacing.sm }}
                          onPress={() => setDetail(pkg)}
                        />
                        {canBuy && selected && !owned && !past ? (
                          <Button
                            title={t("poly.buyFor").replace(
                              "{name}",
                              childDisplayName(selected),
                            )}
                            style={{ flex: 1, minHeight: 44, paddingVertical: spacing.sm }}
                            onPress={() => startBuy(pkg)}
                          />
                        ) : null}
                      </View>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* ---- detail sheet ---- */}
      <SheetShell
        visible={detail !== null}
        onClose={() => setDetail(null)}
        closeLabel={t("poly.modal.close")}
      >
        {detail ? (
          <ScrollView contentContainerStyle={{ gap: spacing.md }}>
            <AppText variant="title">{detail.title}</AppText>
            {detail.description ? <AppText variant="muted">{detail.description}</AppText> : null}
            {detail.subject?.name ? (
              <KeyRow label={t("oly4.subject")} value={detail.subject.name} />
            ) : null}
            <KeyRow
              label={t("oly4.date")}
              value={
                detail.event_starts_at
                  ? fmtDate(detail.event_starts_at, locale, true)
                  : t("oly4.dateTbd")
              }
            />
            <KeyRow
              label={t("oly4.qcount")}
              value={`${detail.questions_per_attempt} ${t("poly.questions")}`}
            />
            <KeyRow
              label={t("mob.oly.duration")}
              value={`${detail.duration_minutes} ${t("mob.unit.min")}`}
            />
            <KeyRow label={t("oly4.price")} value={priceText(detail)} strong />
            {ownedForSelected.has(detail.id) ? (
              <AppText variant="muted">{t("poly.modal.already")}</AppText>
            ) : canBuy && selected && !isPast(detail) ? (
              <Button
                title={t("poly.buyFor").replace("{name}", childDisplayName(selected))}
                onPress={() => startBuy(detail)}
              />
            ) : posture.webOnly ? (
              <AppText variant="muted">{t("mob.pay.webOnly")}</AppText>
            ) : posture.paymentsOff ? (
              <AppText variant="muted">{t("gate.paymentsOff")}</AppText>
            ) : null}
            <Button title={t("poly.modal.close")} variant="ghost" onPress={() => setDetail(null)} />
          </ScrollView>
        ) : null}
      </SheetShell>

      {/* ---- purchase confirm (demo-style sheet; server re-validates) ---- */}
      <DemoPaySheet
        visible={buying !== null}
        onClose={() => setBuying(null)}
        onConfirm={() => void confirmBuy()}
        pending={buyPending}
        rows={
          buying && selected
            ? [
                { label: t("poly.modal.package"), value: buying.title },
                { label: t("poly.modal.child"), value: childDisplayName(selected) },
              ]
            : []
        }
        totalLabel={t("poly.price")}
        totalValue={buying ? priceText(buying) : ""}
        note={t("poly.modal.mockNote")}
        confirmLabel={t("poly.modal.confirm")}
        error={buyError}
      />
    </ScreenScroll>
  );
}
