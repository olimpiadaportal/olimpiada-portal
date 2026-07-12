// Notification inbox UI pieces (mobile port of the web NotificationsPanel /
// NotificationDetailModal): pure helpers (type→emoji map, category label key,
// relative time — same rules as web-app/src/lib/notifications/types.ts), the
// row, the category filter chips and the detail bottom sheet. The hook
// (useNotifications.ts) owns all state; these components only render.
import React from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, spacing } from "@/theme/tokens";
import { RichBody } from "@/lib/notifMarkdown";
import type { NotificationItem } from "./useNotifications";

/* ------------------------------ pure helpers ------------------------------ */

/** Emoji glyph per notification type (web iconForType parity). */
export function iconForType(type: string | null): string {
  switch (type) {
    case "olympiad_purchased":
      return "\u{1F3C5}"; // medal
    case "attempt_graded":
      return "\u{1F4CA}"; // bar chart
    case "personal_best":
      return "\u{1F3C6}"; // trophy
    case "streak_milestone":
      return "\u{1F525}"; // fire
    case "subscription_canceled":
      return "\u{1F9FE}"; // receipt
    case "subject_charge_failed":
      return "\u{1F4B3}"; // card
    case "subject_expiring":
      return "\u{23F3}"; // hourglass
    case "giveaway_ending":
      return "\u{1F381}"; // gift
    case "news_published":
      return "\u{1F4F0}"; // newspaper
    case "admin_announcement":
      return "\u{1F4E3}"; // megaphone
    default:
      return "\u{1F514}"; // bell
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {chips.map((c) => {
          const on = c.value === active;
          return (
            <Pressable
              key={c.value ?? "__all__"}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={c.label}
              onPress={() => onChange(c.value)}
              style={{
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.xl,
                backgroundColor: on ? tokens.accent : tokens.chipBg,
                borderWidth: 1,
                borderColor: on ? tokens.accent : tokens.border,
              }}
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: unread ? tokens.chipBg : tokens.surface,
        borderWidth: 1,
        borderColor: tokens.border,
        borderRadius: radius.md,
        padding: spacing.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <AppText style={{ fontSize: 22 }}>{iconForType(item.type)}</AppText>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" numberOfLines={1} style={{ fontWeight: unread ? "700" : "600" }}>
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

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t("notif.close")}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
      />
      <View
        style={{
          backgroundColor: tokens.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          padding: spacing.xl,
          gap: spacing.lg,
          maxHeight: "80%",
        }}
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
          <AppText variant="title">{item.title || t("notif.detailsTitle")}</AppText>

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <AppText style={{ fontSize: 16 }}>{iconForType(item.type)}</AppText>
            <AppText variant="muted">{typeLabel}</AppText>
            {when ? (
              <AppText variant="muted" style={{ marginLeft: "auto", fontSize: 12 }}>
                {when}
              </AppText>
            ) : null}
          </View>

          {item.body ? (
            <RichBody text={item.body} onOpenPath={onOpenPath} />
          ) : (
            <AppText variant="muted">{t("notif.noLink")}</AppText>
          )}

          {pairs.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="muted">{t("notif.detailsData")}</AppText>
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
