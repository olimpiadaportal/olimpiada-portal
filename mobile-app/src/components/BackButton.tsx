// Back affordance for screens that draw no native header (the auth surfaces)
// and for header fallbacks. Platform-correct glyph: iOS renders the HIG
// chevron, Android the Material back arrow — the same glyphs the native stack
// header shows elsewhere in the app, so custom and native headers never
// disagree within one flow.
import React from "react";
import { Platform, Pressable } from "react-native";
import { ArrowLeft, ChevronLeft } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";

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
      hitSlop={12}
      style={({ pressed }) => ({
        // 44pt box (iOS minimum; hitSlop lifts it past Material's 48dp) with
        // the glyph pinned to the left edge — this sits in top-LEFT corners.
        minWidth: 44,
        minHeight: 44,
        alignItems: "flex-start",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Glyph
        size={Platform.OS === "ios" ? 26 : 24}
        color={color ?? tokens.accent}
        strokeWidth={2}
      />
    </Pressable>
  );
}
