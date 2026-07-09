"use client";

// Full notification center page body (parent + child). Lists all loaded
// notifications with a category filter, mark-read-on-click (+ validated deep-link
// navigation), mark-all-read, and per-row delete. Shares the live store with the
// header bell via useNotifications. Copy arrives pre-translated via `strings`.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { NotificationDetailModal } from "@/components/NotificationDetailModal";
import {
  categoryLabelKey,
  iconForType,
  isSafeRelativeUrl,
  relativeTime,
  type NotificationItem,
} from "@/lib/notifications/types";

export function NotificationsPanel({
  me,
  initialItems,
  initialUnread,
  strings,
}: {
  me: string;
  initialItems: NotificationItem[];
  initialUnread: number;
  strings: Record<string, string>;
}) {
  const s = (k: string) => strings[k] ?? k;
  const router = useRouter();
  const { items, unread, markRead, markAllRead, remove } = useNotifications({
    me,
    initialItems,
    initialUnread,
  });
  const [filter, setFilter] = useState<string | null>(null); // null = all
  // The notification whose detail modal is open (no-deeplink items).
  const [detail, setDetail] = useState<NotificationItem | null>(null);

  const timeLabels = {
    now: s("notif.timeNow"),
    min: s("notif.timeMin"),
    hour: s("notif.timeHour"),
    day: s("notif.timeDay"),
  };

  // Category chips derived from what's actually in the inbox (+ "All").
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const n of items) {
      if (n.category && !seen.includes(n.category)) seen.push(n.category);
    }
    return seen;
  }, [items]);

  const catLabel = (cat: string) => {
    const key = categoryLabelKey(cat);
    return key ? s(key) : cat;
  };

  const shown = filter ? items.filter((n) => n.category === filter) : items;

  const activate = (n: NotificationItem) => {
    markRead(n.id);
    if (isSafeRelativeUrl(n.action_url)) router.push(n.action_url);
    else setDetail(n); // no usable deep link → show the detail modal
  };

  return (
    <section className="ntf ntf-page">
      <div className="ntf-page-head">
        <h1 className="ntf-page-title">{s("notif.title")}</h1>
        {unread > 0 && (
          <button type="button" className="ntf-linkbtn" onClick={markAllRead}>
            {s("notif.markAllRead")}
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="ntf-filters" role="tablist" aria-label={s("notif.title")}>
          <button
            type="button"
            className={`ntf-chip${filter === null ? " active" : ""}`}
            aria-pressed={filter === null}
            onClick={() => setFilter(null)}
          >
            {s("notif.filterAll")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`ntf-chip${filter === cat ? " active" : ""}`}
              aria-pressed={filter === cat}
              onClick={() => setFilter(cat)}
            >
              {catLabel(cat)}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="ntf-empty ntf-empty-lg">
          <span className="ntf-empty-ic" aria-hidden="true">
            {"\u{1F514}"}
          </span>
          <p className="ntf-empty-title">{s("notif.empty")}</p>
          <p className="ntf-empty-hint">{s("notif.emptyHint")}</p>
        </div>
      ) : (
        <ul className="ntf-list ntf-list-lg">
          {shown.map((n) => (
            <li key={n.id} className={`ntf-row${n.read_at ? "" : " unread"}`}>
              <button
                type="button"
                className="ntf-item ntf-item-lg"
                onClick={() => activate(n)}
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
              <button
                type="button"
                className="ntf-del"
                aria-label={s("notif.delete")}
                title={s("notif.delete")}
                onClick={() => remove(n.id)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <NotificationDetailModal
        item={detail}
        strings={strings}
        onClose={() => setDetail(null)}
      />
    </section>
  );
}
