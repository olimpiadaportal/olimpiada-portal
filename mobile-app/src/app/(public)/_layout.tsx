import React from "react";
import { Redirect, Stack, useRouter, useSegments } from "expo-router";
import { BackButton } from "@/components/BackButton";
import { useAuthStore } from "@/features/auth/authStore";
import { useTheme } from "@/theme/ThemeProvider";
import { useT } from "@/i18n/useT";

// Signed-in users are bounced only off the AUTH surfaces — the info screens
// (about/subjects/faq/contact/pricing/news) stay reachable in-session (profile
// help links, account-sheet INFO rows, /news/{slug} deep links all push them).
const AUTH_SCREENS = ["welcome", "login", "register"];

export default function PublicLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const segments = useSegments();
  const router = useRouter();
  const { tokens } = useTheme();
  const { t } = useT();

  // segments = ["(public)", "<screen>", ...]; treat unknown as an auth surface.
  const screen: string = segments[1] ?? "";
  if (status === "signedIn" && (role === "parent" || role === "student")) {
    const offLimits =
      screen === "" ||
      AUTH_SCREENS.includes(screen) ||
      // Children never see commerce: students are also bounced off pricing.
      (role === "student" && screen === "pricing");
    if (offLimits) {
      if (role === "parent") return <Redirect href="/(parent)/(tabs)/home" />;
      return <Redirect href="/(student)/(tabs)/home" />;
    }
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Chevron only. iOS otherwise labels the back button with the previous
        // scene's title. Adding headerBackTitleStyle here would silently
        // re-enable that label.
        headerBackButtonDisplayMode: "minimal",
        // A cross-group push (e.g. parent profile → FAQ) starts a fresh
        // (public) stack, so the native back button would not render; keep it
        // for in-stack pushes and fall back to a root-stack back arrow.
        headerBackVisible: true,
        headerLeft: ({ canGoBack, tintColor }) =>
          !canGoBack && router.canGoBack() ? (
            <BackButton
              label={t("nav.back")}
              onPress={() => router.back()}
              color={tintColor ?? tokens.accent}
            />
          ) : null,
      }}
    />
  );
}
