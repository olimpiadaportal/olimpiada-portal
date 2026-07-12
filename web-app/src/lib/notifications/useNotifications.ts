"use client";

// Client notification store — ONE shared source of truth per profile.
//
// The header bell and the full-page panel mount independently (different parts
// of the tree, different server snapshots), so per-mount useState desynced them:
// marking a row read in the bell never updated the page (or vice versa). This
// module now keeps a MODULE-LEVEL store keyed by profile id; every hook instance
// reads it via useSyncExternalStore, so items / unread badge / toast are always
// identical on every surface, and all mutations go through the same owner-scoped
// RPCs (mark_notification_read / mark_all_notifications_read /
// delete_notification) with optimistic apply + rollback.
//
// Server snapshots (initialItems/initialUnread props, refreshed by navigation or
// router.refresh) RE-SEED the store: incoming rows are merged with what the
// store already knows, and NEWER LOCAL STATE WINS — a row read/deleted locally
// is never resurrected as unread by a stale server payload (localReadAt map,
// delete tombstones and the mark-all watermark reconcile every seed).
//
// Realtime: one INSERT subscription per store (attached with the first
// subscriber, detached with the last) prepends new rows, bumps the badge and
// flashes the toast — exactly the previous per-mount behavior, minus the
// duplicate channels.
//
// SSR note: on the server every hook call gets its OWN ephemeral store instance
// (module state must never be shared across requests/users); the shared map is
// used only in the browser. Hydration stays consistent because a full document
// load always starts with an empty map and each surface seeds the same data it
// was server-rendered with.
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
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

type InboxState = {
  items: NotificationItem[];
  unread: number;
  /** The most recent live-arrived notification, surfaced as a transient toast. */
  toast: NotificationItem | null;
};

class InboxStore {
  readonly key: string;

  private state: InboxState = { items: [], unread: 0, toast: null };
  private listeners = new Set<() => void>();

  // Local mutation memory used to reconcile stale server snapshots:
  // id -> ISO the row was read locally (cleared once the server confirms).
  private localReadAt = new Map<string, string>();
  // Locally deleted ids — a stale snapshot must not re-insert them.
  private deleted = new Set<string>();
  // mark-all-read watermark: anything created at/before this instant is read.
  private allReadAt: string | null = null;

  private channel: RealtimeChannel | null = null;
  private notifyQueued = false;

  constructor(key: string) {
    this.key = key;
  }

