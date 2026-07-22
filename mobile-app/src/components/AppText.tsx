// Themed text. System sans everywhere (Azerbaijani ə-safe — the mobile
// counterpart of the web Arial rule); platform monospace only for numeric
// accents (variant "mono"), mirroring the web's JetBrains Mono usage.
// Redesign additions (plan §1): "display" hero tier (32/40 tight, 800),
// "eyebrow" section-label tier (12/16, 600, +0.4 tracking, muted) and
// "subtitle" (18/24, 700) — the tier between body and title for card headings
// that would shout at 22.
import React from "react";
import { Platform, Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { display, fontSize, lineHeight, weight } from "@/theme/tokens";

type Variant =
  | "body"
  | "muted"
  | "label"
  | "subtitle"
  | "title"
  | "heading"
  | "display"
  | "eyebrow"
  | "mono";

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export function AppText({
  variant = "body",
  style,
  color,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  const { tokens } = useTheme();

  const base: TextStyle = { color: color ?? tokens.text, fontSize: fontSize.md };
  const byVariant: Record<Variant, TextStyle> = {
    body: {},
    muted: { color: color ?? tokens.muted, fontSize: fontSize.sm },
    label: { fontSize: fontSize.sm, fontWeight: weight.semibold },
    subtitle: {
      fontSize: fontSize.lg,
      lineHeight: lineHeight.subtitle,
      fontWeight: weight.bold,
    },
    title: { fontSize: fontSize.xl, fontWeight: weight.bold },
    heading: { fontSize: fontSize.xxl, fontWeight: weight.heavy },
    display: {
      fontSize: display.size,
      lineHeight: display.lineHeight,
      fontWeight: weight.heavy,
      letterSpacing: -0.3,
    },
    eyebrow: {
      color: color ?? tokens.muted,
      fontSize: fontSize.xs,
      lineHeight: 16,
      fontWeight: weight.semibold,
      letterSpacing: 0.4,
    },
    mono: { fontFamily: MONO, fontVariant: ["tabular-nums"] },
  };

  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={1.3}
      style={[base, byVariant[variant], style]}
    />
  );
}
