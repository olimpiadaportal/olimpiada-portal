// The standard settings/profile/notification row (plan §2): leading icon in a
// soft chip, title + optional subtitle, trailing value / chevron / custom node
// (e.g. a Switch). Pressable rows get ripple + a ≥48dp hit target.
//
// Round 52 — `valueWrap`: an opt-in for rows whose value is an UNBOUNDED DB
// string (school name, city/rayon, olympiad type). The default trailing cell is
// clamped to one line, so on a 320pt phone a long school name was ellipsized
// AND starved its own label: Yoga distributes negative free space by
// (flexShrink × flexBasis), and the title column's `flex: 1` gives it basis 0 →
// shrink weight 0, so the value absorbed the whole deficit. With `valueWrap`
// the value moves INTO the title column as a block child, so nothing competes,
// nothing is clamped, and the row simply grows taller.
import React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import {
  listRowA11yLabel,
  listRowIconAlignSelf,
  listRowShowChevron,
  listRowValueMode,
} from "./listRowLayout";

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  valueWrap = false,
  trailing,
  chevron,
  onPress,
  danger = false,
  disabled = false,
  style,
  accessibilityLabel,
}: {
  /** Leading glyph (usually a lucide icon, size 18–20). */
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Trailing value text (mono-muted). Ignored when `trailing` is given. */
  value?: string;
  /**
   * Render `value` UNDER the title, full width of the text column, wrapping
   * over as many lines as it needs instead of ellipsizing on one line. Opt in
   * for values with no length ceiling (school / city / rayon / type names);
   * leave off for short, bounded values ("12", "AZ", a phone number), which
   * read better right-aligned. No effect when `trailing` is given.
   */
  valueWrap?: boolean;
  /** Custom trailing node (Switch, Pill…). Wins over value/chevron. */
  trailing?: React.ReactNode;
  /** Show a trailing chevron. Defaults to true for pressable rows. */
  chevron?: boolean;
  onPress?: () => void;
  /** Danger tint (logout / delete rows). */
  danger?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  /** Overrides the default "title. subtitle" a11y label (e.g. an action row whose subtitle is display data, not the action). */
  accessibilityLabel?: string;
}) {
  const { tokens } = useTheme();
  const tint = danger ? tokens.danger : tokens.text;
  const mode = listRowValueMode({ trailing, value, valueWrap });
  const showChevron = listRowShowChevron({ trailing, chevron, onPress });

  const body = (
    <>
      {icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.sm,
            backgroundColor: tokens.chipBg,
            alignItems: "center",
            justifyContent: "center",
            // Keeps the chip level with the title on a tall wrapped row instead
            // of floating in its vertical middle. `undefined` === not set.
            alignSelf: listRowIconAlignSelf(mode),
          }}
        >
          {icon}
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" color={tint} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
        {mode === "stacked" ? (
          // No numberOfLines: the column has a definite width (flex: 1), so the
          // text measures against a real constraint and both platforms fall
          // back to character breaking for a single unbroken 60-char token.
          // Sans, not the trailing cell's `mono`: monospace is reserved for
          // numeric accents and fits ~20% fewer characters per line, which is
          // the opposite of what a wrapped proper noun needs.
          //
          // Full contrast (tokens.text), NOT the trailing cell's muted: once
          // the value moves into the text column it IS the row's primary
          // content, and APP_LIGHT muted #9a8aa8 on surface #ffffff is 3.19:1 —
          // below WCAG AA 4.5:1 for 16px text. This also matches the web twin,
          // where .prof2-row-value is var(--text) and only the label is muted.
          <AppText variant="body">{value}</AppText>
        ) : null}
      </View>
      {mode === "custom" ? (
        trailing
      ) : mode === "inline" ? (
        // RN's default flexShrink is 0 — without it a long value keeps its
        // intrinsic width and numberOfLines never engages (Round 44).
        <AppText
          variant="mono"
          color={tokens.muted}
          numberOfLines={1}
          style={{ flexShrink: 1, minWidth: 0 }}
        >
          {value}
        </AppText>
      ) : null}
      {showChevron ? <ChevronRight size={18} color={tokens.muted} /> : null}
    </>
  );

  const layout: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.sm,
  };

  if (!onPress) {
    // A stacked value sits INSIDE the row's own text column, so without
    // grouping a screen reader produces two unrelated focus stops ("Məktəb",
    // then the school name) with no programmatic label/value association — and
    // the SchoolInfoCard rows in the owner's bug report are all non-pressable.
    // Only the stacked branch is grouped, so the ~20 other non-pressable rows
    // (icon + title + Switch/chevron) keep their per-element focus stops.
    if (mode === "stacked") {
      return (
        <View
          accessible
          accessibilityLabel={listRowA11yLabel({
            accessibilityLabel,
            title,
            subtitle,
            value,
            mode,
          })}
          style={[layout, style]}
        >
          {body}
        </View>
      );
    }
    return <View style={[layout, style]}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={listRowA11yLabel({ accessibilityLabel, title, subtitle, value, mode })}
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      android_ripple={disabled ? undefined : { color: tokens.chipBg }}
      style={({ pressed }) => [layout, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }, style]}
    >
      {body}
    </Pressable>
  );
}
