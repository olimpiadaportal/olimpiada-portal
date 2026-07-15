// OLYMPIADS tab (web parent catalog parity, redesigned): cover cards with a
// bottom gradient scrim (title + price chip over the image), child selector,
// per-child "owned" pills, a detail sheet (grab handle, icon KeyRows, gradient
// buy CTA) and the posture-aware Buy flow. Question counts are the REAL
// published pool sizes (get_olympiad_pool_counts — the legacy
// questions_per_attempt column is display-only). Packages are ALWAYS
// purchases — giveaway/free-access do NOT make them free (web Round 13.1):
// demo AND giveaway buy through the demo sheet; 'real' is read-only (web
// account note); 'off' shows gate.paymentsOff. Idempotency-Key = pkg:child.
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  BookOpen,
  CalendarDays,
  CircleHelp,
  Clock3,
  GraduationCap,
  Medal,
  Tag,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorRetry, GateNotice, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, spacing } from "@/theme/tokens";
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
  useOlympiadPoolCounts,
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

function Chip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        backgroundColor: tokens.chipBg,
        borderRadius: 999,
        paddingHorizontal: spacing.md,
        paddingVertical: 3,
      }}
    >
      {icon ?? null}
      <AppText variant="label" color={tokens.chipText} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

/** Cover area: image (or brand-gradient fallback) + bottom scrim with the
 *  title and the price chip. Scrim ink is the fixed contrast contract
 *  (#0a0e1a → white text) so it reads on any cover photo in any theme. */
