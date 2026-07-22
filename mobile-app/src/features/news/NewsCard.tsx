// News list card (web .news-card parity): cover via expo-image, title, date, a
// read-only view counter and the interactive like pill. Pure visual — the
// surface decides navigation and the caller owns the like write.
import React from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Card } from "@/components/Card";
import { AppText } from "@/components/AppText";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { publicStorageUrl, type NewsListItem } from "@/lib/data";
import { useT } from "@/i18n/useT";
import { formatNewsDate } from "./format";
import { NewsLikeButton } from "./NewsLikeButton";

function MetaChip({ text }: { text: string }) {
  const { tokens } = useTheme();
  return (
    <View
      style={{
        backgroundColor: tokens.chipBg,
        borderRadius: radius.sm,
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
      }}
    >
      <AppText variant="muted" color={tokens.chipText} style={{ fontSize: 12 }}>
        {text}
      </AppText>
    </View>
  );
}

export function NewsCard({
  item,
  liked,
  canLike,
  onToggleLike,
  onPress,
}: {
  item: NewsListItem;
  liked: boolean;
  canLike: boolean;
  onToggleLike: () => void;
  onPress: () => void;
}) {
  const { t, locale } = useT();

  const cover = item.cover ? publicStorageUrl(item.cover.bucket, item.cover.path) : null;
  const views = item.view_count ?? 0;
  const likes = item.like_count ?? 0;
  const date = formatNewsDate(item.published_at, locale);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      // The card is one accessibility element, which hides the nested heart from
      // VoiceOver/TalkBack — expose liking as a custom action instead.
      accessibilityActions={
        canLike ? [{ name: "like", label: liked ? t("news.liked") : t("news.like") }] : undefined
      }
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "like") onToggleLike();
      }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={{ width: "100%", aspectRatio: 16 / 9 }}
            contentFit="cover"
            transition={150}
            accessible={false}
          />
        ) : null}
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          <AppText variant="title" style={{ fontSize: 18 }} numberOfLines={3}>
            {item.title}
          </AppText>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              flexWrap: "wrap",
            }}
          >
            {date ? <AppText variant="muted">{date}</AppText> : null}
            <MetaChip text={`${views} ${t("news.views")}`} />
            <NewsLikeButton
              compact
              count={likes}
              liked={liked}
              canLike={canLike}
              onToggle={onToggleLike}
            />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
