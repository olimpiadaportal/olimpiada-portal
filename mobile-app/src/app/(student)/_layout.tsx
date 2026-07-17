// Student group root: the role guard + a Stack over the arena tab bar so
// full-screen flows (notifications, profile, the test setup/runner/result/
// review chain) push OVER the tabs — mirrors the parent group structure.
// Chrome colors come from the palette-aware useArena() hook (the child's
// chosen light-mode palette once the student row loads; default until then).
// Test-chain screens draw their own immersive headers (runner top bar), so the
// stack header is hidden for them.
import React from "react";
import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/features/auth/authStore";
import { useArena } from "@/features/arena/useArena";
import { useT } from "@/i18n/useT";

export default function StudentLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const { arena } = useArena();
  const { t } = useT();

  if (status !== "signedIn") return <Redirect href="/(public)/welcome" />;
  if (role === "parent") return <Redirect href="/(parent)/(tabs)/home" />;
  if (role !== "student") return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: arena.panel },
        headerTitleStyle: { color: arena.ink },
        headerTintColor: arena.lime,
        contentStyle: { backgroundColor: arena.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ title: t("notif.title") }} />
      <Stack.Screen name="profile" options={{ title: t("drawer.profileBtn") }} />
      <Stack.Screen name="news/[slug]" options={{ title: t("nav.news") }} />
      <Stack.Screen name="test/[subjectId]" options={{ headerShown: false }} />
      <Stack.Screen name="test/run/[attemptId]" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="test/result/[attemptId]" options={{ headerShown: false }} />
      <Stack.Screen name="test/review/[attemptId]" options={{ headerShown: false }} />
    </Stack>
  );
}
