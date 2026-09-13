// Parent group root: the role guard + a Stack over the tab bar so full-screen
// flows (notifications, profile, add-child wizard, per-child screens) can push
// OVER the tabs (web parity: these pages are not tabs).
import React from "react";
import { Redirect, Stack, useRouter } from "expo-router";
import { BackButton } from "@/components/BackButton";
import { useAuthStore } from "@/features/auth/authStore";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";
import { backOrTo } from "@/lib/navigation";

// Anchor the stack on the tabs: a cold deep link (push tap, OS link) straight
// into a secondary screen otherwise mounts it as the stack ROOT — no native
// back arrow, no tab bar, nowhere to go. With the anchor the tabs always sit
// beneath, so every secondary screen keeps its top-left back affordance.
export const unstable_settings = { anchor: "(tabs)" };

export default function ParentLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const router = useRouter();
  const { tokens } = useTheme();
  const { t } = useT();

  if (status !== "signedIn") return <Redirect href="/(public)/welcome" />;
  if (role === "student") return <Redirect href="/(student)/(tabs)/home" />;
  if (role !== "parent") return <Redirect href="/" />;

  const secondary = (title: string) => ({
    title,
    headerBackVisible: false,
    headerLeft: () => (
      <BackButton
        label={t("nav.back")}
        color={tokens.accent}
        onPress={() => backOrTo(router, "/(parent)/(tabs)/home")}
      />
    ),
  });

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokens.surface },
        headerTitleStyle: { color: tokens.text },
        headerTintColor: tokens.accent,
        // Chevron only. iOS otherwise labels the back button with the previous
        // scene's title — "(tabs)" for a push out of the tab group. Adding
        // headerBackTitleStyle here would silently re-enable that label.
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: tokens.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={secondary(t("notif.title"))} />
      <Stack.Screen name="leaderboard" options={secondary(t("lb.title"))} />
      <Stack.Screen name="profile" options={secondary(t("nav.profile"))} />
      <Stack.Screen name="news/[slug]" options={secondary(t("nav.news"))} />
      <Stack.Screen name="add-child" options={secondary(t("parent.dash.addChild"))} />
      <Stack.Screen name="link-child" options={secondary(t("link.title"))} />
      <Stack.Screen name="children/[id]/edit" options={secondary(t("childedit.title"))} />
      <Stack.Screen name="children/[id]/subscribe" options={secondary(t("sub.title"))} />
    </Stack>
  );
}
