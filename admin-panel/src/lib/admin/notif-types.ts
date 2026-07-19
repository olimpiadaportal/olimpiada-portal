// Shared types + pure helpers for the admin notification bell / alerts page.
// PLAIN module (no server-only / client-only import) so it is safe to import
// from both the server-rendered layout/page and the "use client" bell +
// alerts-list components.
//
// These are rows of the SAME public.notifications table the web-app inbox
// reads (see web-app/src/lib/notifications/types.ts) — an admin's session
// simply reads its OWN rows (notif_select RLS: recipient_profile_id =
// current_profile_id()). Today the only producers targeting an administrator
// profile are the operational events described in STATUS: admin_new_parent,
// admin_new_purchase, admin_new_subscription (category "admin"), but this
// stays open-ended (no hardcoded category filter) so future admin-facing
// notification types render with a sane default icon/label.

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

/** How many notifications the topbar dropdown seeds / the alerts page fetches. */
export const BELL_LIMIT = 15;
export const PAGE_LIMIT = 50;

/** Emoji glyph per notification type (falls back to the bell). */
export function iconForType(type: string): string {
  switch (type) {
    case "admin_new_parent":
      return "\u{1F464}"; // bust in silhouette (new parent registration)
    case "admin_new_purchase":
      return "\u{1F3C5}"; // medal (new olympiad purchase)
    case "admin_new_subscription":
      return "\u{1F4B3}"; // credit card (new subscription)
    default:
      return "\u{1F514}"; // bell
  }
}

/**
 * A deep link is only followed if it is a SAME-ORIGIN RELATIVE path. Rejects
 * absolute URLs, protocol-relative (`//host`), backslash tricks, scheme
 * injection (`javascript:` / `http://`), and anything not starting with a
 * single `/`. Mirrors the safeNext() posture used by the web-app auth callback
 * and web-app's own notification bell.
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
