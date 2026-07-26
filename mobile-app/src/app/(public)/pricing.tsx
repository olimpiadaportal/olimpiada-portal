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
  Cpu,
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
import { formatLongDate } from "@/lib/formatDate";
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

/** Subject glyph keyed by the canonical machine `code` (the same value the
 *  subjectLabel `subj.<code>` keys switch on); the old name regex survives
 *  only as a last-resort fallback for unknown codes. Display only. */
function subjectIcon(code: string | null | undefined, name: string): LucideIcon {
  switch (code) {
    case "math":
      return Calculator;
    case "science":
      return FlaskConical;
    case "logic":
      return Brain;
    case "english":
    case "az_language":
      return Languages;
    case "informatics":
      return Cpu;
  }
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

function PublicPackagesSection({ paymentsOff }: { paymentsOff: boolean }) {
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
                {/* Payments off (admin kill-switch / unloaded config): the
                    package stays browsable, but the price chip and the CTA
                    are money UI and disappear together. */}
                {!paymentsOff ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: spacing.md,
                    }}
                  >
                    {/* The amount never truncates — the CTA shrinks instead. */}
                    <AppText
                      variant="mono"
                      color={tokens.accent}
                      style={{ fontSize: 18, fontWeight: "700", flexShrink: 0 }}
                    >
                      {priceText}
                    </AppText>
                    {showCta ? (
                      <Button
                        title={ctaLabel}
                        style={{
                          minHeight: 44,
                          paddingVertical: spacing.sm,
                          flexShrink: 1,
                        }}
                        onPress={onCta}
                      />
                    ) : null}
                  </View>
                ) : null}
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
  // Payment-mode gate (web /services + parent-tab GateNotice parity): "off"
  // hides every money surface on this screen. Money UI fails CLOSED — a
  // failed/unloaded config (undefined mode) gates exactly like the admin
  // kill-switch.
  const paymentsOff = (config.data?.payment.mode ?? "off") === "off";

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

  // One boot state for prices + config: while it lasts the skeleton renders
  // and the gate notice stays back (no flash before the mode is known).
  const booting = (q.isPending || config.isPending) && isSupabaseConfigured;

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
      {/* Money UI (price line, per-subject prices, register CTA) hides as one
          block while payments are off; the plan description stays browsable. */}
      {minAmount !== null && !paymentsOff ? (
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

      {rows.length > 0 && !paymentsOff ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: tokens.border,
            paddingTop: spacing.md,
            gap: spacing.sm,
          }}
        >
          {rows.map((r) => {
            const Icon = subjectIcon(r.subject?.code, r.subject?.name ?? "");
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

      {!paymentsOff ? (
        <Button
          title={t(`pricing2.${plan}.cta`)}
          variant="gradient"
          onPress={() => router.push("/(public)/register")}
        />
      ) : null}
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

        {/* The one gate notice for the whole screen when payments are off. */}
        {paymentsOff && !booting ? (
          <Card>
            <AppText variant="muted">{t("gate.paymentsOff")}</AppText>
          </Card>
        ) : null}

        {/* The trial line is a billing promise — it hides with the rest of
            the money UI while payments are off. */}
        {promoOn && !paymentsOff ? (
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

        {booting ? (
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

        {/* Sibling discount = pricing copy → gated with the rest of it. */}
        {!paymentsOff ? (
          <Card style={{ gap: spacing.sm }}>
            <AppText variant="label">{t("pricing2.sibling.title")}</AppText>
            <AppText variant="muted">{t("pricing2.sibling.body")}</AppText>
          </Card>
        ) : null}

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
        <PublicPackagesSection paymentsOff={paymentsOff} />
      </ScrollView>
    </View>
  );
}
