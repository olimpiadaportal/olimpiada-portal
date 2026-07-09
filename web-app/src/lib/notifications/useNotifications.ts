"use client";

// Client notification store: seeded from a server snapshot, kept live by Supabase
// Realtime (postgres_changes INSERT on public.notifications, filtered to the
// caller), with optimistic read/badge/delete backed by the owner-scoped RPCs.
// Both the bell and the full-page panel share this hook so their state stays in
// sync within a mount.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import type { NotificationItem } from "@/lib/notifications/types";

function toItem(row: Record<string, unknown>): NotificationItem {
  return {
    id: String(row.id),
    type: String(row.type ?? ""),
    title: String(row.title ?? ""),
    body: (row.body as string | null) ?? null,
    data_json: (row.data_json as Record<string, unknown> | null) ?? null,
    action_url: (row.action_url as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    priority: typeof row.priority === "number" ? row.priority : null,
    read_at: (row.read_at as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function useNotifications(opts: {
  me: string;
  initialItems: NotificationItem[];
  initialUnread: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>(opts.initialItems);
  const [unread, setUnread] = useState<number>(opts.initialUnread);
  // The most recent live-arrived notification, surfaced as a transient toast.
  const [toast, setToast] = useState<NotificationItem | null>(null);

  // Mirror the live badge count into a ref so the (dependency-stable) mutation
  // callbacks can read the true prior value for an accurate rollback without
  // re-subscribing on every count change.
  const unreadRef = useRef(unread);
  unreadRef.current = unread;

  // Unique per mount so two hook instances on one page (bell + panel) don't
  // collide on the same Realtime topic.
  const channelIdRef = useRef<string>(Math.random().toString(36).slice(2));

  // Live subscription: prepend new rows, bump the badge, flash a toast.
  useEffect(() => {
    if (!opts.me) return;
    const supabase = getBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`notif:${opts.me}:${channelIdRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_profile_id=eq.${opts.me}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const item = toItem(payload.new);
          setItems((prev) => {
            if (prev.some((n) => n.id === item.id)) return prev; // dedupe
            return [item, ...prev];
          });
          if (!item.read_at) setUnread((u) => u + 1);
          setToast(item);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [opts.me]);

  // Mark one notification read. Optimistic first, then AWAIT the owner-scoped
  // RPC so the change actually persists; on error we roll the row back to its
  // prior read_at and restore the badge. No router.refresh() here — a single
  // click's optimistic + persisted state is enough, and refreshing on every
  // click would be heavy. The persisted read_at is authoritative, so a later
  // refresh/navigation still shows the row read.
  const markRead = useCallback(async (id: string) => {
    let wasUnread = false;
    setItems((prev) =>
      prev.map((n) => {
        if (n.id === id && !n.read_at) {
          wasUnread = true;
          return { ...n, read_at: new Date().toISOString() };
        }
        return n;
      }),
    );
    if (!wasUnread) return; // already read — nothing to persist
    setUnread((u) => Math.max(0, u - 1));

    const supabase = getBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
    if (error) {
      // Roll back: the row was unread before, so restore read_at = null.
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)));
      setUnread((u) => u + 1);
      console.error("mark_notification_read failed", error);
    }
  }, []);

  // Mark every loaded notification read. On success refresh the server tree so
  // the layout bell and any server-rendered counts re-read the persisted state
  // and stay consistent across mounts; on error restore the pre-click snapshot.
  const markAllRead = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const prevUnread = unreadRef.current;
    let snapshot: NotificationItem[] = [];
    setItems((prev) => {
      snapshot = prev;
      return prev.map((n) => (n.read_at ? n : { ...n, read_at: nowIso }));
    });
    setUnread(0);

    const supabase = getBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) {
      setItems(snapshot);
      setUnread(prevUnread);
      console.error("mark_all_notifications_read failed", error);
      return;
    }
    router.refresh();
  }, [router]);

  // Delete a notification. On success refresh the server tree so the change
  // survives a re-fetch; on error re-insert the row at its original position and
  // restore the badge.
  const remove = useCallback(async (id: string) => {
    const prevUnread = unreadRef.current;
    let removed: NotificationItem | undefined;
    let index = -1;
    setItems((prev) => {
      index = prev.findIndex((n) => n.id === id);
      if (index === -1) return prev;
      removed = prev[index];
      return prev.filter((n) => n.id !== id);
    });
    if (!removed) return; // not in the loaded list
    if (!removed.read_at) setUnread((u) => Math.max(0, u - 1));

    const supabase = getBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("delete_notification", { p_id: id });
    if (error) {
      const restored = removed;
      const at = index;
      setItems((prev) => {
        if (prev.some((n) => n.id === id)) return prev; // already back
        const next = [...prev];
        next.splice(Math.min(Math.max(at, 0), next.length), 0, restored);
        return next;
      });
      setUnread(prevUnread);
      console.error("delete_notification failed", error);
      return;
    }
    router.refresh();
  }, [router]);

  const dismissToast = useCallback(() => setToast(null), []);

  // Auto-hide the toast after a few seconds.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  return { items, unread, toast, markRead, markAllRead, remove, dismissToast };
}
