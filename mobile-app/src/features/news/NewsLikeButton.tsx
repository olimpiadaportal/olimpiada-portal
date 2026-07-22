// The news heart (web .like-btn parity): a pill carrying the article's like
// count, accent-coloured with a filled glyph once this viewer has liked it.
// Purely presentational — the caller owns the state and the write, so nothing
// here can move a counter while rendering.
//
// Viewers who cannot like (signed out) get the same pill as a plain, unfocusable
// chip: they still see the count, exactly as the web does.
import React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { Heart } from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { fontSize, spacing } from "@/theme/tokens";
import { useT } from "@/i18n/useT";

export function NewsLikeButton({
  count,
  liked,
  canLike,
  onToggle,
  /** Card density: glyph + bare number, matching the neighbouring meta chips. */
  compact = false,
}: {
  count: number;
  liked: boolean;
  canLike: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const { tokens } = useTheme();
  const { t } = useT();

  const tint = liked ? tokens.accent : tokens.muted;
  const pill: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: liked ? tokens.accent : tokens.border,
    backgroundColor: liked ? tokens.pillBg : tokens.chipBg,
    paddingVertical: compact ? 2 : 5,
    paddingHorizontal: compact ? spacing.sm : spacing.md,
  };

  const glyph = (
    <Heart
      size={compact ? 13 : 15}
      color={tint}
      // Filled only when liked — the outline/solid pair is the whole signal.
      fill={liked ? tint : "transparent"}
      strokeWidth={2}
    />
  );
  const label = (
    <AppText variant="muted" color={tint} style={{ fontSize: fontSize.xs }}>
      {compact ? String(count) : `${count} ${t("news.likes")}`}
    </AppText>
  );

  if (!canLike) {
    return (
      <View style={pill}>
        {glyph}
        {label}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: liked }}
      accessibilityLabel={liked ? t("news.liked") : t("news.like")}
      accessibilityValue={{ text: `${count} ${t("news.likes")}` }}
      onPress={onToggle}
      hitSlop={8}
      style={({ pressed }) => [pill, { opacity: pressed ? 0.7 : 1 }]}
    >
      {glyph}
      {label}
    </Pressable>
  );
}