function CoverHeader({
  pkg,
  priceText,
  owned,
  past,
  ownedLabel,
  heldLabel,
}: {
  pkg: OlympiadPackageRow;
  priceText: string;
  owned: boolean;
  past: boolean;
  ownedLabel: string;
  heldLabel: string;
}) {
  return (
    <View style={{ width: "100%", aspectRatio: 16 / 9 }}>
      {pkg.cover ? (
        <Image
          source={{ uri: publicStorageUrl(pkg.cover.bucket, pkg.cover.path) }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          accessibilityLabel={pkg.title}
          recyclingKey={pkg.id}
          transition={150}
        />
      ) : (
        <LinearGradient
          colors={[...gradients.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}
        >
          <Medal size={44} color="rgba(255,255,255,0.9)" strokeWidth={1.8} />
        </LinearGradient>
      )}

      {/* Status pills float on the cover's top edge. */}
      {(owned || past) && (
        <View
          style={{
            position: "absolute",
            top: spacing.sm,
            right: spacing.sm,
            flexDirection: "row",
            gap: spacing.sm,
          }}
        >
          {owned ? <Pill label={ownedLabel} tone="ok" /> : null}
          {past ? <Pill label={heldLabel} tone="muted" /> : null}
        </View>
      )}

      <LinearGradient
        colors={["transparent", "rgba(10,14,26,0.78)"]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xxl,
          paddingBottom: spacing.md,
          flexDirection: "row",
          alignItems: "flex-end",
          gap: spacing.md,
        }}
      >
        <AppText
          variant="title"
          color="#ffffff"
          numberOfLines={2}
          style={{ flex: 1, fontSize: 18 }}
        >
          {pkg.title}
        </AppText>
        <View
          style={{
            backgroundColor: "rgba(255,255,255,0.92)",
            borderRadius: 999,
            paddingHorizontal: spacing.md,
            paddingVertical: 3,
          }}
        >
          <AppText variant="mono" color="#0a0e1a" style={{ fontSize: 13, fontWeight: "700" }}>
            {priceText}
          </AppText>
        </View>
      </LinearGradient>
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
  const poolCounts = useOlympiadPoolCounts((catalog.data ?? []).map((p) => p.id));
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
    void poolCounts.refetch();
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
  // REAL pool size (missing row / still loading → 0, web coalesce parity).
  const questionCount = (pkg: OlympiadPackageRow) => poolCounts.data?.get(pkg.id) ?? 0;

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
            <EmptyState
              title={t("poly.noChildren")}
              icon={<Medal size={26} color={tokens.muted} strokeWidth={2} />}
              action={{
                label: t("poly.addChild"),
                onPress: () => router.push("/(parent)/add-child"),
              }}
            />
          ) : (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="eyebrow">{t("poly.chooseChild")}</AppText>
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
            <EmptyState
              title={t("poly.none")}
              icon={<Medal size={26} color={tokens.muted} strokeWidth={2} />}
            />
          ) : (
            <View style={{ gap: spacing.lg }}>
              {(catalog.data ?? []).map((pkg) => {
                const owned = ownedForSelected.has(pkg.id);
                const past = isPast(pkg);
                return (
                  <Card key={pkg.id} style={{ padding: 0, overflow: "hidden" }}>
                    <CoverHeader
                      pkg={pkg}
                      priceText={priceText(pkg)}
                      owned={owned}
                      past={past}
                      ownedLabel={t("poly.owned")}
                      heldLabel={t("oly4.status.held")}
                    />
                    <View style={{ padding: spacing.lg, gap: spacing.md }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                        {pkg.subject?.name ? (
                          <Chip
                            icon={<BookOpen size={13} color={tokens.chipText} strokeWidth={2} />}
                            label={pkg.subject.name}
                          />
                        ) : null}
                        {pkg.grade ? (
                          <Chip
                            icon={
                              <GraduationCap size={13} color={tokens.chipText} strokeWidth={2} />
                            }
                            label={formatGradeLabel(pkg.grade.level, locale, pkg.grade.name)}
                          />
                        ) : null}
                        <Chip
                          icon={<CircleHelp size={13} color={tokens.chipText} strokeWidth={2} />}
                          label={`${questionCount(pkg)} ${t("poly.questions")}`}
                        />
                        <Chip
                          icon={<Clock3 size={13} color={tokens.chipText} strokeWidth={2} />}
                          label={`${pkg.duration_minutes} ${t("mob.unit.min")}`}
                        />
                      </View>
                      <KeyRow
                        icon={<CalendarDays size={16} color={tokens.muted} strokeWidth={2} />}
                        label={t("oly4.date")}
                        value={
                          pkg.event_starts_at
                            ? fmtDate(pkg.event_starts_at, locale, true)
                            : t("oly4.dateTbd")
                        }
                      />
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

      {/* ---- detail sheet (grab handle from SheetShell, icon KeyRows) ---- */}
      <SheetShell
        visible={detail !== null}
        onClose={() => setDetail(null)}
        closeLabel={t("poly.modal.close")}
      >
        {detail ? (
          <ScrollView contentContainerStyle={{ gap: spacing.md }}>
            <AppText variant="title">{detail.title}</AppText>
            {detail.description ? <AppText variant="muted">{detail.description}</AppText> : null}
            <View
              style={{
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: tokens.border,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
              }}
            >
              {detail.subject?.name ? (
                <KeyRow
                  icon={<BookOpen size={16} color={tokens.muted} strokeWidth={2} />}
                  label={t("oly4.subject")}
                  value={detail.subject.name}
                />
              ) : null}
              <KeyRow
                icon={<CalendarDays size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("oly4.date")}
                value={
                  detail.event_starts_at
                    ? fmtDate(detail.event_starts_at, locale, true)
                    : t("oly4.dateTbd")
                }
              />
              <KeyRow
                icon={<CircleHelp size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("oly4.qcount")}
                value={`${questionCount(detail)} ${t("poly.questions")}`}
              />
              <KeyRow
                icon={<Clock3 size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("mob.oly.duration")}
                value={`${detail.duration_minutes} ${t("mob.unit.min")}`}
              />
              <KeyRow
                icon={<Tag size={16} color={tokens.muted} strokeWidth={2} />}
                label={t("oly4.price")}
                value={priceText(detail)}
                strong
              />
            </View>
            {ownedForSelected.has(detail.id) ? (
              <AppText variant="muted">{t("poly.modal.already")}</AppText>
            ) : canBuy && selected && !isPast(detail) ? (
              <Button
                variant="gradient"
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
