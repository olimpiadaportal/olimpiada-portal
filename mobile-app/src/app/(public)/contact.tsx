// Public Contact (web /contact parity, no map on mobile v1): support email and
// phone come from the admin control plane (get_mobile_config contact.*), tap
// opens mailto:/tel:. Social links render only when configured, open
// externally, and must be http(s) — config values are display data, never
// blindly-openable URLs.
import React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mail, MapPin, Phone } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { ListRow } from "@/components/ListRow";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useMobileConfig } from "@/lib/configQueries";
import { useT } from "@/i18n/useT";

const SOCIALS = [
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
] as const;

function isHttpUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

export default function Contact() {
  const { t } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const config = useMobileConfig();

  const email = config.data?.contact.email ?? "";
  const phone = config.data?.contact.phone ?? "";
  const socials = SOCIALS.map((s) => ({
    ...s,
    url: config.data?.social[s.key] ?? "",
  })).filter((s) => s.url.length > 0 && isHttpUrl(s.url));

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("nav.contact"),
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
          <AppText variant="heading">{t("contact.title")}</AppText>
          <AppText variant="muted">{t("contact.lead")}</AppText>
        </View>

        {config.isPending ? (
          <Card style={{ gap: spacing.md }}>
            <Skeleton height={14} width="30%" />
            <Skeleton height={18} width="60%" />
            <Skeleton height={14} width="30%" />
            <Skeleton height={18} width="50%" />
          </Card>
        ) : config.isError ? (
          <ErrorRetry
            message={t("mob.boot.error")}
            retryLabel={t("mob.retry")}
            onRetry={() => void config.refetch()}
          />
        ) : (
          <Card style={{ gap: spacing.sm }}>
            {email ? (
              <ListRow
                icon={<Mail size={20} color={tokens.accent} strokeWidth={2} />}
                title={t("contact.emailLabel")}
                subtitle={email}
                onPress={() => void Linking.openURL(`mailto:${email}`)}
              />
            ) : null}
            {phone ? (
              <ListRow
                icon={<Phone size={20} color={tokens.accent} strokeWidth={2} />}
                title={t("contact.phoneLabel")}
                subtitle={phone}
                onPress={() => void Linking.openURL(`tel:${phone.replace(/\s+/g, "")}`)}
              />
            ) : null}
            <ListRow
              icon={<MapPin size={20} color={tokens.accent} strokeWidth={2} />}
              title={t("contact.address")}
              subtitle={t("contact.addressValue")}
            />
            <AppText variant="muted">{t("contact.shortNote")}</AppText>
          </Card>
        )}

        {socials.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {socials.map((s) => (
              <Pressable
                key={s.key}
                accessibilityRole="link"
                accessibilityLabel={s.label}
                onPress={() => void Linking.openURL(s.url)}
                style={({ pressed }) => ({
                  backgroundColor: tokens.pillBg,
                  borderRadius: 999,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.lg,
                  minHeight: 36,
                  justifyContent: "center",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <AppText variant="label" color={tokens.pillText}>
                  {s.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
