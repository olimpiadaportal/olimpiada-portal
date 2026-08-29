// Full-screen boot states: splash, maintenance (admin-driven), force-update
// (admin-driven) and the unknown-role escape — plus the one NON-blocking
// member of the family, UpdateAvailableOverlay, which paints over a mounted
// navigator instead of replacing it. All localized; admin messages come
// per-locale from get_mobile_config(). Redesign (plan §4-Boot): BrandMark + a
// thin gradient accent bar, lucide glyph chips, one clear CTA. Fast — no
// animation gating.
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Download, Wrench } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorRetry } from "@/components/StatusViews";
import { useTheme } from "@/theme/ThemeProvider";
import { gradients, radius, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";
import type { TriMessage } from "@/lib/mobileConfig";
import type { Locale } from "@/i18n";

function pickMessage(msg: TriMessage, locale: Locale): string {
  return msg[locale] || msg.az || "";
}

/**
 * Linking.openURL REJECTS when nothing on the device claims the URL (a store
 * app that is missing or disabled). Unguarded — as this was — it is an
 * unhandled promise rejection and a DEAD TAP, and on the force screen that tap
 * is the only control there is: the Stack is not mounted, so there is no back
 * either. Same guard as (public)/contact.tsx; the caller surfaces the failure.
 */
async function openStore(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
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
  // These screens replace the whole navigator, so nothing else is applying
  // insets for them: a flat padding put the title under the notch and the CTA
  // under the home indicator on tall content. Same treatment as LockOverlay.
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: spacing.xxl,
        paddingTop: insets.top + spacing.xxl,
        paddingBottom: insets.bottom + spacing.xxl,
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
  // A device that cannot open the store URL used to look like a broken button.
  // Say so, and clear it on the next attempt.
  const [openFailed, setOpenFailed] = useState(false);
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
          onPress={() => {
            void openStore(storeUrl).then((ok) => setOpenFailed(!ok));
          }}
        />
      ) : null}
      {openFailed ? (
        <AppText variant="muted" color={tokens.danger} style={{ textAlign: "center" }}>
          {t("mob.update.openFailed")}
        </AppText>
      ) : null}
    </CenteredShell>
  );
}

/**
 * The OPTIONAL, skippable update prompt.
 *
 * Rendered as an OVERLAY on top of a mounted Stack (RootGate), never as a
 * returned screen: every blocking gate above returns INSTEAD of the navigator,
 * which unmounts navigation and kills Android back — correct for a mandatory
 * update, wrong for a suggestion. Whether it shows at all is decided by
 * shouldPromptOptionalUpdate() in lib/updatePrompt.ts.
 *
 * It deliberately does NOT render the admin-authored `message`. There is only
 * ONE message triple per platform in mobile_app_versions, and it is written for
 * the MANDATORY case ("this version is no longer supported") — printing that
 * above a "Later" button would contradict itself and read as a threat. The soft
 * nudge in the release runbook is "raise latest_version only", with no message
 * edit, so compiled trilingual copy is the honest source here. If the table ever
 * grows a separate optional message, wire it in then.
 */
export function UpdateAvailableOverlay({
  storeUrl,
  onLater,
}: {
  storeUrl: string;
  onLater: () => void;
}) {
  const { t } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [openFailed, setOpenFailed] = useState(false);

  // Android hardware back DISMISSES this (it is skippable) instead of popping
  // the screen underneath it, which the user cannot see or reach right now.
  // Held in a ref so the subscription survives RootGate's re-renders (the
  // config poll re-creates the onLater closure every 30 s).
  const onLaterRef = useRef(onLater);
  onLaterRef.current = onLater;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onLaterRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: "rgba(0,0,0,0.45)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}
    >
      <Card
        variant="hero"
        style={{
          width: "100%",
          maxWidth: 420,
          alignItems: "center",
          gap: spacing.lg,
        }}
      >
        <GlyphChip>
          <Download size={30} color={tokens.accent} strokeWidth={2} />
        </GlyphChip>
        <AppText variant="title" style={{ textAlign: "center" }}>
          {t("mob.updateAvailable.title")}
        </AppText>
        <AppText variant="muted" style={{ textAlign: "center" }}>
          {t("mob.updateAvailable.body")}
        </AppText>
        {openFailed ? (
          <AppText variant="muted" color={tokens.danger} style={{ textAlign: "center" }}>
            {t("mob.update.openFailed")}
          </AppText>
        ) : null}
        <Button
          title={t("mob.updateAvailable.cta")}
          variant="gradient"
          style={{ alignSelf: "stretch" }}
          onPress={() => {
            void openStore(storeUrl).then((ok) => setOpenFailed(!ok));
          }}
        />
        <Button
          title={t("mob.updateAvailable.later")}
          variant="ghost"
          style={{ alignSelf: "stretch" }}
          onPress={onLater}
        />
      </Card>
    </View>
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
