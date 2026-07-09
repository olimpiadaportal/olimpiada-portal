"use client";

// Header notification bell (parent shell + child arena). Shows an unread badge
// and a dropdown of the latest notifications; each row marks itself read on click
// and follows its (validated same-origin) deep link. A live insert flashes a
// transient toast. All copy arrives pre-translated via `strings` so this
// component never imports the i18n catalog. Themed through the `.ntf` token
// contract (works in parent light/dark and the arena + palettes).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { NotificationDetailModal } from "@/components/NotificationDetailModal";
import {
  iconForType,
  isSafeRelativeUrl,
  relativeTime,
  type NotificationItem,
} from "@/lib/notifications/types";

export function NotificationBell({
  me,
  initialItems,
  initialUnread,
  seeAllHref,
  strings,
}: {
  me: string;
  initialItems: NotificationItem[];
  initialUnread: number;
  seeAllHref: string;
  strings: Record<string, string>;
}) {
  const s = (k: string) => strings[k] ?? k;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The notification whose detail modal is open (no-deeplink items).
  const [detail, setDetail] = useState<NotificationItem | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { items, unread, toast, markRead, markAllRead, dismissToast } =
    useNotifications({ me, initialItems, initialUnread });

  const timeLabels = {
    now: s("notif.timeNow"),
    min: s("notif.timeMin"),
    hour: s("notif.timeHour"),
    day: s("notif.timeDay"),
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

  const activate = (n: NotificationItem, closeAfter: boolean) => {
    markRead(n.id);
    if (closeAfter) setOpen(false);
    if (isSafeRelativeUrl(n.action_url)) router.push(n.action_url);
    else setDetail(n); // no usable deep link → show the detail modal (never a dead click)
  };

  const badge = unread > 99 ? "99+" : String(unread);
  const latest = items.slice(0, 8);

  return (
    <div className="ntf" ref={wrapRef}>
      <button
        type="button"
        className="ntf-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={s("notif.bell")}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
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
          <span className="ntf-badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="ntf-menu" role="menu">
          <div className="ntf-menu-head">
            <span className="ntf-menu-title">{s("notif.bell")}</span>
            {unread > 0 && (
              <button type="button" className="ntf-linkbtn" onClick={markAllRead}>
                {s("notif.markAllRead")}
              </button>
            )}
          </div>

          {latest.length === 0 ? (
            <div className="ntf-empty">
              <p className="ntf-empty-title">{s("notif.empty")}</p>
              <p className="ntf-empty-hint">{s("notif.emptyHint")}</p>
            </div>
          ) : (
            <ul className="ntf-list">
              {latest.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`ntf-item${n.read_at ? "" : " unread"}`}
                    onClick={() => activate(n, true)}
                  >
                    <span className="ntf-ic" aria-hidden="true">
                      {iconForType(n.type)}
                    </span>
                    <span className="ntf-body">
                      <span className="ntf-item-title">{n.title}</span>
                      {n.body && <span className="ntf-item-text">{n.body}</span>}
                      <span className="ntf-time">
                        {relativeTime(n.created_at, timeLabels)}
                      </span>
                    </span>
                    {!n.read_at && <span className="ntf-dot" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="ntf-menu-foot">
            <Link href={seeAllHref} className="ntf-linkbtn" onClick={() => setOpen(false)}>
              {s("notif.seeAll")}
            </Link>
          </div>
        </div>
      )}

      {toast && (
        <div className="ntf-toast" role="status" aria-live="polite">
          <span className="ntf-ic" aria-hidden="true">
            {iconForType(toast.type)}
          </span>
          <button
            type="button"
            className="ntf-toast-body"
            onClick={() => {
              const n = toast;
              dismissToast();
              activate(n, false);
            }}
          >
            <span className="ntf-toast-label">{s("notif.newLabel")}</span>
            <span className="ntf-item-title">{toast.title}</span>
            {toast.body && <span className="ntf-item-text">{toast.body}</span>}
          </button>
          <button
            type="button"
            className="ntf-toast-x"
            aria-label={s("notif.dismiss")}
            onClick={dismissToast}
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <NotificationDetailModal
        item={detail}
        strings={strings}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
