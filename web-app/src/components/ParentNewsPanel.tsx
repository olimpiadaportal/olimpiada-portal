// Parent dashboard news panel (Phase E2, server component). Mirrors the public
// /news query (published rows + cover via media_assets → getPublicUrl), limited
// to the latest 3, and renders E1's .news-panel / .news-mini items linking to
// /news/[slug] plus a "View all" link. Fetch failures degrade gracefully to the
// empty state so the dashboard never crashes. Uses E1's contract classes/keys
// verbatim. Copy is passed in from the page (already localized).
import Link from "next/link";
import Image from "next/image";
import { getLocale } from "@/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function ParentNewsPanel({
  dict,
}: {
  dict: Record<string, string>;
}) {
  const t = (k: string) => dict[k] ?? k;
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
      // Degrade gracefully: an empty list renders the news.none state below.
      items = [];
    }
  }

  return (
    <section className="news-panel" aria-label={t("news.latest")}>
      <div className="news-panel-head">
        <h2>{t("news.latest")}</h2>
        <Link className="btn-ghost" href="/news">
          {t("news.viewAll")}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="news-empty muted">{t("news.none")}</p>
      ) : (
        <div>
          {items.map((it) => (
            <Link className="news-mini" href={`/news/${it.slug}`} key={it.slug}>
              {it.cover ? (
                <Image
                  src={it.cover}
                  alt=""
                  width={52}
                  height={52}
                  sizes="52px"
                  loading="lazy"
                  className="news-mini-thumb"
                />
              ) : (
                <span className="news-mini-thumb" aria-hidden="true" />
              )}
              <span className="news-mini-title">{it.title}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
