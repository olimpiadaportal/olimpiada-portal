// Full-screen boot states: splash, maintenance (admin-driven), force-update
// (admin-driven) and the unknown-role escape. All localized; admin messages
// come per-locale from get_mobile_config().
import React from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { ErrorRetry } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import type { TriMessage } from "@/lib/mobileConfig";
import type { Locale } from "@/i18n";

function pickMessage(msg: TriMessage, locale: Locale): string {
  return msg[locale] || msg.az || "";
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.xxl,
        gap: spacing.xl,
      }}
    >
      {children}
    </View>
  );
}

export function SplashView() {
  const { tokens } = useTheme();
  return (
    <CenteredShell>
      <BrandMark size={64} />
      <ActivityIndicator color={tokens.accent} />
    </CenteredShell>
  );
}

export function BootErrorView({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  return (
    <CenteredShell>
      <BrandMark size={56} />
      <ErrorRetry message={t("mob.boot.error")} retryLabel={t("mob.retry")} onRetry={onRetry} />
    </CenteredShell>
  );
}

export function MaintenanceScreen({ message, locale }: { message: TriMessage; locale: Locale }) {
  const { t } = useT();
  const body = pickMessage(message, locale);
  return (
    <CenteredShell>
      <BrandMark size={56} />
      <AppText variant="title" style={{ textAlign: "center" }}>
        {t("maintenance.title")}
      </AppText>
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {body || t("maintenance.body")}
      </AppText>
    </CenteredShell>
  );
}

export function ForceUpdateScreen({
  message,
  storeUrl,
  locale,
}: {
  message: TriMessage;
  storeUrl: string;
  locale: Locale;
}) {
  const { t } = useT();
  const body = pickMessage(message, locale);
  const canOpenStore = storeUrl.startsWith("https://");
  return (
    <CenteredShell>
      <BrandMark size={56} />
      <AppText variant="title" style={{ textAlign: "center" }}>
        {t("mob.update.title")}
      </AppText>
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {body || t("mob.update.body")}
      </AppText>
      {canOpenStore ? (
        <Button title={t("mob.update.cta")} onPress={() => Linking.openURL(storeUrl)} />
      ) : null}
    </CenteredShell>
  );
}

export function UnknownRoleScreen({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const { t } = useT();
  return (
    <CenteredShell>
      <BrandMark size={56} />
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {t("mob.boot.error")}
      </AppText>
      <Button title={t("mob.retry")} onPress={onRetry} variant="ghost" />
      <Button title={t("drawer.logout")} onPress={onSignOut} variant="danger" />
    </CenteredShell>
  );
}
