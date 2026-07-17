// Notification inbox UI pieces (mobile port of the web NotificationsPanel /
// NotificationDetailModal, redesigned): pure helpers (type→lucide icon map,
// category label key, relative time, day grouping — same rules as
// web-app/src/lib/notifications/types.ts), the ListRow-anatomy row, the
// category filter chips, the day section header and the detail bottom sheet.
// The hook (useNotifications.ts) owns all state; these components only render.
import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import {
  Bell,
  ChartColumn,
  CreditCard,
  Flame,
  Gift,
  Hourglass,
  Medal,
  Megaphone,
  Newspaper,
  Receipt,
  Trash2,
  Trophy,
  type LucideIcon,
} from "lucide-react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, shadow, spacing } from "@/theme/tokens";
import { RichBody } from "@/lib/notifMarkdown";
import type { NotificationItem } from "./useNotifications";

/* ------------------------------ pure helpers ------------------------------ */

/** Lucide glyph per notification type (web iconForType parity, one icon
 *  language — the emoji map is gone). */
export function typeIcon(type: string | null): LucideIcon {
  switch (type) {
    case "olympiad_purchased":
      return Medal;
    case "attempt_graded":
      return ChartColumn;
    case "personal_best":
      return Trophy;
    case "streak_milestone":
      return Flame;
    case "subscription_canceled":
      return Receipt;
    case "subject_charge_failed":
      return CreditCard;
    case "subject_expiring":
      return Hourglass;
    case "giveaway_ending":
      return Gift;
    case "news_published":
      return Newspaper;
    case "admin_announcement":
      return Megaphone;
    default:
      return Bell;
  }
}

/** Map the `category` column to an i18n key (undefined = show the raw value). */
export function categoryLabelKey(category: string): string | undefined {
  switch (category) {
    case "olympiad":
      return "notif.cat.olympiad";
    case "progress":
      return "notif.cat.progress";
    case "billing":
      return "notif.cat.billing";
    case "announcement":
      return "notif.cat.announcement";
    case "news":
      return "notif.cat.news";
    default:
      return undefined;
  }
}

