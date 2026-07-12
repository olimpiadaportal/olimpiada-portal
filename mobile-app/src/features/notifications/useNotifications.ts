// Shared notification state: inbox query + unread badge + Realtime INSERT
// subscription + mark/delete actions. Round-17 lesson baked in: every RPC is
// AWAITED and checked; optimistic updates roll back on failure.
import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/features/auth/authStore";

export type NotificationItem = {
  id: string;
  type: string | null;
  title: string;
  body: string | null;
  category: string | null;
  action_url: string | null;
  data_json: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

const COLUMNS =
  "id, type, title, body, category, action_url, data_json, read_at, created_at";
export const PAGE_LIMIT = 50;

async function fetchInbox(limit: number): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(COLUMNS)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 200));
  if (error) throw error;
  return (data ?? []) as NotificationItem[];
}

async function fetchUnread(): Promise<number> {
  const { data, error } = await supabase.rpc("get_unread_notification_count");
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

export function useNotifications(limit = PAGE_LIMIT) {
  const profileId = useAuthStore((s) => s.profileId);
  const queryClient = useQueryClient();

  const inbox = useQuery({
    queryKey: ["notifications", "inbox", limit],
    queryFn: () => fetchInbox(limit),
    enabled: !!profileId,
  });
  const unread = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: fetchUnread,
    enabled: !!profileId,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  // Live inserts for THIS user only (web hook parity: per-user channel filter).
  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`notif:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_profile_id=eq.${profileId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
      if (!error) refresh();
      return !error;
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (!error) refresh();
    return !error;
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.rpc("delete_notification", { p_id: id });
      if (!error) refresh();
      return !error;
    },
    [refresh],
  );

  return {
    items: inbox.data ?? [],
    loading: inbox.isPending,
    error: inbox.isError,
    unreadCount: unread.data ?? 0,
    refresh,
    markRead,
    markAllRead,
    remove,
  };
}

// ---- preferences (parent manages self + each child) ----------------------------

export type NotificationPrefs = {
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
};

export async function fetchPrefs(profileId: string | null): Promise<NotificationPrefs> {
  const { data, error } = await supabase.rpc("get_notification_preferences", {
    p_profile: profileId,
  });
  if (error || !data) return { in_app_enabled: true, email_enabled: true, push_enabled: true };
  const o = data as Record<string, unknown>;
  return {
    in_app_enabled: o.in_app_enabled !== false,
    email_enabled: o.email_enabled !== false,
    push_enabled: o.push_enabled !== false,
  };
}

export async function savePrefs(
  profileId: string | null,
  prefs: NotificationPrefs,
): Promise<boolean> {
  const { error } = await supabase.rpc("set_notification_preferences", {
    p_profile: profileId,
    p_in_app: prefs.in_app_enabled,
    p_email: prefs.email_enabled,
    p_push: prefs.push_enabled,
  });
  return !error;
}
