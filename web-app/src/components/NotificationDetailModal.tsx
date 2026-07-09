"use client";

// Detail modal for a notification with no usable deep link (most importantly
// admin announcements, which carry a body but usually no action_url). Renders the
// title, a localized category/type label, an absolute timestamp, the SAFE
// formatted body (minimal-markdown → sanitized HTML), and any human-friendly
// data_json primitives. Built on the shared Modal primitive so it inherits the
// role="dialog", Escape/overlay close, focus handling and body scroll lock.
import { Modal } from "@/components/Modal";
import { renderNotificationMarkdown } from "@/lib/notifications/markdown";
import {
  categoryLabelKey,
  iconForType,
  type NotificationItem,
} from "@/lib/notifications/types";

// Turn a data_json entry into a display pair when the value is a simple scalar.
// Objects/arrays/nulls and overly long values are skipped so we never dump raw
// JSON at the user. Keys are humanized (snake/camel → spaced words).
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function scalarPairs(
  data: Record<string, unknown> | null,
): Array<{ key: string; label: string; value: string }> {
  if (!data || typeof data !== "object") return [];
  const out: Array<{ key: string; label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(data)) {
    if (out.length >= 8) break;
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "object") continue; // never render nested objects/arrays
    let value: string;
    if (typeof raw === "boolean") value = raw ? "✓" : "—";
    else value = String(raw);
    value = value.trim();
    if (!value || value.length > 200) continue;
    // Skip opaque identifiers / raw links — they aren't useful to a reader.
    if (/^(id|.*_id|url|.*_url|action_url|href)$/i.test(key)) continue;
    out.push({ key, label: humanizeKey(key), value });
  }
  return out;
}

export function NotificationDetailModal({
  item,
  strings,
  onClose,
}: {
  item: NotificationItem | null;
  strings: Record<string, string>;
  onClose: () => void;
}) {
  const s = (k: string) => strings[k] ?? k;
  if (!item) return null;

  const catKey = item.category ? categoryLabelKey(item.category) : undefined;
  const typeLabel = catKey ? s(catKey) : s("notif.detailsTitle");
  const when = (() => {
    const d = new Date(item.created_at);
    return Number.isFinite(d.getTime()) ? d.toLocaleString() : "";
  })();
  const pairs = scalarPairs(item.data_json);

  return (
    <Modal
      isOpen={item !== null}
      onClose={onClose}
      title={item.title || s("notif.detailsTitle")}
      closeLabel={s("notif.close")}
    >
      <div className="ntf-detail">
        <div className="ntf-detail-meta">
          <span className="ntf-detail-type">
            <span aria-hidden="true">{iconForType(item.type)}</span>
            {typeLabel}
          </span>
          {when && <span className="ntf-detail-time">{when}</span>}
        </div>

        {item.body ? (
          <div
            className="ntf-detail-body"
            dangerouslySetInnerHTML={renderNotificationMarkdown(item.body)}
          />
        ) : (
          <p className="ntf-detail-nolink">{s("notif.noLink")}</p>
        )}

        {pairs.length > 0 && (
          <dl className="ntf-detail-data">
            <dt className="ntf-detail-data-head">{s("notif.detailsData")}</dt>
            {pairs.map((p) => (
              <div key={p.key} className="ntf-detail-data-row">
                <dt className="ntf-detail-data-key">{p.label}</dt>
                <dd className="ntf-detail-data-val">{p.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Modal>
  );
}
