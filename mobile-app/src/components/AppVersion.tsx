// App-version footer (owner rule, 2026-07-26): the installed version is shown
// in the account sheet and read DYNAMICALLY from the build's own config —
// `Constants.expoConfig.version` is `expo.version` from app.json, baked into
// every binary AND into every EAS Update bundle, so it can never drift from
// what is actually running. Never hardcode a version string in UI.
//
// Deliberately version-only (no native build number): `expo-application`'s
// nativeBuildVersion would report Expo Go's own build while the owner tests in
// Expo Go, and the EAS-remote versionCode is visible in the EAS dashboard —
// showing it here would add a dependency to answer a question the dashboard
// already answers. runtimeVersion policy is "appVersion", so this string IS
// the runtime identity of the binary.
import React from "react";
import { View } from "react-native";
import Constants from "expo-constants";
import { AppText } from "./AppText";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";

export function AppVersion() {
  const { t } = useT();
  const version = Constants.expoConfig?.version ?? "";
  if (!version) return null;
  return (
    <View style={{ alignItems: "center", paddingTop: spacing.sm }}>
      <AppText variant="eyebrow">
        {`OlympIQ · ${t("mob.app.version").replace("{v}", version)}`}
      </AppText>
    </View>
  );
}
