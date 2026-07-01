import Link from "next/link";
import { getLocale, getT } from "@/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function NewsListPage() {
  const t = await getT();
  const locale = await getLocale();

  let items: { slug: string; title: string; cover: string | null }[] = [];
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    // RLS exposes only published news to the public. The cover image path comes
    // from the linked media_assets row; news-media is a public bucket.
    const { data } = await supabase
      .from("news")
      .select(
        "slug, published_at, cover_media_id, news_translations(locale, title), media_assets:cover_media_id(bucket, path)",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);
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
  }

  return (
    <section className="prose">
      <h1>{t("nav.news")}</h1>
      {items.length === 0 ? (
        <p className="muted">{t("newsp.none")}</p>
      ) : (
        <div>
          {items.map((it) => (
            <div className="news-item" key={it.slug}>
              <Link href={`/news/${it.slug}`}>
                {it.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.cover} alt="" className="news-thumb" />
                )}
                {it.title}
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
