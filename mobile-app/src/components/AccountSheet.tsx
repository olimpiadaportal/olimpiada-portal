// The account bottom-sheet shell (web ProfileDrawer parity: ACCOUNT / LANGUAGE
// / APPEARANCE / SESSION sections). The ACCOUNT section carries the
// "My profile" push for BOTH roles (parent → (parent)/profile, student →
// (student)/profile — web ChildProfileDrawer parity). Plain RN Modal, restyled
// per plan §2: grab handle, ListRow rows, lucide icons, eyebrow section
// headers, safe-area padded bottom.
import React, { useEffect, useState } from "react";
import { Modal, Pressable, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import {
  BookOpen,
  CircleHelp,
  Fingerprint,
  Globe,
  Info,
  LogOut,
  Mail,
  SunMoon,
  Tag,
  UserRound,
} from "lucide-react-native";
import { AppText } from "./AppText";
import { ListRow } from "./ListRow";
import { Segmented } from "./Segmented";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { useLocaleStore, isLocale, type Locale } from "@/i18n";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";
import { useAuthStore } from "@/features/auth/authStore";
import { useAppLockStore } from "@/features/applock/appLockStore";

function IconChip({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.sm,
        backgroundColor: tokens.chipBg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
}

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const config = useMobileConfig();
  const role = useAuthStore((s) => s.role);
  const signOut = useAuthStore((s) => s.signOut);
  const lockEnabled = useAppLockStore((s) => s.enabled);
  const setLockEnabled = useAppLockStore((s) => s.setEnabled);

  // Biometric availability (hardware + enrolled), probed when the sheet opens.
  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    void (async () => {
      try {
        const [hw, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (live) setBioAvailable(hw && enrolled);
      } catch {
        if (live) setBioAvailable(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [visible]);

  // Both directions require a successful biometric/device-credential prompt —
  // otherwise anyone holding the phone could switch the lock off.
  const toggleAppLock = async () => {
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: t("mob.lock.prompt"),
        disableDeviceFallback: false,
      });
      if (res.success) setLockEnabled(!lockEnabled);
    } catch {
      // prompt failed/cancelled — the switch stays as-is
    }
  };

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
          paddingBottom: spacing.xl + insets.bottom,
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
        {role === "parent" || role === "student" ? (
          <View style={{ gap: spacing.xs }}>
            <AppText variant="eyebrow">{t("drawer2.account")}</AppText>
            <ListRow
              icon={<UserRound size={20} color={tokens.accent} strokeWidth={2} />}
              title={t("drawer.profileBtn")}
              onPress={() => {
                onClose();
                if (role === "parent") router.push("/(parent)/profile");
                else router.push("/(student)/profile");
              }}
            />
          </View>
        ) : null}
        <View style={{ gap: spacing.sm }}>
          <AppText variant="eyebrow">{t("drawer2.language")}</AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <IconChip>
              <Globe size={20} color={tokens.accent} strokeWidth={2} />
            </IconChip>
            <Segmented options={localeOptions} value={locale} onChange={setLocale} />
          </View>
        </View>
        <View style={{ gap: spacing.sm }}>
          <AppText variant="eyebrow">{t("drawer2.appearance")}</AppText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <IconChip>
              <SunMoon size={20} color={tokens.accent} strokeWidth={2} />
            </IconChip>
            <Segmented
              options={[
                { value: "light" as const, label: t("drawer2.themeLight") },
                { value: "dark" as const, label: t("drawer2.themeDark") },
              ]}
              value={theme.theme}
              onChange={(v) => theme.setPreference(v)}
            />
          </View>
        </View>
        {role === "parent" || role === "student" ? (
          <View style={{ gap: spacing.xs }}>
            <AppText variant="eyebrow">{t("mob.lock.section")}</AppText>
            <ListRow
              icon={<Fingerprint size={20} color={tokens.accent} strokeWidth={2} />}
              title={t("mob.lock.title")}
              subtitle={bioAvailable === false ? t("mob.lock.unavailable") : t("mob.lock.subtitle")}
              trailing={
                <Switch
                  accessibilityRole="switch"
                  accessibilityLabel={t("mob.lock.title")}
                  accessibilityState={{ disabled: bioAvailable !== true }}
                  value={lockEnabled}
                  disabled={bioAvailable !== true}
                  onValueChange={() => void toggleAppLock()}
                  trackColor={{ false: tokens.border, true: tokens.accent }}
                  thumbColor="#ffffff"
                />
              }
            />
          </View>
        ) : null}
        {/* INFO: the (public) info screens are viewable in-session now; pricing
            stays parent-only — children never see commerce. */}
        <View style={{ gap: spacing.xs }}>
          <AppText variant="eyebrow">{t("mob.info.section")}</AppText>
          <ListRow
            icon={<Info size={20} color={tokens.accent} strokeWidth={2} />}
            title={t("nav.about")}
            onPress={() => {
              onClose();
              router.push("/(public)/about");
            }}
          />
          <ListRow
            icon={<CircleHelp size={20} color={tokens.accent} strokeWidth={2} />}
            title={t("nav.faq")}
            onPress={() => {
              onClose();
              router.push("/(public)/faq");
            }}
          />
          <ListRow
            icon={<Mail size={20} color={tokens.accent} strokeWidth={2} />}
            title={t("nav.contact")}
            onPress={() => {
              onClose();
              router.push("/(public)/contact");
            }}
          />
          <ListRow
            icon={<BookOpen size={20} color={tokens.accent} strokeWidth={2} />}
            title={t("nav.subjects")}
            onPress={() => {
              onClose();
              router.push("/(public)/subjects");
            }}
          />
          {role === "parent" ? (
            <ListRow
              icon={<Tag size={20} color={tokens.accent} strokeWidth={2} />}
              title={t("nav.pricing")}
              onPress={() => {
                onClose();
                router.push("/(public)/pricing");
              }}
            />
          ) : null}
        </View>
        <View style={{ gap: spacing.xs }}>
          <AppText variant="eyebrow">{t("drawer2.session")}</AppText>
          <ListRow
            icon={<LogOut size={20} color={tokens.danger} strokeWidth={2} />}
            title={t("drawer.logout")}
            danger
            chevron={false}
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
