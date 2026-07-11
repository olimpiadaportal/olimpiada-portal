// The account bottom-sheet shell (web ProfileDrawer parity: ACCOUNT / LANGUAGE
// / APPEARANCE / SESSION sections). M1 ships Language + Appearance + Session;
// the Account row becomes the profile push in M2/M3. Plain RN Modal — the
// @gorhom/bottom-sheet dependency arrives with the richer M2 sheets.
import React from "react";
import { Modal, Pressable, View } from "react-native";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Segmented } from "./Segmented";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useLocaleStore, isLocale, type Locale } from "@/i18n";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { useAuthStore } from "@/features/auth/authStore";

export function AccountSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const theme = useTheme();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const config = useMobileConfig();
  const signOut = useAuthStore((s) => s.signOut);

  const supported = (config.data?.locales.supported ?? ["az", "en", "ru"]).filter(isLocale);
  const localeOptions = (supported.length > 0 ? supported : (["az", "en", "ru"] as Locale[])).map(
    (l) => ({ value: l, label: l.toUpperCase() }),
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t("drawer.close")}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
      />
      <View
        style={{
          backgroundColor: tokens.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          padding: spacing.xl,
          gap: spacing.lg,
        }}
      >
        <View
          style={{
            alignSelf: "center",
            width: 44,
            height: 4,
            borderRadius: 2,
            backgroundColor: tokens.border,
          }}
        />
        <View style={{ gap: spacing.sm }}>
          <AppText variant="muted">{t("drawer2.language")}</AppText>
          <Segmented options={localeOptions} value={locale} onChange={setLocale} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <AppText variant="muted">{t("drawer2.appearance")}</AppText>
          <Segmented
            options={[
              { value: "light" as const, label: t("drawer2.themeLight") },
              { value: "dark" as const, label: t("drawer2.themeDark") },
            ]}
            value={theme.theme}
            onChange={(v) => theme.setPreference(v)}
          />
        </View>
        <View style={{ gap: spacing.sm }}>
          <AppText variant="muted">{t("drawer2.session")}</AppText>
          <Button
            title={t("drawer.logout")}
            variant="danger"
            onPress={() => {
              onClose();
              void signOut();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
