// Public pricing (web /pricing parity): pricing2.* copy, one plan card per
// interval behind a Segmented switcher (the clean mobile pattern for three
// dense cards), real per-subject prices from subjects_pricing, trial line
// gated by the launch_promo flag, fixed sibling-discount callout. Prices are
// display-only — checkout always reprices server-side.
// Redesign (plan §4-Public): the popular interval gets a gradient border +
// "Populyar" pill, per-subject rows carry lucide subject glyphs, the CTA is
// the screen's one gradient button, the disclaimer stays a muted footnote.
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  BookOpen,
  Brain,
  Calculator,
  Check,
  FlaskConical,
  Languages,
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
import { fetchSubjectsPricing, type SubjectPricingRow } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { useMobileConfig } from "@/lib/configQueries";
import { useT } from "@/i18n/useT";
import { subjectLabel } from "@/lib/subjectLabel";

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

export default function Pricing() {
  const { t } = useT();
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
      </ScrollView>
    </View>
  );
}
