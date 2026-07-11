// Themed text. System sans everywhere (Azerbaijani ə-safe — the mobile
// counterpart of the web Arial rule); platform monospace only for numeric
// accents (variant "mono"), mirroring the web's JetBrains Mono usage.
import React from "react";
import { Platform, Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize } from "@/theme/tokens";

type Variant = "body" | "muted" | "label" | "title" | "heading" | "mono";

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
    label: { fontSize: fontSize.sm, fontWeight: "600" },
    title: { fontSize: fontSize.xl, fontWeight: "700" },
    heading: { fontSize: fontSize.xxl, fontWeight: "800" },
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