  // Stable references for useSyncExternalStore.
  getState = (): InboxState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.attachRealtime();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.detachRealtime();
    };
  };

  /** Synchronous notify — safe from event handlers / async continuations. */
  private setState(patch: Partial<InboxState>) {
    this.state = { ...this.state, ...patch };
    for (const l of Array.from(this.listeners)) l();
  }

  /** Deferred notify — for mutations that happen during React render (seed). */
  private setStateDeferred(patch: Partial<InboxState>) {
    this.state = { ...this.state, ...patch };
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const l of Array.from(this.listeners)) l();
    });
  }

  /**
   * Merge a fresh SERVER snapshot into the store. Newer local reads/deletes win
   * over the snapshot (never resurrect unread/deleted rows); rows the store
   * knows but the snapshot doesn't (realtime arrivals, the other surface's
   * wider window) are retained. Called during render — notification of OTHER
   * subscribers is deferred to a microtask; the calling component reads the
   * merged state in the same render pass.
   */
  seed(serverItems: NotificationItem[], serverUnread: number) {
    let unread = Math.max(0, Math.floor(Number(serverUnread) || 0));
    const merged: NotificationItem[] = [];
    const seen = new Set<string>();
    // Parsed watermark: Postgres timestamps ("+00:00") and JS ISO ("Z") don't
    // compare safely as raw strings, so the mark-all cutoff uses epoch millis.
    const watermarkMs = this.allReadAt ? Date.parse(this.allReadAt) : NaN;

    for (const raw of serverItems) {
      if (!raw?.id) continue;
      if (this.deleted.has(raw.id)) {
        if (!raw.read_at) unread -= 1; // server still counted it
        continue;
      }
      seen.add(raw.id);
      let readAt = raw.read_at;
      if (readAt) {
        this.localReadAt.delete(raw.id); // server confirmed the local read
      } else {
        const coveredByMarkAll =
          Number.isFinite(watermarkMs) && Date.parse(raw.created_at) <= watermarkMs;
        const local =
          this.localReadAt.get(raw.id) ??
          (coveredByMarkAll ? this.allReadAt ?? undefined : undefined);
        if (local) {
          readAt = local;
          unread -= 1; // server still counted it as unread
        }
      }
      merged.push(readAt === raw.read_at ? raw : { ...raw, read_at: readAt });
    }

    // Retain rows the snapshot doesn't cover. Unread ones NEWER than the
    // snapshot's newest row (realtime arrivals the server query missed) are
    // added to the count; older retained rows are already inside serverUnread.
    const newestServer = serverItems.length > 0 ? serverItems[0]?.created_at ?? "" : "";
    for (const n of this.state.items) {
      if (seen.has(n.id) || this.deleted.has(n.id)) continue;
      merged.push(n);
      if (!n.read_at && n.created_at > newestServer) unread += 1;
    }

    merged.sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    );

    // After a mark-all-read, any surviving unread row must be newer than the
    // watermark — count from the window instead of trusting a stale server sum.
    if (this.allReadAt) unread = merged.filter((n) => !n.read_at).length;
    unread = Math.max(0, unread);

    const changed =
      unread !== this.state.unread ||
      merged.length !== this.state.items.length ||
      merged.some((n, i) => {
        const o = this.state.items[i];
        return !o || o.id !== n.id || o.read_at !== n.read_at;
      });
    if (!changed) return;
    this.setStateDeferred({ items: merged, unread });
  }

  /** Mark one notification read (optimistic; rolls back on RPC error). */
  async markRead(id: string): Promise<void> {
    const current = this.state.items.find((n) => n.id === id);
    if (!current || current.read_at) return; // unknown or already read
    const nowIso = new Date().toISOString();
    this.localReadAt.set(id, nowIso);
    this.setState({
      items: this.state.items.map((n) =>
        n.id === id ? { ...n, read_at: nowIso } : n,
      ),
      unread: Math.max(0, this.state.unread - 1),
    });

    const supabase = getBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
    if (error) {
      this.localReadAt.delete(id);
      this.setState({
        items: this.state.items.map((n) =>
          n.id === id ? { ...n, read_at: null } : n,
        ),
        unread: this.state.unread + 1,
      });
      console.error("mark_notification_read failed", error);
    }
  }

  /** Mark everything read (optimistic + watermark; rolls back on RPC error). */
  async markAllRead(): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const prevItems = this.state.items;
    const prevUnread = this.state.unread;
    const prevAllReadAt = this.allReadAt;
    const prevLocalReadAt = new Map(this.localReadAt);

    this.allReadAt = nowIso;
    for (const n of prevItems) if (!n.read_at) this.localReadAt.set(n.id, nowIso);
    this.setState({
      items: prevItems.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })),
      unread: 0,
    });

    const supabase = getBrowserClient();
    if (!supabase) return false;
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) {
      this.allReadAt = prevAllReadAt;
      this.localReadAt = prevLocalReadAt;
      this.setState({ items: prevItems, unread: prevUnread });
      console.error("mark_all_notifications_read failed", error);
      return false;
    }
    return true;
  }

  /** Delete a notification (optimistic + tombstone; restores on RPC error). */
  async remove(id: string): Promise<boolean> {
    const index = this.state.items.findIndex((n) => n.id === id);
    if (index === -1) return false;
    const removed = this.state.items[index];
    this.deleted.add(id);
    this.setState({
      items: this.state.items.filter((n) => n.id !== id),
      unread: removed.read_at
        ? this.state.unread
        : Math.max(0, this.state.unread - 1),
    });

    const supabase = getBrowserClient();
    if (!supabase) return false;
    const { error } = await supabase.rpc("delete_notification", { p_id: id });
    if (error) {
      this.deleted.delete(id);
      let items = this.state.items;
      if (!items.some((n) => n.id === id)) {
        items = [...items];
        items.splice(Math.min(Math.max(index, 0), items.length), 0, removed);
      }
      this.setState({
        items,
        unread: removed.read_at ? this.state.unread : this.state.unread + 1,
      });
      console.error("delete_notification failed", error);
      return false;
    }
    return true;
  }

  dismissToast = () => {
    if (this.state.toast) this.setState({ toast: null });
  };

  // ---- Realtime (one channel per store, attached while anyone listens) ----

  private attachRealtime() {
    if (this.channel || !this.key || typeof window === "undefined") return;
    const supabase = getBrowserClient();
    if (!supabase) return;
    // Random suffix so a rapid detach/attach (StrictMode) never collides on the
    // same topic while the previous channel is still tearing down.
    const topic = `notif:${this.key}:${Math.random().toString(36).slice(2)}`;
    this.channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_profile_id=eq.${this.key}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const item = toItem(payload.new);
          if (this.deleted.has(item.id)) return;
          if (this.state.items.some((n) => n.id === item.id)) return; // dedupe
          this.setState({
            items: [item, ...this.state.items],
            unread: this.state.unread + (item.read_at ? 0 : 1),
            toast: item,
          });
        },
      )
      .subscribe();
  }

  private detachRealtime() {
    if (!this.channel) return;
    const channel = this.channel;
    this.channel = null;
    try {
      void getBrowserClient()?.removeChannel(channel);
    } catch {
      // best-effort teardown
    }
  }
}

