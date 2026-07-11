import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { BrandMark } from "@/components/BrandMark";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";

export default function Welcome() {
  const router = useRouter();
  const { t } = useT();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.xl }}>
        <View style={{ alignItems: "center", gap: spacing.lg }}>
          <BrandMark size={72} />
          <AppText variant="muted" style={{ textAlign: "center" }}>
            {t("mob.welcome.tagline")}
          </AppText>
        </View>
        <View style={{ gap: spacing.md }}>
          <Button title={t("nav.login")} onPress={() => router.push("/(public)/login")} />
          <Button
            title={t("mob.welcome.studentLogin")}
            variant="ghost"
            onPress={() => router.push("/(public)/login?tab=student")}
          />
          <Button
            title={t("nav.register")}
            variant="ghost"
            onPress={() => router.push("/(public)/register")}
          />
          {__DEV__ ? (
            <Button
              title={t("mob.gallery.title")}
              variant="ghost"
              onPress={() => router.push("/gallery")}
            />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
