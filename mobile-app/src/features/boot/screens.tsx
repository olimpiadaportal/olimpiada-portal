// Full-screen boot states: splash, maintenance (admin-driven), force-update
// (admin-driven) and the unknown-role escape. All localized; admin messages
// come per-locale from get_mobile_config(). Redesign (plan §4-Boot): BrandMark
// + a thin gradient accent bar, lucide glyph chips, one clear CTA. Fast — no
// animation gating.
import React from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Download, Wrench } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { ErrorRetry } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import type { TriMessage } from "@/lib/mobileConfig";
import type { Locale } from "@/i18n";

function pickMessage(msg: TriMessage, locale: Locale): string {
  return msg[locale] || msg.az || "";
}

function AccentBar() {
  return (
    <LinearGradient
      colors={[...gradients.brand]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ width: 56, height: 4, borderRadius: 2 }}
    />
  );
}

function GlyphChip({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        width: 64,
        height: 64,
        borderRadius: radius.md,
        backgroundColor: tokens.chipBg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
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
      <AccentBar />
      <ActivityIndicator color={tokens.accent} />
    </CenteredShell>
  );
}

export function BootErrorView({ onRetry }: { onRetry: () => void }) {
  const { t } = useT();
  return (
    <CenteredShell>
      <BrandMark size={56} />
      <AccentBar />
      <ErrorRetry message={t("mob.boot.error")} retryLabel={t("mob.retry")} onRetry={onRetry} />
    </CenteredShell>
  );
}

export function MaintenanceScreen({ message, locale }: { message: TriMessage; locale: Locale }) {
  const { t } = useT();
  const { tokens } = useTheme();
  const body = pickMessage(message, locale);
  return (
    <CenteredShell>
      <BrandMark size={56} />
      <GlyphChip>
        <Wrench size={30} color={tokens.muted} strokeWidth={2} />
      </GlyphChip>
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
  const { tokens } = useTheme();
  const body = pickMessage(message, locale);
  const canOpenStore = storeUrl.startsWith("https://");
  return (
    <CenteredShell>
      <BrandMark size={56} />
      <GlyphChip>
        <Download size={30} color={tokens.accent} strokeWidth={2} />
      </GlyphChip>
      <AppText variant="title" style={{ textAlign: "center" }}>
        {t("mob.update.title")}
      </AppText>
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {body || t("mob.update.body")}
      </AppText>
      {canOpenStore ? (
        <Button
          title={t("mob.update.cta")}
          variant="gradient"
          onPress={() => Linking.openURL(storeUrl)}
        />
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
      <AccentBar />
      <AppText variant="muted" style={{ textAlign: "center" }}>
        {t("mob.boot.error")}
      </AppText>
      <Button title={t("mob.retry")} onPress={onRetry} variant="ghost" />
      <Button title={t("drawer.logout")} onPress={onSignOut} variant="danger" />
    </CenteredShell>
  );
}
