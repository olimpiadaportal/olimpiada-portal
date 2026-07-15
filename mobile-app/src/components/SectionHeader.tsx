// Section eyebrow + optional trailing action (plan §2). Colors overridable so
// arena screens can pass palette values.
import React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { spacing } from "@/theme/tokens";

export function SectionHeader({
  title,
  action,
  color,
  actionColor,
  style,
}: {
  title: string;
  /** Trailing text action ("Hamısı" / "See all"). */
  action?: { label: string; onPress: () => void };
  /** Eyebrow color (default: theme muted). */
  color?: string;
  /** Action color (default: theme accent). */
  actionColor?: string;
  style?: ViewStyle;
}) {
  const { tokens } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.md,
          minHeight: 24,
        },
        style,
      ]}
    >
      <AppText variant="eyebrow" color={color} numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </AppText>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={12}
        >
          <AppText variant="label" color={actionColor ?? tokens.accent}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
