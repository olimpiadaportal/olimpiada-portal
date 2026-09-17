// Back affordance for screens that draw no native header (the auth surfaces)
// and for header fallbacks. Platform-correct glyph: iOS renders the HIG
// chevron, Android the Material back arrow — the same glyphs the native stack
// header shows elsewhere in the app, so custom and native headers never
// disagree within one flow.
//
// THE GLYPH IS CENTRED, IN THE BOX EVERY HEADER BUTTON SHARES. Until
// 2026-09-17 this was a 44pt box with `alignItems: "flex-start"`, justified in
// a comment as "the glyph pinned to the left edge — this sits in top-LEFT
// corners". The corner is not what the glyph is inside: the navigation bar
// positions the button with its own leading padding, and since iOS 26 it also
// draws a rounded container behind it and centres nothing within. A glyph
// pinned to the left of a 44pt box therefore sat ~9pt left of the middle of
// that container — the circle visible on the owner's iOS screenshot, which
// nothing in this repository draws. Centred in the shared 34pt box it lands in
// the middle of the container on iOS and in the middle of its own box
// everywhere else, and the button is the same size and shape as the home glyph
// facing it across the bar (components/iconButtonLayout.ts).
//
// NO OPTICAL NUDGE — CHECKED, NOT ASSUMED. A chevron is the glyph that usually
// needs one, so the paths were read rather than remembered: lucide draws
// ChevronLeft as "m15 18-6-6 6-6" (ink from x=9 to x=15 of the 24 grid) and
// ArrowLeft as "m12 19-7-7 7-7" plus "M19 12H5" (x=5 to x=19). Both are
// symmetric about x=12, the grid's own centre, so geometric centring already
// IS optical centring for these two — and a nudge here would put back a slice
// of the very offset this change removes.
import React from "react";
import { Platform, Pressable } from "react-native";
import { ArrowLeft, ChevronLeft } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { HEADER_BACK_GLYPH_SIZE, headerButtonBox } from "./iconButtonLayout";

export function BackButton({
  label,
  onPress,
  color,
}: {
  /** Accessibility label ("Geri"/"Back"/"Назад") — announced, never rendered. */
  label: string;
  onPress: () => void;
  /** Glyph color override (defaults to the theme accent, like the header tint). */
  color?: string;
}) {
  const { tokens } = useTheme();
  const Glyph = Platform.OS === "ios" ? ChevronLeft : ArrowLeft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      // 34pt box + 12pt of slop = 58pt of touch. The slop is deliberately the
      // largest in the header: this is the most-tapped control in the app and
      // 34 + 2x12 = 58pt of touch. That is LESS than the 68pt the old 44pt box
      // plus the same slop gave, and more than the 48dp Material floor - the
      // trade is deliberate, because matching the other three header buttons
      // matters more than the extra 10pt nobody was reaching for.
      hitSlop={12}
      style={({ pressed }) => [headerButtonBox, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Glyph
        size={HEADER_BACK_GLYPH_SIZE}
        color={color ?? tokens.accent}
        strokeWidth={2}
      />
    </Pressable>
  );
}
