// The standard settings/profile/notification row (plan §2): leading icon in a
// soft chip, title + optional subtitle, trailing value / chevron / custom node
// (e.g. a Switch). Pressable rows get ripple + a ≥48dp hit target.
import React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  trailing,
  chevron,
  onPress,
  danger = false,
  disabled = false,
  style,
}: {
  /** Leading glyph (usually a lucide icon, size 18–20). */
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Trailing value text (mono-muted). Ignored when `trailing` is given. */
  value?: string;
  /** Custom trailing node (Switch, Pill…). Wins over value/chevron. */
  trailing?: React.ReactNode;
  /** Show a trailing chevron. Defaults to true for pressable rows. */
  chevron?: boolean;
  onPress?: () => void;
  /** Danger tint (logout / delete rows). */
  danger?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { tokens } = useTheme();
  const tint = danger ? tokens.danger : tokens.text;
  const showChevron = trailing === undefined && (chevron ?? Boolean(onPress));

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
      </View>
      {trailing !== undefined ? (
        trailing
      ) : value !== undefined ? (
        <AppText variant="mono" color={tokens.muted} numberOfLines={1}>
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
    return <View style={[layout, style]}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      android_ripple={disabled ? undefined : { color: tokens.chipBg }}
      style={({ pressed }) => [layout, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }, style]}
    >
      {body}
    </Pressable>
  );
}
