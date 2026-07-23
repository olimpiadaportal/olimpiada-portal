// Public pricing / SERVICES (web /services parity): pricing2.* copy, one plan
// card per interval behind a Segmented switcher (the clean mobile pattern for
// three dense cards), real per-subject prices from subjects_pricing, trial
// line gated by the launch_promo flag, fixed sibling-discount callout, and the
// active-olympiad-packages band (anon get_public_olympiad_packages RPC — the
// same server-filtered rows as the web landing/services section). Prices are
// display-only — checkout always reprices server-side.
// Redesign (plan §4-Public): the popular interval gets a gradient border +
// "Populyar" pill, per-subject rows carry lucide subject glyphs, the CTA is
// the screen's one gradient button, the disclaimer stays a muted footnote.
import React, { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  BookOpen,
  Brain,
  Calculator,
  CalendarDays,
  Check,
  CircleHelp,
  Clock3,
  FlaskConical,
  Languages,
  Trophy,
  type LucideIcon,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ListRow } from "@/components/ListRow";
import { Segmented } from "@/components/Segmented";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, spacing } from "@/theme/tokens";
import {
  fetchPublicOlympiadPackages,
  fetchSubjectsPricing,
  type PublicOlympiadPackage,
  type SubjectPricingRow,
} from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { useContentOverrides, useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useT } from "@/i18n/useT";
import type { Locale } from "@/i18n";
import { subjectLabel } from "@/lib/subjectLabel";
import { formatGradeLabel, formatGradeRangeLabel } from "@/lib/gradeLabel";
import { useAuthStore } from "@/features/auth/authStore";

const PRICING_STALE_MS = 5 * 60_000;

const PLANS = [
  { key: "weekly", interval: "week" },
  { key: "monthly", interval: "month" },
  { key: "yearly", interval: "year" },
] as const;

type PlanKey = (typeof PLANS)[number]["key"];

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** Best-effort subject glyph from the localized subject name (display only). */
function subjectIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/riyaz|math|мат/.test(n)) return Calculator;
  if (/elm|science|təbiət|наук|естеств/.test(n)) return FlaskConical;
  if (/məntiq|mentiq|logic|логик/.test(n)) return Brain;
  if (/ingilis|english|англ|dil|language/.test(n)) return Languages;
  return BookOpen;
}

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

const INTL_LOCALE: Record<Locale, string> = { az: "az-AZ", en: "en-GB", ru: "ru-RU" };

/** Sale/event deadlines are DATE-ONLY in the product's home timezone. */
function pkgDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      timeZone: "Asia/Baku",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(ts));
  } catch {
    return iso.slice(0, 10);
  }
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
      }}
    >
      {icon}
      <AppText variant="label" color={tokens.chipText} style={{ fontSize: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

function PublicPackagesSection() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const router = useRouter();
  const role = useAuthStore((s) => s.role);
  const status = useAuthStore((s) => s.status);

  const q = useQuery({
    queryKey: ["public-oly-packages"],
    queryFn: fetchPublicOlympiadPackages,
    enabled: isSupabaseConfigured,
    staleTime: PKG_STALE_MS,
  });

  // CTA auth state picks the TARGET only (web parity): signed out → register,
  // parent → the olympiads tab (which re-gates server-side). Students never
  // see commerce — no CTA for a student session (this screen is deep-link
  // blocked for them anyway).
  const isParent = status === "signedIn" && role === "parent";
  const showCta = isParent || status === "signedOut";
  const onCta = () =>
    isParent
      ? router.push("/(parent)/(tabs)/olympiads")
      : router.push("/(public)/register");
  const ctaLabel = isParent ? t("polyPub.ctaParent") : t("polyPub.cta");

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
            const price = Number(r.price_amount ?? 0);
            const priceText =
              price > 0 ? `${price} ${r.currency ?? "AZN"}` : t("poly.free");
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
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing.md,
                  }}
                >
                  <AppText variant="mono" color={tokens.accent} style={{ fontSize: 18, fontWeight: "700" }}>
                    {priceText}
                  </AppText>
                  {showCta ? (
                    <Button
                      title={ctaLabel}
                      style={{ minHeight: 44, paddingVertical: spacing.sm }}
                      onPress={onCta}
                    />
                  ) : null}
                </View>
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

  const config = useMobileConfig();
  const promoOn = config.data?.flags.launchPromo === true;

  const q = useQuery({
    queryKey: ["subjects-pricing"],
    queryFn: fetchSubjectsPricing,
    enabled: isSupabaseConfigured,
    staleTime: PRICING_STALE_MS,
  });

  // Prices, the promo flag and the surrounding CMS copy are three separate
  // reads — a pull that skipped one would show a half-updated price page.
  const overridesQ = useContentOverrides(locale);
  const { refreshing, onRefresh } = usePullRefresh([q, config, overridesQ]);

  const interval = PLANS.find((p) => p.key === plan)?.interval ?? "month";
  const rows: SubjectPricingRow[] = (q.data ?? [])
    .filter((r) => r.interval === interval)
    .sort((a, b) => (a.subject?.name ?? "").localeCompare(b.subject?.name ?? ""));
  const minAmount = rows.length > 0 ? Math.min(...rows.map((r) => r.amount)) : null;
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
      {minAmount !== null ? (
        <View style={{ gap: 2 }}>
          <AppText variant="display" color={tokens.accent}>
            {t(`pricing2.${plan}.price`).replace("{price}", formatAmount(minAmount))}
          </AppText>
          <AppText variant="muted">{t(`pricing2.${plan}.per`)}</AppText>
        </View>
      ) : null}
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

      {rows.length > 0 ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: tokens.border,
            paddingTop: spacing.md,
            gap: spacing.sm,
          }}
        >
          {rows.map((r) => {
            const Icon = subjectIcon(r.subject?.name ?? "");
            return (
              <View
                key={r.subject_id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  minHeight: 32,
                }}
              >
                <Icon size={18} color={tokens.accent} strokeWidth={2} />
                <AppText style={{ flex: 1 }}>
                  {subjectLabel(t, r.subject?.code, r.subject?.name)}
                </AppText>
                <AppText variant="mono" color={tokens.accent}>
                  {formatAmount(r.amount)} {r.currency}
                </AppText>
              </View>
            );
          })}
          <AppText variant="muted" style={{ fontSize: 12 }}>
            {t("pricing.perSubjectNote")}
          </AppText>
        </View>
      ) : null}

      <Button
        title={t(`pricing2.${plan}.cta`)}
        variant="gradient"
        onPress={() => router.push("/(public)/register")}
      />
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

        {promoOn ? (
          <Card style={{ borderColor: tokens.accent }}>
            <AppText>{t("pricing.trialLine")}</AppText>
          </Card>
        ) : null}

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

        {q.isPending && isSupabaseConfigured ? (
          <Card style={{ gap: spacing.md }}>
            <Skeleton height={22} width="40%" />
            <Skeleton height={28} width="55%" />
            <Skeleton height={14} />
            <Skeleton height={14} width="80%" />
            <Skeleton height={14} width="70%" />
          </Card>
        ) : q.isError && !q.data ? (
          <ErrorRetry
            message={t("mob.boot.error")}
            retryLabel={t("mob.retry")}
            onRetry={() => void q.refetch()}
          />
        ) : popular ? (
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

        <Card style={{ gap: spacing.sm }}>
          <AppText variant="label">{t("pricing2.sibling.title")}</AppText>
          <AppText variant="muted">{t("pricing2.sibling.body")}</AppText>
        </Card>

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
