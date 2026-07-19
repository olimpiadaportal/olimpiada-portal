"use client";

// Shared client-side state for the admin's OWN notification inbox — used by
// both the topbar NotificationBell (dropdown) and the /alerts page's list.
// No cross-tab/module-level store and no Realtime subscription (unlike the
// web-app parent/child inbox): this is a single admin session reading a low
// volume of operational alerts, so a per-mount snapshot + explicit refresh +
// a light poll is simpler and just as reliable. Every mutation is optimistic
// and re-syncs from the server (via refresh()) if the RPC call fails.
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NOTIFICATION_COLUMNS, type NotificationItem } from "@/lib/admin/notif-types";

const POLL_MS = 60_000;

export function useAdminNotifications(opts: {
  initialItems: NotificationItem[];
  initialUnread: number;
  limit: number;
  /** The acting admin/CM's own profiles.id — explicit belt-and-suspenders
   *  filter on top of RLS (notif_select is self-scoped since migration 076). */
  profileId: string | null;
}) {
  const [items, setItems] = useState<NotificationItem[]>(opts.initialItems);
  const [unread, setUnread] = useState<number>(opts.initialUnread);

  // Always-current refs so the callbacks below never close over stale state.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const limitRef = useRef(opts.limit);
  limitRef.current = opts.limit;
  const profileIdRef = useRef(opts.profileId);
  profileIdRef.current = opts.profileId;

  const refresh = useCallback(async () => {
    const profileId = profileIdRef.current;
    if (!profileId) return;
    try {
      const supabase = createClient();
      const nowIso = new Date().toISOString();
      const [{ data: rows }, { data: count, error: countErr }] = await Promise.all([
        supabase
          .from("notifications")
          .select(NOTIFICATION_COLUMNS)
          .eq("recipient_profile_id", profileId)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order("created_at", { ascending: false })
          .limit(limitRef.current),
        supabase.rpc("get_unread_notification_count"),
      ]);
      if (rows) setItems(rows as unknown as NotificationItem[]);
      if (!countErr && typeof count === "number") setUnread(count);
    } catch (e) {
      console.error("[admin] notification refresh failed", e);
    }
  }, []);

  // Light background poll — keeps the badge honest even if the admin never
  // opens the dropdown/page. Realtime is intentionally skipped here (see file
  // header); this trades a little latency for a much smaller surface.
  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const markRead = useCallback(
    async (id: string) => {
      const target = itemsRef.current.find((n) => n.id === id);
      if (!target || target.read_at) return;
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: nowIso } : n)));
      setUnread((u) => Math.max(0, u - 1));

      const supabase = createClient();
      const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
      if (error) {
        console.error("[admin] mark_notification_read failed", error.message);
        void refresh(); // resync with the server truth rather than hand-rolling a rollback
      }
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    if (itemsRef.current.every((n) => n.read_at) && unread === 0) return;
    const nowIso = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })));
    setUnread(0);

    const supabase = createClient();
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) {
      console.error("[admin] mark_all_notifications_read failed", error.message);
      void refresh();
    }
  }, [refresh, unread]);

  const remove = useCallback(
    async (id: string) => {
      const target = itemsRef.current.find((n) => n.id === id);
      if (!target) return;
      setItems((prev) => prev.filter((n) => n.id !== id));
      if (!target.read_at) setUnread((u) => Math.max(0, u - 1));

      const supabase = createClient();
      const { error } = await supabase.rpc("delete_notification", { p_id: id });
      if (error) {
        console.error("[admin] delete_notification failed", error.message);
        void refresh();
      }
    },
    [refresh],
  );

  return { items, unread, refresh, markRead, markAllRead, remove };
}
