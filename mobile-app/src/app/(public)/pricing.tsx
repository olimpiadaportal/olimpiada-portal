// Public SERVICES screen ("Xidmətlər"): what a subscription cycle covers, plus
// the active-olympiad-packages band (anon get_public_olympiad_packages RPC —
// the same server-filtered rows as the web landing/services section).
//
// INFORMATION ONLY (docs/STORE_PAYMENTS_COMPLIANCE.md, owner 2026-08-18).
// Everything that made this a paywall is gone: the AZN plan price and the
// per-subject price rows, the "choose this plan" CTA into the registration
// funnel, the trial line, the sibling-discount percentages, and the package
// price + "Əldə et" CTA. A parent reaches this screen from the account sheet,
// so an amount here is an amount inside a parent session — which is exactly
// what Apple 3.1.1 / the Play Payments policy forbid in a purchase-silent
// binary. No price, no CTA, no destination named.
// Redesign (plan §4-Public): the popular interval keeps its gradient border +
// "Populyar" pill.
import React, { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  BookOpen,
  CalendarDays,
  Check,
  CircleHelp,
  Clock3,
  Trophy,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ListRow } from "@/components/ListRow";
import { Segmented } from "@/components/Segmented";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, spacing } from "@/theme/tokens";
import { fetchPublicOlympiadPackages, type PublicOlympiadPackage } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { useContentOverrides } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useT } from "@/i18n/useT";
import type { Locale } from "@/i18n";
import { formatLongDate } from "@/lib/formatDate";
import { subjectLabel } from "@/lib/subjectLabel";
import { formatGradeLabel, formatGradeRangeLabel } from "@/lib/gradeLabel";

const PLANS = [{ key: "weekly" }, { key: "monthly" }, { key: "yearly" }] as const;

type PlanKey = (typeof PLANS)[number]["key"];

function Pill({ text }: { text: string }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: tokens.pillBg,
        borderRadius: 999,
        paddingVertical: 3,
        paddingHorizontal: spacing.md,
      }}
    >
      <AppText variant="label" color={tokens.pillText} style={{ fontSize: 12 }}>
        {text}
      </AppText>
    </View>
  );
}

/* ---------------- active olympiad packages (web PublicOlympiadPackages) ------ */

const PKG_STALE_MS = 5 * 60_000;

/** Sale/event deadlines are DATE-ONLY in the product's home timezone.
 *  Round 46: via the shared Hermes-safe helper — the local Intl call this
 *  replaced returned the CLDR root pattern ("2026 M08 22") on devices without
 *  Azerbaijani month data, and did not throw, so its catch never ran.
 *  An unset/invalid date stays null so the row is hidden, not shown as "—". */
function pkgDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const out = formatLongDate(iso, locale);
  return out === "—" ? null : out;
}

/** Localized pick with az fallback (the RPC already az-falls-back en/ru; the
 *  extra guards keep empty strings out either way). */
function pickText(
  locale: Locale,
  az: string | null,
  en: string | null,
  ru: string | null,
): string {
  const v = locale === "en" ? en : locale === "ru" ? ru : az;
  return (v ?? "").trim() || (az ?? "").trim();
}

function MetaChip({ icon, label }: { icon: React.ReactNode; label: string }) {
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
        // A long az/ru subject label must not push the chip past the card.
        maxWidth: "100%",
      }}
    >
      {icon}
      <AppText
        variant="label"
        color={tokens.chipText}
        numberOfLines={1}
        style={{ fontSize: 12, flexShrink: 1, minWidth: 0 }}
      >
        {label}
      </AppText>
    </View>
  );
}

