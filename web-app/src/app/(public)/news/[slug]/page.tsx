import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getT } from "@/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getT();
  const locale = await getLocale();
  if (!isSupabaseConfigured) notFound();

  const supabase = await createClient();
  const { data: n } = await supabase
    .from("news")
    .select(
      "slug, status, published_at, cover_media_id, news_translations(locale, title, body), media_assets:cover_media_id(bucket, path)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!n) notFound();

  // news-media is a public bucket; resolve the cover path to a public URL.
  let cover: string | null = null;
  const m = (n as any).media_assets;
  if (m?.bucket && m?.path) {
    cover = supabase.storage.from(m.bucket).getPublicUrl(m.path).data.publicUrl;
  }

  const trs = ((n as any).news_translations ?? []) as {
    locale: string;
    title: string;
    body: string;
  }[];
  const tr =
    trs.find((x) => x.locale === locale) ??
    trs.find((x) => x.locale === "az") ??
    trs[0];

  return (
    <article className="prose">
      <Link href="/news" className="muted">
        {t("newsp.back")}
      </Link>
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="news-cover" />
      )}
      <h1>{tr?.title ?? (n as any).slug}</h1>
      <div style={{ whiteSpace: "pre-wrap" }}>{tr?.body ?? ""}</div>
    </article>
  );
}
