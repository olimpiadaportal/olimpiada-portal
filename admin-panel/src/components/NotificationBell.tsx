"use client";

// Admin topbar notification bell — receives the operational alerts DB
// producers address to this administrator's profile (admin_new_parent,
// admin_new_purchase, admin_new_subscription; more may follow). Shows an
// unread badge and a dropdown of the latest items; each row marks itself
// read and, when it carries a safe same-origin action_url, navigates there
// (e.g. /accounts, /olympiad). "See all" links to the full /alerts page.
// Ported/simplified from web-app/src/components/NotificationBell.tsx: no
// cross-tab store and no Realtime — see useAdminNotifications for why.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminNotifications } from "@/lib/admin/useAdminNotifications";
import {
  BELL_LIMIT,
  iconForType,
  isSafeRelativeUrl,
  relativeTime,
  type NotificationItem,
} from "@/lib/admin/notif-types";

export function NotificationBell({
  initialItems,
  initialUnread,
  seeAllHref,
  strings,
}: {
  initialItems: NotificationItem[];
  initialUnread: number;
  seeAllHref: string;
  strings: Record<string, string>;
}) {
  const s = (k: string) => strings[k] ?? k;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { items, unread, refresh, markRead, markAllRead } = useAdminNotifications({
    initialItems,
    initialUnread,
    limit: BELL_LIMIT,
  });

  const timeLabels = {
    now: s("alerts.timeNow"),
    min: s("alerts.timeMin"),
    hour: s("alerts.timeHour"),
    day: s("alerts.timeDay"),
  };

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o;
      if (next) void refresh(); // freshen the dropdown every time it's opened
      return next;
    });
  };

  const activate = (n: NotificationItem) => {
    void markRead(n.id);
    setOpen(false);
    if (isSafeRelativeUrl(n.action_url)) router.push(n.action_url);
  };

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div className="abell" ref={wrapRef}>
      <button
        type="button"
        className="abell-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={s("alerts.bell")}
        onClick={toggleOpen}
      >
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="abell-badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="abell-menu" role="menu">
          <div className="abell-menu-head">
            <span className="abell-menu-title">{s("alerts.bell")}</span>
            {unread > 0 && (
              <button type="button" className="abell-linkbtn" onClick={() => void markAllRead()}>
                {s("alerts.markAllRead")}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="abell-empty">
              <p className="abell-empty-title">{s("alerts.empty")}</p>
              <p className="abell-empty-hint">{s("alerts.emptyHint")}</p>
            </div>
          ) : (
            <ul className="abell-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`abell-item${n.read_at ? "" : " unread"}`}
                    onClick={() => activate(n)}
                  >
                    <span className="abell-ic" aria-hidden="true">
                      {iconForType(n.type)}
                    </span>
                    <span className="abell-body">
                      <span className="abell-item-title">{n.title}</span>
                      {n.body && <span className="abell-item-text">{n.body}</span>}
                      <span className="abell-time">
                        {relativeTime(n.created_at, timeLabels)}
                      </span>
                    </span>
                    {!n.read_at && <span className="abell-dot" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="abell-menu-foot">
            <Link href={seeAllHref} className="abell-linkbtn" onClick={() => setOpen(false)}>
              {s("alerts.seeAll")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
