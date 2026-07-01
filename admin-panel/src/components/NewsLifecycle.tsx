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
      {(status === "draft" || status === "archived") && (
        <Action action="publish" label={tt("news.act.publish")} />
      )}
      {status === "published" && (
        <Action action="unpublish" label={tt("news.act.unpublish")} />
      )}
      {(status === "draft" || status === "published") && (
        <Action action="archive" label={tt("news.act.archive")} />
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
