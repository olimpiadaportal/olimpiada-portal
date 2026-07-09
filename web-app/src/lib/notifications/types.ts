// Shared notification types + pure helpers. NO server-only / client-only imports
// so this module is safe to import from both server components and "use client"
// components (the inbox service, the pages, the hook, and the UI components all
// share these shapes and helpers).

/** One in-app notification row as returned by the inbox select. */
export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data_json: Record<string, unknown> | null;
  action_url: string | null;
  category: string | null;
  priority: number | null;
  read_at: string | null;
  created_at: string;
};

/** Columns the inbox select requests (kept in one place). */
export const NOTIFICATION_COLUMNS =
  "id,type,title,body,data_json,action_url,category,priority,read_at,created_at";

/** How many notifications the dropdown shows / the pages fetch initially. */
export const BELL_LIMIT = 8;
export const PAGE_LIMIT = 50;

// The i18n keys every notification surface (bell, pages, toast, preferences)
// needs. Server surfaces resolve these into a { key -> text } dict via getT()
// and pass it down, so the client never imports the full trilingual catalog.
export const NOTIF_KEYS = [
  "notif.bell",
  "notif.title",
  "notif.markAllRead",
  "notif.seeAll",
  "notif.empty",
  "notif.emptyHint",
  "notif.delete",
  "notif.markRead",
  "notif.open",
  "notif.newLabel",
  "notif.dismiss",
  "notif.detailsTitle",
  "notif.close",
  "notif.noLink",
  "notif.detailsData",
  "notif.timeNow",
  "notif.timeMin",
  "notif.timeHour",
  "notif.timeDay",
  "notif.filterAll",
  "notif.cat.olympiad",
  "notif.cat.progress",
  "notif.cat.billing",
  "notif.cat.announcement",
  "notif.cat.news",
  "notif.prefs.title",
  "notif.prefs.desc",
  "notif.prefs.yourChannels",
  "notif.prefs.children",
  "notif.prefs.inApp",
  "notif.prefs.email",
  "notif.prefs.push",
  "notif.prefs.channelNote",
  "notif.prefs.saved",
  "notif.prefs.saving",
  "notif.prefs.error",
  "notif.prefs.noChildren",
] as const;

/** Emoji glyph per notification type (falls back to the bell). */
export function iconForType(type: string): string {
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

/**
 * A deep link is only followed if it is a SAME-ORIGIN RELATIVE path. Rejects
 * absolute URLs, protocol-relative (`//host`), backslash tricks, scheme
 * injection (`javascript:` / `http://`), and anything not starting with a single
 * `/`. Mirrors the safeNext() posture in the auth callback route.
 */
export function isSafeRelativeUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0 || url.length > 512) return false;
  if (url[0] !== "/") return false; // must be root-relative
  if (url[1] === "/" || url[1] === "\\") return false; // no //host or /\host
  if (url.includes("\\")) return false; // no backslashes
  if (url.includes("://")) return false; // no embedded scheme
  // Reject control characters, spaces and DEL (whitespace/encoding tricks).
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c < 0x21 || c === 0x7f) return false;
  }
  return true;
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
