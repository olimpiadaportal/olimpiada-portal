"use client";

import { transitionNews, deleteNews } from "@/lib/admin/news";

export function NewsLifecycle({
  id,
  status,
  dict,
}: {
  id: string;
  status: string;
  dict: Record<string, string>;
}) {
  const tt = (k: string) => dict[k] ?? k;

  const Action = ({ action, label }: { action: string; label: string }) => (
    <form action={transitionNews} style={{ display: "inline" }}>
      <input type="hidden" name="__id" value={id} />
      <input type="hidden" name="__action" value={action} />
      <button className="btn-ghost" type="submit">
        {label}
      </button>
    </form>
  );

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {/* Three-state model: in_review → publish/reject; published → reject/to_review;
          rejected → publish/to_review. */}
      {(status === "in_review" || status === "rejected") && (
        <Action action="publish" label={tt("news.act.publish")} />
      )}
      {(status === "in_review" || status === "published") && (
        <Action action="reject" label={tt("news.act.reject")} />
      )}
      {(status === "published" || status === "rejected") && (
        <Action action="to_review" label={tt("news.act.to_review")} />
      )}
      <form
        action={deleteNews}
        onSubmit={(e) => {
          if (!confirm(tt("news.act.confirmDelete"))) e.preventDefault();
        }}
        style={{ display: "inline" }}
      >
        <input type="hidden" name="__id" value={id} />
        <button className="link-danger" type="submit">
          {tt("news.act.delete")}
        </button>
      </form>
    </div>
  );
}
