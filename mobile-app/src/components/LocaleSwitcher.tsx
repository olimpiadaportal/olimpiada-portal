// Language control for the SIGNED-OUT funnel (onboarding + Login/Register),
// where the AccountSheet — the app's only other language switch — cannot be
// reached. Compact chip trigger + the house bottom-sheet picker rather than an
// AZ|EN|RU Segmented: a full segmented (~168px) overflows the onboarding header
// next to the BrandMark on a 320pt phone, and above Login it reads as a second
// tab bar stacked on the Parent|Student one.
// Only the admin-enabled locales are offered — RootGate clamps the persisted
// locale to config.locales.supported, so a pick outside that set would snap
// back on the next config resolve.
import React, { useState } from "react";
import { Keyboard, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronDown, Globe } from "lucide-react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, shadow, spacing } from "@/theme/tokens";
import { isLocale, useLocaleStore, type Locale } from "@/i18n";
import { useT } from "@/i18n/useT";
import { useMobileConfig } from "@/lib/configQueries";

// Each language is written in its own language and is deliberately never
// translated (web localeNames parity) — so it stays readable to someone who
// cannot read the language the app is currently in.
const LOCALE_NAMES: Record<Locale, string> = {
  az: "Azərbaycan",
  en: "English",
  ru: "Русский",
};

const ALL_LOCALES: Locale[] = ["az", "en", "ru"];

export function LocaleSwitcher({
  align,
}: {
  /** "end" right-aligns the chip inside a COLUMN parent (the auth screens,
   *  which have no header row to hang it in). Left unset inside a row parent so
   *  the row's own alignItems keeps deciding — alignSelf would fight it. */
  align?: "end";
} = {}) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const config = useMobileConfig();
  const [open, setOpen] = useState(false);

  const supported = (config.data?.locales.supported ?? ALL_LOCALES).filter(isLocale);
  const options = supported.length > 0 ? supported : ALL_LOCALES;

  // A single enabled language leaves nothing to switch between — no dead chip.
  if (options.length < 2) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("lang.select")}
        accessibilityValue={{ text: LOCALE_NAMES[locale] }}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          // Login/Register open this with a field possibly focused; a keyboard
          // left up fights the sheet inside KeyboardAvoidingView on iOS.
          Keyboard.dismiss();
          setOpen(true);
        }}
        // 40px chip + 8 hitSlop clears both the iOS 44pt and Material 48dp
        // minimum touch targets without a bulky control in the header row.
        hitSlop={8}
        android_ripple={{ color: tokens.border }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          alignSelf: align === "end" ? "flex-end" : undefined,
          gap: spacing.xs,
          minHeight: 40,
          paddingHorizontal: spacing.md,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: tokens.border,
          backgroundColor: tokens.chipBg,
          overflow: "hidden",
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Globe size={16} color={tokens.accent} strokeWidth={2} />
        <AppText variant="label">{locale.toUpperCase()}</AppText>
        <ChevronDown size={14} color={tokens.muted} strokeWidth={2} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("drawer.close")}
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        />
        <View
          style={[
            {
              backgroundColor: tokens.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.xl,
              paddingBottom: spacing.xl + insets.bottom,
              gap: spacing.sm,
            },
            shadow("float", tokens.shadow),
          ]}
        >
          <View
            style={{
              alignSelf: "center",
              width: 44,
              height: 4,
              borderRadius: 2,
              backgroundColor: tokens.border,
              marginBottom: spacing.sm,
            }}
          />
          <AppText variant="eyebrow">{t("lang.select")}</AppText>
          <View accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
            {options.map((l) => {
              const active = l === locale;
              return (
                <Pressable
                  key={l}
                  accessibilityRole="radio"
                  accessibilityLabel={LOCALE_NAMES[l]}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    // Persisted + instantly re-rendered by the locale store;
                    // no reload, unlike the web cookie switch.
                    setLocale(l);
                    setOpen(false);
                  }}
                  android_ripple={{ color: tokens.chipBg }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    minHeight: 48,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: active ? tokens.chipBg : "transparent",
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <AppText
                    variant="label"
                    color={active ? tokens.accent : tokens.text}
                    style={{ flex: 1 }}
                  >
                    {LOCALE_NAMES[l]}
                  </AppText>
                  {active ? (
                    <Check size={18} color={tokens.accent} strokeWidth={2.5} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}
