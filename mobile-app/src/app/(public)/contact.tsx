// Public Contact (web /contact parity): support email and phone come from the
// admin control plane (get_mobile_config contact.*), tap opens mailto:/tel:.
// The address block mirrors web's ContactInfo — the row shows the configured
// address (hidden when unset) and the map below it always renders, using the
// admin's precise pin (contact.map_query) when there is one, else the address,
// else the shared fallback. Tapping either opens directions in the device's
// maps app. Social links render only when configured, open externally, and
// must be http(s) — config values are display data, never blindly-openable
// URLs.
import React, { useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Stack, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bug, Mail, MapPin, MessageCircle, Phone } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CmsProse } from "@/components/CmsProse";
import { ListRow } from "@/components/ListRow";
import { ErrorRetry, Skeleton } from "@/components/StatusViews";
import { ContactMap, buildDirectionsUrl, resolveMapQuery } from "@/features/public/ContactMap";
import { BugReportSheet } from "@/features/support/BugReportSheet";
import { submitBugReport } from "@/features/support/api";
import { useAuthStore } from "@/features/auth/authStore";
import { showToast } from "@/features/toast/toastStore";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";
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
  const pathname = usePathname();
  const config = useMobileConfig();
  // The bug-report endpoint is bearer-authenticated, so the trigger is offered
  // only to a resolved session. A signed-out visitor gets the two addresses and
  // a line saying so — web keeps its anonymous path because that form has a
  // honeypot and a per-IP throttle behind it, neither of which exists here, and
  // an unauthenticated mobile endpoint would be new surface for no new reports.
  const signedIn = useAuthStore((s) => s.status) === "signedIn";
  const [bugOpen, setBugOpen] = useState(false);
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
  const socials = SOCIALS.map((s) => ({
    ...s,
    url: config.data?.social[s.key] ?? "",
  })).filter((s) => s.url.length > 0 && isHttpUrl(s.url));

  const openDirections = async () => {
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
              {whatsapp && whatsappDigits ? (
                <ListRow
                  icon={<MessageCircle size={20} color={tokens.accent} strokeWidth={2} />}
                  title={t("contact.whatsappLabel")}
                  subtitle={whatsapp}
                  onPress={() => void openRow(`https://wa.me/${whatsappDigits}`)}
                />
              ) : null}
              {address ? (
                <ListRow
                  icon={<MapPin size={20} color={tokens.accent} strokeWidth={2} />}
                  title={t("contact.address")}
                  subtitle={address}
                  accessibilityLabel={t("mob.contact.directions")}
                  onPress={() => void openDirections()}
                />
              ) : null}
              {linkFailed ? (
                <AppText variant="muted" color={tokens.danger}>
                  {t("mob.link.openFailed")}
                </AppText>
              ) : null}
              <AppText variant="muted">{t("contact.shortNote")}</AppText>
            </Card>

            <View style={{ gap: spacing.sm }}>
              <ContactMap query={mapsTarget} onOpenDirections={() => void openDirections()} />
              {mapsAppFailed ? (
                <AppText variant="muted">{t("mob.contact.mapUnavailable")}</AppText>
              ) : null}
            </View>
          </>
        )}

        {/* The escape hatch, below the addresses: the two mailboxes are the
            primary action on a contact screen, the bug form is the fallback for
            "something is broken" — same ordering as web.

            Deliberately OUTSIDE the config branch above. "The app cannot load
            its configuration" is itself a report worth filing, and burying the
            trigger inside the success branch would hide it in exactly that
            case. Nothing here reads the config. */}
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="muted">{t("contact.bugCtaHint")}</AppText>
          {signedIn ? (
            <Button
              title={t("contact.bugCta")}
              variant="ghost"
              icon={<Bug size={18} color={tokens.accent} strokeWidth={2} />}
              onPress={() => setBugOpen(true)}
            />
          ) : (
            <AppText variant="muted">{t("mob.bug.signInRequired")}</AppText>
          )}
        </Card>

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

      {/* Mounted outside the ScrollView: a Modal is its own native window and
          must not live inside a scrolling content container. */}
      <BugReportSheet
        visible={bugOpen}
        t={t}
        onClose={() => setBugOpen(false)}
        onSubmit={async (fields) => {
          const res = await submitBugReport(fields, pathname, locale);
          if (!res.ok) return { ok: false, errorKey: res.error };
          // The sheet shows its own success state; the toast is the second
          // confirmation, for the moment the reporter closes it.
          showToast(t("bug.successTitle"), "ok");
          return { ok: true };
        }}
      />
    </View>
  );
}
