// SERVER-ONLY notification inbox reads. Uses the request-scoped USER-SESSION
// client (anon key + the caller's cookies); RLS returns only the caller's rows,
// so this is safe for both parent and child pages. Never uses the service-role
// client for reads — the notification write path (create_notification) is the
// only privileged surface (see events.ts).
import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_COLUMNS,
  type NotificationItem,
} from "@/lib/notifications/types";

/** Fetch the caller's most recent, non-expired notifications (newest first). */
export async function getInbox(limit: number): Promise<NotificationItem[]> {
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
export async function getUnreadCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_unread_notification_count");
    if (error || typeof data !== "number") return 0;
    return data;
  } catch {
    return 0;
  }
}

/** One round-trip snapshot for a shell/page mount: latest items + unread count. */
export async function getInboxSnapshot(
  limit: number,
): Promise<{ items: NotificationItem[]; unread: number }> {
  const [items, unread] = await Promise.all([getInbox(limit), getUnreadCount()]);
  return { items, unread };
}
