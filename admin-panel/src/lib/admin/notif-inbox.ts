// SERVER-ONLY notification inbox reads for the admin topbar bell + /alerts
// page. Uses the request-scoped SESSION client (anon key + the admin's
// cookies) — RLS (notif_select, migration 076: recipient_profile_id =
// current_profile_id(), self-only) returns only the caller's own rows, so
// this never needs the service-role client. Every read here ALSO adds an
// explicit .eq("recipient_profile_id", profileId) filter — belt-and-suspenders
// defense in depth so the intent is obvious in the query itself and a future
// RLS regression (like the pre-076 "OR is_admin()" hole) can't silently leak
// every admin's notifications into this inbox again. Mirrors
// web-app/src/lib/notifications/inbox.ts (same table, same self-scoped RPC).
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_COLUMNS, type NotificationItem } from "@/lib/admin/notif-types";

/**
 * Fetch the caller's most recent, non-expired notifications (newest first).
 * `profileId` is the acting admin's own profiles.id — callers resolve it via
 * requirePanelAccess()/requireAdmin() (AuthContext.profileId) and pass it in;
 * a missing profile id returns an empty inbox rather than guessing.
 */
export async function getAdminInbox(
  limit: number,
  profileId: string | null,
): Promise<NotificationItem[]> {
  if (!profileId) return [];
  try {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("recipient_profile_id", profileId)
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
  profileId: string | null,
): Promise<{ items: NotificationItem[]; unread: number }> {
  const [items, unread] = await Promise.all([
    getAdminInbox(limit, profileId),
    getAdminUnreadCount(),
  ]);
  return { items, unread };
}
