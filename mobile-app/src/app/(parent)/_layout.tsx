// Parent group root: the role guard + a Stack over the tab bar so full-screen
// flows (notifications, profile, add-child wizard, per-child screens) can push
// OVER the tabs (web parity: these pages are not tabs).
import React from "react";
import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/features/auth/authStore";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";

export default function ParentLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const { tokens } = useTheme();
  const { t } = useT();

  if (status !== "signedIn") return <Redirect href="/(public)/welcome" />;
  if (role === "student") return <Redirect href="/(student)/(tabs)/home" />;
  if (role !== "parent") return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokens.surface },
        headerTitleStyle: { color: tokens.text },
        headerTintColor: tokens.accent,
        contentStyle: { backgroundColor: tokens.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ title: t("notif.title") }} />
      <Stack.Screen name="profile" options={{ title: t("nav.profile") }} />
      <Stack.Screen name="news/[slug]" options={{ title: t("nav.news") }} />
      <Stack.Screen name="add-child" options={{ title: t("parent.dash.addChild") }} />
      <Stack.Screen name="children/[id]/edit" options={{ title: t("childedit.title") }} />
      <Stack.Screen name="children/[id]/subscribe" options={{ title: t("sub.title") }} />
    </Stack>
  );
}
