"use client";

// Full received-alerts list (Administrator's own notification inbox). Reuses
// the same hook as the topbar bell so both surfaces share one mutation path
// (RPCs called directly from the browser client — see useAdminNotifications).
// Clicking a row's title follows its action_url (when it's a safe same-origin
// admin route) in addition to marking it read; the row also exposes explicit
// "mark read" / "delete" buttons so an admin can triage without navigating away.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { useAdminNotifications } from "@/lib/admin/useAdminNotifications";
import {
  PAGE_LIMIT,
  iconForType,
  isAllowedAdminActionUrl,
  type NotificationItem,
} from "@/lib/admin/notif-types";

export function AlertsList({
  initialItems,
  initialUnread,
  locale,
  strings,
  profileId,
}: {
  initialItems: NotificationItem[];
  initialUnread: number;
  locale: string;
  strings: Record<string, string>;
  profileId: string | null;
}) {
  const s = (k: string) => strings[k] ?? k;
  const router = useRouter();
  const { items, unread, markRead, markAllRead, remove } = useAdminNotifications({
    initialItems,
    initialUnread,
    limit: PAGE_LIMIT,
    profileId,
  });

  // Per-action busy key so only the clicked control spins. The hook's mutations
  // are optimistic (state flips immediately), but the RPC is still in flight
  // until it settles — the finally guarantees the button re-enables on failure.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await fn();
    } finally {
      setBusyKey(null);
    }
  };

  const typeLabel = (type: string): string => {
    const key = `alerts.type.${type}`;
    return strings[key] ?? s("alerts.type.default");
  };

  const fmt = (iso: string): string => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Baku",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  };

  const openItem = (n: NotificationItem) => {
    void markRead(n.id);
    // Only navigate for a KNOWN admin-panel route (see notif-types.ts) — a
    // safe-shaped but unknown path (e.g. a stray web-app deep link) is marked
    // read only, so it can never send the admin to a 404.
    if (isAllowedAdminActionUrl(n.action_url)) router.push(n.action_url);
  };

  return (
    <div className="card">
      <div className="card-head">
        <span className="muted">
          {s("alerts.unreadCount").replace("{n}", String(unread))}
        </span>
        <ActionButton
          type="button"
          className="btn-ghost btn-sm"
          disabled={unread === 0}
          pending={busyKey === "all"}
          pendingLabel={s("pend.processing")}
          onClick={() => void run("all", markAllRead)}
        >
          {s("alerts.markAllRead")}
        </ActionButton>
      </div>

      {items.length === 0 ? (
        <p className="muted">{s("alerts.empty")}</p>
      ) : (
        <ul className="alert-list">
          {items.map((n) => (
            <li key={n.id} className={`alert-row${n.read_at ? "" : " unread"}`}>
              <span className="abell-ic" aria-hidden="true">
                {iconForType(n.type)}
              </span>
              <div
                className="alert-body-col"
                role={isAllowedAdminActionUrl(n.action_url) ? "button" : undefined}
                tabIndex={isAllowedAdminActionUrl(n.action_url) ? 0 : undefined}
                onClick={() => openItem(n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") openItem(n);
                }}
                style={{ cursor: isAllowedAdminActionUrl(n.action_url) ? "pointer" : "default" }}
              >
                <div className="alert-row-top">
                  <span className="alert-title">{n.title}</span>
                  <span className="pill pill-muted pill-inline">{typeLabel(n.type)}</span>
                </div>
                {n.body && <p className="alert-text">{n.body}</p>}
                <span className="alert-time">{fmt(n.created_at)}</span>
              </div>
              <div className="row-actions">
                {!n.read_at && (
                  <ActionButton
                    type="button"
                    className="btn-ghost btn-sm"
                    pending={busyKey === `read:${n.id}`}
                    pendingLabel={s("pend.processing")}
                    onClick={() => void run(`read:${n.id}`, () => markRead(n.id))}
                  >
                    {s("alerts.markRead")}
                  </ActionButton>
                )}
                <ActionButton
                  type="button"
                  className="btn-ghost btn-sm"
                  style={{ color: "#dc2626", borderColor: "#fecaca" }}
                  pending={busyKey === `del:${n.id}`}
                  pendingLabel={s("pend.deleting")}
                  onClick={() => void run(`del:${n.id}`, () => remove(n.id))}
                >
                  {s("alerts.delete")}
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
