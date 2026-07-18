// Public Subjects catalog (web /subjects parity): the synced subjects.* copy —
// title, lead, one card per launch subject (fixed subject.* catalog keys, the
// same four the web page renders) and the per-subject pricing footnote.
// Styled like the other info screens (about/pricing): themed native header,
// simple scroll of cards; viewable in-session by BOTH roles (informational,
// not commerce).
import React from "react";
import { ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Brain,
  Calculator,
  FlaskConical,
  Languages,
  type LucideIcon,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";

// The web page's fixed catalog cards (subject.* keys are synced ×3).
const SUBJECTS: { key: string; Icon: LucideIcon }[] = [
  { key: "subject.math", Icon: Calculator },
  { key: "subject.science", Icon: FlaskConical },
  { key: "subject.logic", Icon: Brain },
  { key: "subject.english", Icon: Languages },
];

export default function Subjects() {
  const { t } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

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
      >
        <View style={{ gap: spacing.sm }}>
          <AppText variant="display">{t("subjects.title")}</AppText>
          <AppText variant="muted">{t("subjects.lead")}</AppText>
        </View>

        {SUBJECTS.map(({ key, Icon }) => (
          <Card
            key={key}
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
              {t(key)}
            </AppText>
          </Card>
        ))}

        <AppText variant="muted" style={{ fontSize: 12 }}>
          {t("subjects.note")}
        </AppText>
      </ScrollView>
    </View>
  );
}
