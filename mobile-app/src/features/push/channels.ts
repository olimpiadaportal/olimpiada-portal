// PURE push channel/category map (no native imports — unit-tested in
// __tests__/push-channels.test.ts). The web delivery processor sends
// Android `channelId = notification.category` (or "default"), so the channel
// ids here MUST stay byte-identical to the engine's known category set.
// Names are i18n keys (mob.push.ch.*) resolved at creation time.

export type ChannelImportance = "default" | "high";

export type PushChannel = {
  /** Android channel id AND iOS category identifier (= engine category). */
  id: string;
  /** i18n key for the user-visible channel name (Android settings UI). */
  nameKey: string;
  importance: ChannelImportance;
};

// Announcement + olympiad are the time-sensitive ones (admin broadcasts,
// olympiad access/results) → HIGH; the rest stay DEFAULT.
export const PUSH_CHANNELS: PushChannel[] = [
  { id: "default", nameKey: "mob.push.ch.default", importance: "default" },
  { id: "olympiad", nameKey: "mob.push.ch.olympiad", importance: "high" },
  { id: "progress", nameKey: "mob.push.ch.progress", importance: "default" },
  { id: "billing", nameKey: "mob.push.ch.billing", importance: "default" },
  { id: "announcement", nameKey: "mob.push.ch.announcement", importance: "high" },
  { id: "news", nameKey: "mob.push.ch.news", importance: "default" },
];

/** Map an engine category (free-text column) to a known channel id. */
export function channelIdForCategory(category: string | null | undefined): string {
  if (!category) return "default";
  return PUSH_CHANNELS.some((c) => c.id === category) ? category : "default";
}
