// Public Contact (web /contact parity): support email and phone come from the
// admin control plane (get_mobile_config contact.*), tap opens mailto:/tel:.
// The address block mirrors web's ContactInfo — the row shows the configured
// address (hidden when unset) and the map below it always renders, using the
// admin's precise pin (contact.map_query) when there is one, else the address,
// else the shared fallback. Tapping either opens directions in the device's
// maps app. Social links render only when configured, open externally, and
// must be http(s) — config values are display data, never blindly-openable
// URLs.
//
// Migration 117 withdrew the "Report a bug" sheet that used to sit below the
// addresses: the platform has ONE reports section (question reports, filed from
// inside an attempt and triaged in the admin panel) and no report sends mail.
// These mailto/tel rows are now the only inbound channel on this screen.
//
// ROLE GATE (2026-09-22, Google Play Families): this screen is reachable from
// the account sheet in a CHILD session, and the socials, the WhatsApp row and
// the maps hand-off all lead OUT of the app to content nobody here moderates.
// The declared target audience includes children, so those three surfaces now
// render for a parent (an adult, with real support channels to keep) or a
// signed-out visitor only — the same role gate /pricing already carries, via
// outboundLinksAllowed(). The email and phone rows stay for everyone: they
// reach this operator's own inboxes, not a network of strangers.
import React, { useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { CmsProse } from "@/components/CmsProse";
import { ListRow } from "@/components/ListRow";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { ContactMap, buildDirectionsUrl, resolveMapQuery } from "@/features/public/ContactMap";
import { useAuthStore } from "@/features/auth/authStore";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
import { outboundLinksAllowed } from "@/lib/outboundLinks";
import { useContentOverrides, useMobileConfig } from "@/lib/configQueries";
import { usePullRefresh } from "@/lib/usePullRefresh";
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

/**
 * Linking.openURL REJECTS when nothing on the device claims the scheme (a
 * tablet with no dialer, a phone with no mail client). Unguarded it becomes an
 * unhandled promise rejection and a dead tap, so every hand-off goes through
 * here and reports whether the OS actually took it.
 */
async function openExternal(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export default function Contact() {
  const { t, locale } = useT();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const config = useMobileConfig();
  // The role gate. Read from the session store, exactly like the `(public)`
  // layout's pricing bounce — never from a prop or a config flag, because the
  // thing being gated is who is holding the phone.
  const authStatus = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const canLeaveApp = outboundLinksAllowed(authStatus, role);
  const [mapsAppFailed, setMapsAppFailed] = useState(false);
  // A device with no mail/phone/WhatsApp handler rejects the scheme, which used
  // to look like a dead row. Surface it once, and clear it on the next attempt.
  const [linkFailed, setLinkFailed] = useState(false);

  const openRow = async (url: string): Promise<void> => {
    setLinkFailed(!(await openExternal(url)));
  };

  // Contact rows come from the admin control plane; the surrounding copy is
  // CMS-overridable — a pull has to re-read both.
  const overridesQ = useContentOverrides(locale);
  const { refreshing, onRefresh } = usePullRefresh([config, overridesQ]);

  const email = config.data?.contact.email ?? "";
  // Migration 116: the GENERAL address (questions, suggestions, feedback) sits
  // beside the technical support one. Same hide-when-unset rule as every other
  // configured row, which also covers a server that predates the migration.
  const infoEmail = config.data?.contact.infoEmail ?? "";
  const phone = config.data?.contact.phone ?? "";
  // Admin-set WhatsApp number (empty default = row hidden); the wa.me link
  // wants digits only, the row shows the number as entered.
  const whatsapp = config.data?.contact.whatsapp ?? "";
  const whatsappDigits = whatsapp.replace(/\D/g, "");
  // Admin-set support address (empty default = row hidden), same pattern as
  // WhatsApp — mirrors web's ContactInfo behavior of hiding an unset setting.
  const address = config.data?.contact.address ?? "";
  // Admin-set precise map query ("lat,lng" or a place string) wins over the
  // free-text address for both the embed and the deep link; resolveMapQuery
  // applies the web precedence and guarantees a non-empty target.
  const mapQuery = config.data?.contact.mapQuery ?? "";
  const mapsTarget = resolveMapQuery(mapQuery, address);
  // Built empty for a child session, so there is nothing to render and nothing
  // to press even if a future edit forgets the surrounding condition.
  const socials = canLeaveApp
    ? SOCIALS.map((s) => ({
        ...s,
        url: config.data?.social[s.key] ?? "",
      })).filter((s) => s.url.length > 0 && isHttpUrl(s.url))
    : [];

  const openDirections = async () => {
    // Defence in depth: the map card and the address row are already hidden
    // from a child session, and this is the function both of them call.
    if (!canLeaveApp) return;
    const url = buildDirectionsUrl(mapsTarget);
    // Same posture as the social links: only http(s) is ever handed to the OS.
    const opened = isHttpUrl(url) && (await openExternal(url));
    setMapsAppFailed(!opened);
  };

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            accessibilityLabel={t("mob.refreshing")}
          />
        }
      >
        <View style={{ gap: spacing.sm }}>
          <AppText variant="heading">{t("contact.title")}</AppText>
          <CmsProse text={t("contact.lead")} />
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
          <>
            <Card style={{ gap: spacing.sm }}>
              {/* General address first, technical second — the same order and
                  the same split as web's ContactInfo, so a visitor who saw the
                  site does not have to relearn which mailbox is which. */}
              {infoEmail ? (
                <ListRow
                  icon={<Mail size={20} color={tokens.accent} strokeWidth={2} />}
                  title={t("contact.generalTitle")}
                  subtitle={infoEmail}
                  onPress={() => void openRow(`mailto:${infoEmail}`)}
                />
              ) : null}
              {email ? (
                <ListRow
                  icon={<Mail size={20} color={tokens.accent} strokeWidth={2} />}
                  title={t("contact.emailLabel")}
                  subtitle={email}
                  onPress={() => void openRow(`mailto:${email}`)}
                />
              ) : null}
              {phone ? (
                <ListRow
                  icon={<Phone size={20} color={tokens.accent} strokeWidth={2} />}
                  title={t("contact.phoneLabel")}
                  subtitle={phone}
                  onPress={() => void openRow(`tel:${phone.replace(/\s+/g, "")}`)}
                />
              ) : null}
              {/* WhatsApp opens a third-party chat app — a parent support
                  channel, not a child one. */}
              {canLeaveApp && whatsapp && whatsappDigits ? (
                <ListRow
                  icon={<MessageCircle size={20} color={tokens.accent} strokeWidth={2} />}
                  title={t("contact.whatsappLabel")}
                  subtitle={whatsapp}
                  onPress={() => void openRow(`https://wa.me/${whatsappDigits}`)}
                />
              ) : null}
              {address ? (
                // The address itself is information and stays on screen for
                // everyone; for a child session it is plain text, because
                // pressing it hands the device to the maps app. Without
                // onPress the row drops its chevron and its ripple, so it
                // reads as a fact rather than a dead button.
                <ListRow
                  icon={<MapPin size={20} color={tokens.accent} strokeWidth={2} />}
                  title={t("contact.address")}
                  subtitle={address}
                  accessibilityLabel={
                    canLeaveApp ? t("mob.contact.directions") : undefined
                  }
                  onPress={canLeaveApp ? () => void openDirections() : undefined}
                />
              ) : null}
              {linkFailed ? (
                <AppText variant="muted" color={tokens.danger}>
                  {t("mob.link.openFailed")}
                </AppText>
              ) : null}
              <AppText variant="muted">{t("contact.shortNote")}</AppText>
            </Card>

            {/* The map is a WebView onto maps.google.com with a directions
                button under it — the single biggest way out of the app on this
                screen, so it does not mount at all in a child session. */}
            {canLeaveApp ? (
              <View style={{ gap: spacing.sm }}>
                <ContactMap query={mapsTarget} onOpenDirections={() => void openDirections()} />
                {mapsAppFailed ? (
                  <AppText variant="muted">{t("mob.contact.mapUnavailable")}</AppText>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {socials.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {socials.map((s) => (
              <Pressable
                key={s.key}
                accessibilityRole="link"
                accessibilityLabel={s.label}
                onPress={() => void openRow(s.url)}
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