// Browser-only shared registry (one store per profile id).
const sharedStores = new Map<string, InboxStore>();

function getSharedStore(key: string): InboxStore {
  let store = sharedStores.get(key);
  if (!store) {
    store = new InboxStore(key);
    sharedStores.set(key, store);
  }
  return store;
}

export function useNotifications(opts: {
  me: string;
  initialItems: NotificationItem[];
  initialUnread: number;
}) {
  const router = useRouter();

  // Shared store in the browser; a render-scoped instance on the server so SSR
  // module state never crosses requests/users.
  const storeRef = useRef<InboxStore | null>(null);
  if (storeRef.current === null || storeRef.current.key !== opts.me) {
    storeRef.current =
      typeof window === "undefined"
        ? new InboxStore(opts.me)
        : getSharedStore(opts.me);
  }
  const store = storeRef.current;

  // Apply each distinct server snapshot exactly once (identity-gated — a fresh
  // server render always produces a new array). Runs during render so the FIRST
  // paint already shows the merged data (hydration-consistent); other mounted
  // surfaces are notified via the store's deferred microtask.
  const seedRef = useRef<{ store: InboxStore; items: NotificationItem[] } | null>(
    null,
  );
  if (seedRef.current?.store !== store || seedRef.current?.items !== opts.initialItems) {
    seedRef.current = { store, items: opts.initialItems };
    store.seed(opts.initialItems, opts.initialUnread);
  }

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  // Mark one read: optimistic + persisted by the store. No router.refresh —
  // the shared store already updates every mounted surface, and the persisted
  // read_at is authoritative for later navigations.
  const markRead = useCallback(
    async (id: string) => {
      await store.markRead(id);
    },
    [store],
  );

  // Mark-all / delete refresh the server tree on success so server-rendered
  // snapshots (layout bell seeds, page lists) re-read the persisted state.
  const markAllRead = useCallback(async () => {
    const ok = await store.markAllRead();
    if (ok) router.refresh();
  }, [store, router]);

  const remove = useCallback(
    async (id: string) => {
      const ok = await store.remove(id);
      if (ok) router.refresh();
    },
    [store, router],
  );

  const dismissToast = useCallback(() => store.dismissToast(), [store]);

  // Auto-hide the toast after a few seconds (idempotent across surfaces).
  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => store.dismissToast(), 6000);
    return () => clearTimeout(timer);
  }, [state.toast, store]);

  return {
    items: state.items,
    unread: state.unread,
    toast: state.toast,
    markRead,
    markAllRead,
    remove,
    dismissToast,
  };
}