/** Compact, locale-agnostic relative time using short unit strings. */
export function relativeTime(
  createdAtIso: string,
  labels: { now: string; min: string; hour: string; day: string },
): string {
  const then = new Date(createdAtIso).getTime();
  if (!Number.isFinite(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return labels.now;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} ${labels.min}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${labels.hour}`;
  const days = Math.floor(hours / 24);
  return `${days} ${labels.day}`;
}

const INTL_LOCALE: Record<string, string> = { az: "az-AZ", en: "en-GB", ru: "ru-RU" };

export type NotificationSection = {
  key: string;
  title: string;
  data: NotificationItem[];
};

/**
 * Group inbox items into DAY sections (list order preserved — the hook already
 * sorts newest-first): today / yesterday get their labels, older days a locale
 * date ("12 iyul" — year appended when it differs from the current one).
 */
export function groupByDay(
  items: NotificationItem[],
  labels: { today: string; yesterday: string },
  locale: string,
): NotificationSection[] {
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  const now = new Date();
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  const titleFor = (key: string, d: Date): string => {
    if (key === todayKey) return labels.today;
    if (key === yesterdayKey) return labels.yesterday;
    try {
      return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? locale, {
        day: "numeric",
        month: "long",
        ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
      }).format(d);
    } catch {
      return key;
    }
  };

  const sections: NotificationSection[] = [];
  let current: NotificationSection | null = null;
  for (const n of items) {
    const d = new Date(n.created_at);
    const key = Number.isFinite(d.getTime()) ? dayKey(d) : "unknown";
    if (!current || current.key !== key) {
      current = { key, title: titleFor(key, d), data: [] };
      sections.push(current);
    }
    current.data.push(n);
  }
  return sections;
}

/**
 * data_json → display pairs for the detail sheet. Scalars only (objects,
 * arrays and nulls skipped), ≤8 entries, opaque id/url keys and overlong
 * values dropped — never dump raw JSON at the user (web scalarPairs parity).
 */
export function scalarPairs(
  data: Record<string, unknown> | null,
): { key: string; label: string; value: string }[] {
  if (!data || typeof data !== "object") return [];
  const out: { key: string; label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(data)) {
    if (out.length >= 8) break;
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "object") continue;
    let value: string;
    if (typeof raw === "boolean") value = raw ? "✓" : "—";
    else value = String(raw);
    value = value.trim();
    if (!value || value.length > 200) continue;
    if (/^(id|.*_id|url|.*_url|action_url|href)$/i.test(key)) continue;
    const spaced = key
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .trim();
    const label = spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
    out.push({ key, label, value });
  }
  return out;
}

/* ------------------------------ filter chips ------------------------------ */

export function CategoryChips({
  categories,
  active,
  onChange,
  allLabel,
  labelFor,
}: {
  categories: string[];
  active: string | null;
  onChange: (cat: string | null) => void;
  allLabel: string;
  labelFor: (cat: string) => string;
}) {
  const { tokens } = useTheme();
  if (categories.length === 0) return null;
  const chips: { value: string | null; label: string }[] = [
    { value: null, label: allLabel },
    ...categories.map((c) => ({ value: c as string | null, label: labelFor(c) })),
  ];
  return (
    // flexGrow:0 kills the ScrollView's implicit flexGrow:1 (it would split the
    // screen's free height with the list and stretch every chip to fill it);
    // alignItems:"center" keeps chips at their natural 44px control height.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ alignItems: "center" }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {chips.map((c) => {
          const on = c.value === active;
          return (
            <Pressable
              key={c.value ?? "__all__"}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c.label}
              onPress={() => onChange(c.value)}
              android_ripple={{ color: tokens.pillBg }}
              style={({ pressed }) => ({
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.lg,
                minHeight: 44,
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: on ? tokens.accent : tokens.chipBg,
                borderWidth: 1,
                borderColor: on ? tokens.accent : tokens.border,
                opacity: pressed ? 0.85 : 1,
                overflow: "hidden",
              })}
            >
              <AppText variant="label" color={on ? "#ffffff" : tokens.chipText}>
                {c.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/* ------------------------------ day header --------------------------------- */

export function DayHeader({ title }: { title: string }) {
  return (
    <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xs }}>
      <AppText variant="eyebrow">{title}</AppText>
    </View>
  );
}

/* --------------------------------- row ------------------------------------ */

export function NotificationRow({
  item,
  timeLabel,
  onPress,
  onLongPress,
}: {
  item: NotificationItem;
  timeLabel: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { tokens } = useTheme();
  const unread = !item.read_at;
  const Icon = typeIcon(item.type);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: tokens.chipBg }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 48,
        backgroundColor: unread ? tokens.chipBg : tokens.surface,
        borderWidth: 1,
        borderColor: tokens.border,
        borderRadius: radius.md,
        padding: spacing.md,
        opacity: pressed ? 0.85 : 1,
        overflow: "hidden",
      })}
    >
      {/* Leading icon squircle (ListRow anatomy). */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.sm,
          backgroundColor: unread ? tokens.pillBg : tokens.chipBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={18} color={unread ? tokens.accent : tokens.muted} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText
          variant="label"
          numberOfLines={1}
          style={{ fontWeight: unread ? "700" : "600" }}
        >
          {item.title}
        </AppText>
        {item.body ? (
          <AppText variant="muted" numberOfLines={2} style={{ fontSize: 13 }}>
            {item.body}
          </AppText>
        ) : null}
        <AppText variant="muted" style={{ fontSize: 11 }}>
          {timeLabel}
        </AppText>
      </View>
      {unread ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.accent }} />
      ) : null}
    </Pressable>
  );
}

/* ----------------------------- detail sheet -------------------------------- */

export function NotificationDetailSheet({
  item,
  t,
  onClose,
  onDelete,
  onOpenPath,
}: {
  item: NotificationItem | null;
  t: (key: string) => string;
  onClose: () => void;
  /** Deletes the shown notification (awaited by the caller) and closes. */
  onDelete: (id: string) => void;
  /** Root-relative markdown links routed through the deep-link allowlist. */
  onOpenPath: (path: string) => void;
}) {
  const { tokens } = useTheme();
  if (!item) return null;

  const catKey = item.category ? categoryLabelKey(item.category) : undefined;
  const typeLabel = catKey ? t(catKey) : item.category ?? t("notif.detailsTitle");
  const d = new Date(item.created_at);
  const when = Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
  const pairs = scalarPairs(item.data_json);
  const Icon = typeIcon(item.type);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t("notif.close")}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
      />
      <View
        style={[
          {
            backgroundColor: tokens.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: spacing.xl,
            gap: spacing.lg,
            maxHeight: "80%",
          },
          shadow("float", tokens.shadow),
        ]}
      >
        <View
          style={{
            alignSelf: "center",
            width: 44,
            height: 4,
            borderRadius: 2,
            backgroundColor: tokens.border,
          }}
        />
        <ScrollView contentContainerStyle={{ gap: spacing.lg }}>
          {/* Header: icon squircle + category eyebrow + title + timestamp. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.md,
                backgroundColor: tokens.pillBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon size={22} color={tokens.accent} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="eyebrow">{typeLabel}</AppText>
              <AppText variant="title" style={{ fontSize: 18 }}>
                {item.title || t("notif.detailsTitle")}
              </AppText>
              {when ? (
                <AppText variant="muted" style={{ fontSize: 12 }}>
                  {when}
                </AppText>
              ) : null}
            </View>
          </View>

          {item.body ? (
            <RichBody text={item.body} onOpenPath={onOpenPath} />
          ) : (
            <AppText variant="muted">{t("notif.noLink")}</AppText>
          )}

          {pairs.length > 0 ? (
            <View
              style={{
                gap: spacing.sm,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: tokens.border,
                padding: spacing.md,
              }}
            >
              <AppText variant="eyebrow">{t("notif.detailsData")}</AppText>
              {pairs.map((p) => (
                <View
                  key={p.key}
                  style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}
                >
                  <AppText variant="muted" style={{ flexShrink: 1 }}>
                    {p.label}
                  </AppText>
                  <AppText variant="label" style={{ flexShrink: 1, textAlign: "right" }}>
                    {p.value}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <Button
              title={t("notif.delete")}
              variant="danger"
              icon={<Trash2 size={18} color="#ffffff" strokeWidth={2} />}
              style={{ flex: 1 }}
              onPress={() => onDelete(item.id)}
            />
            <Button title={t("notif.close")} variant="ghost" style={{ flex: 1 }} onPress={onClose} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