function PublicPackagesSection() {
  const { t, locale } = useT();
  const { tokens } = useTheme();

  const q = useQuery({
    queryKey: ["public-oly-packages"],
    queryFn: fetchPublicOlympiadPackages,
    enabled: isSupabaseConfigured,
    staleTime: PKG_STALE_MS,
  });

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="eyebrow">{t("polyPub.eyebrow")}</AppText>
        <AppText variant="heading">{t("polyPub.title")}</AppText>
        <AppText variant="muted">{t("polyPub.sub")}</AppText>
      </View>

      {q.isPending && isSupabaseConfigured ? (
        <Card style={{ gap: spacing.md }}>
          <Skeleton height={22} width="60%" />
          <Skeleton height={14} />
          <Skeleton height={14} width="80%" />
          <Skeleton height={28} width="40%" />
        </Card>
      ) : q.isError && !q.data ? (
        <ErrorRetry
          message={t("mob.boot.error")}
          retryLabel={t("mob.retry")}
          onRetry={() => void q.refetch()}
        />
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <AppText variant="muted">{t("polyPub.empty")}</AppText>
        </Card>
      ) : (
        <View style={{ gap: spacing.lg }}>
          {(q.data ?? []).map((r: PublicOlympiadPackage) => {
            const title = pickText(locale, r.title_az, r.title_en, r.title_ru) || "—";
            const desc = pickText(
              locale,
              r.description_az,
              r.description_en,
              r.description_ru,
            );
            const subject =
              r.subject_code || r.subject_name
                ? subjectLabel(t, r.subject_code, r.subject_name)
                : null;
            // Round 34 (web parity): prefer the full multi-grade set; the
            // legacy single grade covers old rows.
            const levels = Array.isArray(r.grade_levels)
              ? r.grade_levels.filter((n) => Number.isInteger(n))
              : [];
            const grade =
              levels.length > 1
                ? formatGradeRangeLabel(levels, locale)
                : levels.length === 1
                  ? formatGradeLabel(levels[0], locale, r.grade_label)
                  : r.grade_level != null || r.grade_label
                    ? formatGradeLabel(r.grade_level, locale, r.grade_label)
                    : null;
            const saleEnds = pkgDate(r.sale_ends_at, locale);
            const eventAt = pkgDate(r.event_at, locale);
            const questions = Number(r.question_count ?? 0) || 0;
            return (
              <Card key={r.id} style={{ gap: spacing.md }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  {subject ? (
                    <MetaChip
                      icon={<Trophy size={13} color={tokens.chipText} strokeWidth={2} />}
                      label={subject}
                    />
                  ) : null}
                  {grade && grade !== "—" ? (
                    <MetaChip
                      icon={<BookOpen size={13} color={tokens.chipText} strokeWidth={2} />}
                      label={grade}
                    />
                  ) : null}
                  <MetaChip
                    icon={<CircleHelp size={13} color={tokens.chipText} strokeWidth={2} />}
                    label={`${questions} ${t("poly.questions")}`}
                  />
                </View>
                <AppText variant="title" style={{ fontSize: 18 }}>
                  {title}
                </AppText>
                {desc ? (
                  <AppText variant="muted" numberOfLines={3}>
                    {desc}
                  </AppText>
                ) : null}
                <View style={{ gap: spacing.sm }}>
                  {saleEnds ? (
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                    >
                      <Clock3 size={16} color={tokens.accent2} strokeWidth={2} />
                      <AppText variant="muted" style={{ flex: 1, fontSize: 13 }}>
                        {t("polyPub.salesUntil").replace("{date}", saleEnds)}
                      </AppText>
                    </View>
                  ) : null}
                  {eventAt ? (
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
                    >
                      <CalendarDays size={16} color={tokens.muted} strokeWidth={2} />
                      <AppText variant="muted" style={{ flex: 1, fontSize: 13 }}>
                        {t("polyPub.eventAt").replace("{date}", eventAt)}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                {/* Where the AZN price and the "Əldə et" CTA used to be: one
                    line of PLAIN TEXT, never a tappable link. A link in a
                    purchasing context is itself the 3.1.1 violation. */}
                <AppText variant="muted" style={{ fontSize: 13 }}>
                  {t("mob.oly.notInApp")}
                </AppText>
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function Pricing() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<PlanKey>("monthly");

  // The subjects_pricing read is gone with the amounts it fed; only the CMS
  // copy around the cards still comes from the server.
  const overridesQ = useContentOverrides(locale);
  const { refreshing, onRefresh } = usePullRefresh([overridesQ]);

  const popular = plan === "monthly";

  const planCard = (
    <Card
      variant={popular ? "flat" : "raised"}
      style={{
        gap: spacing.md,
        ...(popular ? { borderWidth: 0, borderRadius: radius.lg - 2 } : null),
      }}
    >
      {popular ? <Pill text={t("pricing2.popular")} /> : null}
      <AppText variant="title">{t(`pricing2.${plan}.name`)}</AppText>
      <AppText>{t(`pricing2.${plan}.desc`)}</AppText>

      <View style={{ gap: spacing.sm }}>
        {(["b1", "b2", "b3"] as const).map((b) => (
          <View
            key={b}
            style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}
          >
            <Check size={18} color={tokens.ok} strokeWidth={2.5} />
            <AppText style={{ flex: 1 }}>{t(`pricing2.${plan}.${b}`)}</AppText>
          </View>
        ))}
      </View>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("nav.pricing"),
          headerStyle: { backgroundColor: tokens.surface },
          headerTitleStyle: { color: tokens.text },
          headerTintColor: tokens.accent,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.lg,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            accessibilityLabel={t("mob.refreshing")}
          />
        }
      >
        <View style={{ gap: spacing.sm }}>
          <AppText variant="heading">{t("pricing2.title")}</AppText>
          <AppText variant="muted">{t("pricing2.sub")}</AppText>
        </View>

        <View style={{ alignItems: "center" }}>
          <Segmented<PlanKey>
            options={PLANS.map((p) => ({
              value: p.key,
              label: t(`pricing2.${p.key}.name`),
            }))}
            value={plan}
            onChange={setPlan}
          />
        </View>

        {popular ? (
          // Gradient border frame around the popular plan (plan §4-Public).
          <LinearGradient
            colors={[...gradients.brand]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: radius.lg, padding: 2 }}
          >
            {planCard}
          </LinearGradient>
        ) : (
          planCard
        )}

        {/* Subjects catalog cross-link (info surface, web /subjects parity). */}
        <Card style={{ paddingVertical: spacing.sm }}>
          <ListRow
            icon={<BookOpen size={20} color={tokens.accent} strokeWidth={2} />}
            title={t("nav.subjects")}
            subtitle={t("subjects.lead")}
            onPress={() => router.push("/(public)/subjects")}
          />
        </Card>

        <AppText variant="muted" style={{ fontSize: 12 }}>
          {t("pricing2.note")}
        </AppText>

        {/* Active olympiad packages — the shared public band, below the
            subscription plans (web /services parity). */}
        <PublicPackagesSection />
      </ScrollView>
    </View>
  );
}
