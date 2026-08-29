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

/**
 * MONOSPACE IS FOR DIGITS. Text that is not digits does not get it.
 *
 * Android's generic "monospace" resolves to Droid Sans Mono, which has NO
 * glyph for U+0259 (ə) or U+018F (Ə) — so every mono label containing an
 * Azerbaijani schwa rendered a tofu box: "ÖLK▯ ÜZR▯ YER", "D▯QIQLIK",
 * "1 gün üst-üst▯". iOS picks Menlo, which HAS the glyph, which is why the
 * bug looked device-dependent and was reported that way.
 *
 * The root cause is not the font, it is the usage: the design rule is
 * "monospace only for numeric accents" (root CLAUDE.md), and these were
 * WORDS wearing a numeric style. So rather than shipping a mono font asset
 * with Azerbaijani coverage — a new binary, a new build, and a second font to
 * keep in sync — the variant declines the monospace FAMILY for any string that
 * is not safely representable in it, and keeps `tabular-nums` either way.
 *
 * Deliberately conservative: ASCII is what every monospace face covers. A
 * score, a timer, an 8-digit child ID and a percentage all stay monospaced and
 * column-aligned; a translated label quietly renders in the system sans, which
 * is what the design wanted from it in the first place.
 *
 * React Native does NOT do per-glyph fallback for a named family on Android,
 * so a fallback chain here would not have worked — the tofu is what "fallback"
 * looks like on that platform.
 */
const MONO_SAFE = /^[ -~]*$/;

function monoSafe(children: React.ReactNode): boolean {
  if (children === null || children === undefined || typeof children === "boolean") return true;
  if (typeof children === "number") return true;
  if (typeof children === "string") return MONO_SAFE.test(children);
  if (Array.isArray(children)) return children.every(monoSafe);
  // An element child (an icon, a nested <AppText>) carries its own styling; it
  // cannot be inspected here, so the family is declined rather than guessed at.
  return false;
}

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
    // fontFamily is decided per-render below, from the actual content.
    mono: { fontVariant: ["tabular-nums"] },
  };

  // Applied LAST so an explicit fontFamily in `style` still wins, and only when
  // the content is safely representable — see MONO_SAFE above.
  const monoFamily: TextStyle | null =
    variant === "mono" && monoSafe(rest.children) ? { fontFamily: MONO } : null;

  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={1.3}
      style={[base, byVariant[variant], monoFamily, style]}
    />
  );
}
