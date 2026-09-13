// THE FIRST SCREEN OF A FRESH INSTALL: pick a language.
//
// OWNER REQUEST: "when the application is installed and opened for the first
// time, the first screen must be a language selection screen ... after the user
// selects a language, all following onboarding/registration screens must
// automatically appear in that selected language."
//
// WHY IT IS A BOOT GATE AND NOT A ROUTE. RootGate returns this INSTEAD of the
// router <Stack> (see the gate order there), which is what makes "first, and
// before the carousel" structural rather than a convention: there is no route
// to deep-link past it, nothing to add to the (public) layout's AUTH_SCREENS,
// and no back gesture to defeat — lib/deeplink.ts can open /(public)/welcome
// directly, so a sibling route would have been bypassable on exactly the launch
// this screen exists for. It also sits AFTER the config gates, so it offers the
// admin-enabled locales and a pick can never be snapped back by RootGate's
// clamp effect.
//
// SELECTION IS THE LOCALE STORE, not a local useState. Tapping a card switches
// the app's language immediately — the title, the body and the button under it
// all re-render in the tapped language — so the choice is confirmed by READING
// it rather than by trusting a label the user may not be able to read. It also
// means a mid-screen kill leaves the tapped language persisted; only the
// "chosen" flag is still unset, so the picker asks once more with that language
// already highlighted.
//
// NOTHING HERE TOUCHES profiles.preferred_locale. The choice is local on
// purpose: server-generated notifications are Azerbaijani-only, and a
// profile-backed locale would flip the whole UI when a child signs in on a
// parent's phone.
import React from "react";
import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing, tint } from "@/theme/tokens";
import { LOCALE_NAMES, useLocaleStore, type Locale } from "@/i18n";
import { useT } from "@/i18n/useT";
import { useLocaleChoice } from "./localeChoice";
import { CenteredShell } from "./screens";

/**
 * One language, as a selectable card.
 *
 * Built here rather than imported because the app has no shared selectable-card
 * primitive — every selectable control is local to its feature (the avatar
 * Tile, the cancel-reason radio, the LocaleSwitcher rows). It follows those two
 * precedents exactly: the Tile's 2px accent border over a tinted surface, and
 * the LocaleSwitcher's radiogroup/radio roles with a trailing Check.
 *
 * NO WIDTH AND NO HEIGHT. The card fills the column it is laid in and grows
 * with its own label, so "Azərbaycan" at the 1.3x font scale AppText allows
 * wraps inside the card on a 320pt phone instead of clipping or pushing the
 * check mark off the edge.
 */
function LanguageCard({
  locale,
  selected,
  selectedNote,
  onPress,
}: {
  locale: Locale;
  selected: boolean;
  /** Appended to the a11y label — a screen reader must hear the state that the
   *  border and the tint carry visually. */
  selectedNote: string;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const name = LOCALE_NAMES[locale];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={selected ? `${name} — ${selectedNote}` : name}
      onPress={onPress}
      // Foreground ripple: this card paints its own background, and a
      // background ripple leaves it showing the PREVIOUS theme's colour after a
      // light/dark switch (__tests__/android-ripple-foreground.test.ts).
      android_ripple={{ color: tint(tokens.accent, 0.14), foreground: true }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        // A touch-target floor, not a size: the card is taller whenever its
        // label wraps. Clears the iOS 44pt and Material 48dp minimums.
        minHeight: 56,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: selected ? tokens.accent : tokens.border,
        backgroundColor: selected ? tokens.chipBg : tokens.surface,
        overflow: "hidden",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.sm,
          // Inverted against the card so the badge stays legible in both
          // states, in both themes — every colour here is a token.
          backgroundColor: selected ? tokens.surface : tokens.chipBg,
        }}
      >
        <AppText variant="label" color={selected ? tokens.accent : tokens.muted}>
          {locale.toUpperCase()}
        </AppText>
      </View>
      <AppText
        variant="subtitle"
        color={selected ? tokens.accent : tokens.text}
        // flex + minWidth 0 is the house rule for the growing cell of a row:
        // the name wraps inside the card instead of pushing the check out.
        style={{ flex: 1, minWidth: 0 }}
      >
        {name}
      </AppText>
      {selected ? <Check size={20} color={tokens.accent} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

export function LanguageChoiceScreen({ options }: { options: Locale[] }) {
  const { t } = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const markChosen = useLocaleChoice((s) => s.markChosen);

  // The initial highlight: whatever the store hydrated to — the persisted value
  // if there is one, otherwise the DEVICE language, otherwise az (i18n/index.ts
  // deviceLocale()). The fallback covers the one frame before RootGate's clamp
  // effect fires on a device language the admin has disabled; it is
  // display-only and writes nothing.
  const selected = options.includes(locale) ? locale : (options[0] ?? locale);

  return (
    <CenteredShell
      // The ONLY control on the screen besides the cards, and this gate replaces
      // the navigator — there is no back, no tab, no gesture. So it goes in the
      // shared ActionArea below the scrolling body, where three cards at 1.3x on
      // a 320pt phone cannot push it off the bottom edge.
      actions={
        <Button
          title={t("mob.lang.continue")}
          variant="gradient"
          onPress={() => {
            // Written even when it equals the current locale: the fallback
            // above is display-only, so this is where a highlight the user
            // never tapped becomes the persisted choice.
            setLocale(selected);
            markChosen();
          }}
        />
      }
    >
      <BrandMark size={56} />
      <View style={{ alignSelf: "stretch", gap: spacing.sm }}>
        <AppText variant="title" style={{ textAlign: "center" }}>
          {t("lang.select")}
        </AppText>
        <AppText variant="muted" style={{ textAlign: "center" }}>
          {t("mob.lang.body")}
        </AppText>
      </View>
      <View
        accessibilityRole="radiogroup"
        // stretch inside the shell's centred column: the cards share one edge
        // rather than each shrinking to its own label's width.
        style={{ alignSelf: "stretch", gap: spacing.sm }}
      >
        {options.map((l) => (
          <LanguageCard
            key={l}
            locale={l}
            selected={l === selected}
            selectedNote={t("mob.lang.selected")}
            onPress={() => setLocale(l)}
          />
        ))}
      </View>
    </CenteredShell>
  );
}
