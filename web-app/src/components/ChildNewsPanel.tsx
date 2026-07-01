import Link from "next/link";
import { getLocale, getT } from "@/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Arena-styled "latest news" panel for the child dashboard. Reuses the public
// /news query pattern (RLS exposes only published news) and degrades gracefully:
// any fetch failure simply renders the news.none empty state — it never throws,
// so the dashboard always renders. Uses E1's contract classes (.news-panel,
// .news-panel-head, .news-mini, .news-mini-thumb, .news-mini-title, .news-empty)
// and keys (news.latest / news.viewAll / news.none).
export async function ChildNewsPanel() {
  const t = await getT();
  const locale = await getLocale();

  let items: { slug: string; title: string; cover: string | null }[] = [];
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("news")
        .select(
          "slug, published_at, cover_media_id, news_translations(locale, title), media_assets:cover_media_id(bucket, path)",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(3);
      items = ((data ?? []) as any[]).map((n) => {
        const trs = n.news_translations ?? [];
        const tr =
          trs.find((x: any) => x.locale === locale) ??
          trs.find((x: any) => x.locale === "az");
        let cover: string | null = null;
        const m = n.media_assets;
        if (m?.bucket && m?.path) {
          cover = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
        }
        return { slug: n.slug, title: tr?.title ?? n.slug, cover };
      });
    } catch {
      // Degrade gracefully — render the empty state, never crash the dashboard.
      items = [];
    }
  }

  return (
    <div className="news-panel">
      <div className="news-panel-head">
        <h3 className="arena-section-h" style={{ margin: 0 }}>
          {t("news.latest")}
        </h3>
        <Link className="arena-btn-ghost arena-btn-sm" href="/news">
          {t("news.viewAll")}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="news-empty arena-muted" style={{ margin: 0 }}>
          {t("news.none")}
        </p>
      ) : (
        items.map((it) => (
          <Link className="news-mini" href={`/news/${it.slug}`} key={it.slug}>
            {it.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.cover} alt="" className="news-mini-thumb" />
            ) : (
              <span className="news-mini-thumb" aria-hidden />
            )}
            <span className="news-mini-title">{it.title}</span>
          </Link>
        ))
      )}
    </div>
  );
}
