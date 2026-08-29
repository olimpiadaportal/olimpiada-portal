// Public Subjects catalog (web /subjects parity): the synced subjects.* copy —
// title, lead, one card per PUBLISHED subject, and the per-subject footnote.
// Styled like the other info screens (about/pricing): themed native header,
// simple scroll of cards; viewable in-session by BOTH roles (informational,
// not commerce).
//
// THE LIST COMES FROM THE DATABASE. It used to be four fixed subject.* keys —
// "the same four the web page renders" — so a subject an admin created and
// published could never reach this screen, and two of those four keys named
// subjects that do not exist as codes (the live rows are `elm` and
// `az_language`). Admin → Subjects is the single source of truth; `status =
// 'active'` is the admin's own publish switch.
//
// PURCHASE-SILENT, and this is where the temptation lives: the natural next
// card line is a price. There is none, and there must not be one — no AZN
// figure, no buy verb, no olympiq.ai link (docs/STORE_PAYMENTS_COMPLIANCE.md
// §4/§5). The screen answers "what does OlympIQ teach", nothing else.
import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  Code,
  FlaskConical,
  Languages,
  type LucideIcon,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useContentOverrides } from "@/lib/configQueries";
import { fetchActiveSubjects } from "@/lib/data";
import { subjectLabel } from "@/lib/subjectLabel";
import { usePullRefresh } from "@/lib/usePullRefresh";
import { useT } from "@/i18n/useT";

// Decoration only, keyed on the REAL codes — and the codes are legacy and lie:
// `az_language` is Məntiq (Logic) and `elm` is Elm (Science), so nothing here
// may infer a subject from the look of its code. A code minted later by the
// admin panel's slugifier simply falls through to the neutral default, which is
// why the map may never be the thing that decides whether a card renders.
const ICONS: Record<string, LucideIcon> = {
  math: Calculator,
  elm: FlaskConical,
  az_language: Brain,
  english: Languages,
  informatics: Code,
  fizika: Atom,
  azerbaycan_dili: BookOpen,
};

export default function Subjects() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  // The copy is CMS-overridable; the catalog is admin-managed. Both are live
  // data on this screen, so both are handed to the pull.
  const overridesQ = useContentOverrides(locale);
  const subjectsQ = useQuery({
    queryKey: ["catalog", "public-subjects"],
    // Called through an arrow, never by reference: React Query passes its
    // CONTEXT object as the first argument, and an explicit `null` is what
    // tells fetchActiveSubjects to skip the grade rule. This screen is the
    // public catalog of what the platform teaches, not an offer to one child.
    queryFn: () => fetchActiveSubjects(null),
  });
  const { refreshing, onRefresh } = usePullRefresh([overridesQ, subjectsQ]);

  const subjects = (subjectsQ.data ?? [])
    .map((s) => ({ id: s.id, label: subjectLabel(t, s.code, s.name), Icon: ICONS[s.code ?? ""] ?? BookOpen }))
    // Sorted on the RESOLVED label: the catalog stores Azerbaijani names, so
    // ordering in SQL would hand an English or Russian reader someone else's
    // alphabet.
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("nav.subjects"),
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
          <AppText variant="display">{t("subjects.title")}</AppText>
          <AppText variant="muted">{t("subjects.lead")}</AppText>
        </View>

        {subjects.map(({ id, label, Icon }) => (
          <Card
            key={id}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.md,
                backgroundColor: tokens.chipBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon size={22} color={tokens.accent} strokeWidth={2} />
            </View>
            <AppText variant="title" style={{ flex: 1 }}>
              {label}
            </AppText>
          </Card>
        ))}

        {/* Only once the read has actually finished — a "no subjects" line
            flashed during the first load reads as an outage. */}
        {!subjectsQ.isPending && subjects.length === 0 ? (
          <AppText variant="muted">{t("cfg.noSubjects")}</AppText>
        ) : null}

        <AppText variant="muted" style={{ fontSize: 12 }}>
          {t("subjects.note")}
        </AppText>
      </ScrollView>
    </View>
  );
}
