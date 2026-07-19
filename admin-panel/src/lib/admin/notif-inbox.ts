// SERVER-ONLY notification inbox reads for the admin topbar bell + /alerts
// page. Uses the request-scoped SESSION client (anon key + the admin's
// cookies) — RLS (notif_select) returns only the caller's own rows, so this
// never needs the service-role client. Mirrors
// web-app/src/lib/notifications/inbox.ts (same table, same self-scoped RPC).
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_COLUMNS, type NotificationItem } from "@/lib/admin/notif-types";

/** Fetch the caller's most recent, non-expired notifications (newest first). */
export async function getAdminInbox(limit: number): Promise<NotificationItem[]> {
  try {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));
    if (error || !data) return [];
    return data as unknown as NotificationItem[];
  } catch {
    return [];
  }
}

/** The caller's unread count (RPC; 0 on any failure). */
export async function getAdminUnreadCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_unread_notification_count");
    if (error || typeof data !== "number") return 0;
    return data;
  } catch {
    return 0;
  }
}

/** One round-trip snapshot for the layout/page mount: latest items + unread count. */
export async function getAdminInboxSnapshot(
  limit: number,
): Promise<{ items: NotificationItem[]; unread: number }> {
  const [items, unread] = await Promise.all([
    getAdminInbox(limit),
    getAdminUnreadCount(),
  ]);
  return { items, unread };
}
