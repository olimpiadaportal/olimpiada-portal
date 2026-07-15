// Student notification inbox (web /child/notifications parity, redesigned):
// the child only READS the inbox — preferences are parent-managed, so unlike
// the parent profile there is no prefs UI here at all. Same SHARED store as
// the header bell (useNotifications — one unread state, Realtime inserts keep
// working), same DATE-GROUPED sections / category chips / detail sheet /
// mark-read + delete actions as the parent screen, with student-audience deep
// links and the arena background (rows/sheets keep the app tokens — the
// existing theming mechanism of this route).
import React, { useMemo, useState } from "react";
import { RefreshControl, SectionList, View } from "react-native";
import { BellOff } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState, ErrorRetry, Skeleton } from "@/components/StatusViews";
import { spacing } from "@/theme/tokens";
import { useArena } from "@/features/arena/useArena";
import { useT } from "@/i18n/useT";
import { isSafeRelativeUrl, resolveDeepLink } from "@/lib/deeplink";
import {
  useNotifications,
  type NotificationItem,
} from "@/features/notifications/useNotifications";
import {
  CategoryChips,
  DayHeader,
  NotificationDetailSheet,
  NotificationRow,
  categoryLabelKey,
  groupByDay,
  relativeTime,
} from "@/features/notifications/components";

export default function StudentNotifications() {
  const { t, locale } = useT();
  const { arena } = useArena();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, loading, error, unreadCount, refresh, markRead, markAllRead, remove } =
    useNotifications(50);

  const [filter, setFilter] = useState<string | null>(null);
  const [detail, setDetail] = useState<NotificationItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const timeLabels = {
    now: t("notif.timeNow"),
    min: t("notif.timeMin"),
    hour: t("notif.timeHour"),
    day: t("notif.timeDay"),
  };

  // Category chips derived from what's actually in the inbox (+ "All").
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const n of items) {
      if (n.category && !seen.includes(n.category)) seen.push(n.category);
    }
    return seen;
  }, [items]);

  const catLabel = (cat: string) => {
    const key = categoryLabelKey(cat);
    return key ? t(key) : cat;
  };

  const shown = filter ? items.filter((n) => n.category === filter) : items;
  const sections = useMemo(
    () =>
      groupByDay(
        shown,
        { today: t("mob.notif.today"), yesterday: t("mob.notif.yesterday") },
        locale,
      ),
    [shown, t, locale],
  );

  // Root-relative paths (action_url or a markdown link in the body) go through
  // the SAME deep-link allowlist as push/universal links — STUDENT audience, so
  // parent/purchase targets never open from a child session; anything that does
  // not resolve falls back to the detail sheet.
  const openPath = (path: string): boolean => {
    const resolved = resolveDeepLink(path, "student");
    if (resolved && resolved.kind === "open") {
      router.push(resolved.target as never);
      return true;
    }
    return false;
  };

  const activate = (n: NotificationItem) => {
    if (!n.read_at) void markRead(n.id);
    if (n.action_url && isSafeRelativeUrl(n.action_url) && openPath(n.action_url)) return;
    setDetail(n);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ queryKey: ["notifications"] });
    } finally {
      setRefreshing(false);
    }
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View style={{ gap: spacing.md }}>
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </View>
    );
  } else if (error) {
    body = (
      <ErrorRetry message={t("mob.boot.error")} retryLabel={t("mob.retry")} onRetry={refresh} />
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={arena.lime}
            colors={[arena.lime]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title={t("notif.empty")}
            body={t("notif.emptyHint")}
            icon={<BellOff size={26} color={arena.muted} strokeWidth={2} />}
          />
        }
        renderSectionHeader={({ section }) => <DayHeader title={section.title} />}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            timeLabel={relativeTime(item.created_at, timeLabels)}
            onPress={() => activate(item)}
            onLongPress={() => setDetail(item)}
          />
        )}
      />
    );
  }

  return (
    <Screen background={arena.bg}>
      <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.md }}>
        {unreadCount > 0 ? (
          <SectionHeader
            title={t("mob.notif.unread").replace("{n}", String(unreadCount))}
            color={arena.muted}
            actionColor={arena.lime}
            action={{ label: t("notif.markAllRead"), onPress: () => void markAllRead() }}
          />
        ) : null}

        <CategoryChips
          categories={categories}
          active={filter}
          onChange={setFilter}
          allLabel={t("notif.filterAll")}
          labelFor={catLabel}
        />

        <View style={{ flex: 1 }}>{body}</View>
      </View>

      <NotificationDetailSheet
        item={detail}
        t={t}
        onClose={() => setDetail(null)}
        onDelete={(id) => {
          setDetail(null);
          void remove(id);
        }}
        onOpenPath={(path) => {
          if (openPath(path)) setDetail(null);
        }}
      />
    </Screen>
  );
}
