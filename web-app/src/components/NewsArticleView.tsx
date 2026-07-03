import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getLocale, getT } from "@/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { NewsLikeButton } from "@/components/NewsLikeButton";
import { ViewBeacon } from "@/components/ViewBeacon";

// Shared news article view (R10, F10): serves the public /news/[slug] page AND
// the in-panel routes (/dashboard/news/[slug], /child/news/[slug]) — `basePath`
// keeps the back link + revalidation surface inside the reader's panel. Views
// register once per browser session via <ViewBeacon/>; likes for signed-in
// profiles via the shared like button.
function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export async function NewsArticleView({
  slug,
  basePath,
}: {
  slug: string;
  basePath: string;
}) {
  const t = await getT();
  const locale = await getLocale();

  if (!isSupabaseConfigured) notFound();

  const supabase = await createClient();
  const { data: n } = await supabase
    .from("news")
    .select(
      "id, slug, status, published_at, view_count, like_count, cover_media_id, news_translations(locale, title, body), media_assets:cover_media_id(bucket, path)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!n) notFound();

  // Views (Round 7): registered client-side once per browser session — never
  // by the render (revalidations must not count as views).
  const newsId = (n as any).id as string | undefined;
  const views =
    typeof (n as any).view_count === "number" ? (n as any).view_count : 0;
  const likes =
    typeof (n as any).like_count === "number" ? (n as any).like_count : 0;

  // Likes: signed-in profiles (parent OR child) get the toggle button; anonymous
  // visitors just see the counter. RLS lets us read only OUR OWN like row.
  let likedByMe = false;
  let signedIn = false;
  if (newsId) {
    const { data: profileId } = await supabase.rpc("current_profile_id");
    if (profileId) {
      signedIn = true;
      const { data: myLike } = await supabase
        .from("news_likes")
        .select("news_id")
        .eq("news_id", newsId)
        .eq("profile_id", profileId)
        .maybeSingle();
      likedByMe = Boolean(myLike);
    }
  }

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

  const publishedAt = formatDate((n as any).published_at ?? null, locale);
  // Split the body into paragraphs on blank lines; keep single newlines intact
  // within a paragraph. Good typography comes from .news-detail-body.
  const paragraphs = (tr?.body ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <article className="prose">
      {newsId && <ViewBeacon newsId={newsId} slug={slug} />}
      <Link href={basePath} className="muted">
        {t("newsp.back")}
      </Link>

      <div className="news-detail">
        <h1>{tr?.title ?? (n as any).slug}</h1>

        <div className="news-detail-meta">
          {publishedAt && (
            <span>
              {t("news.published")} {publishedAt}
            </span>
          )}
          <span className="views-chip">
            {views} {t("news.views")}
          </span>
          {signedIn && newsId ? (
            <NewsLikeButton
              newsId={newsId}
              slug={slug}
              liked={likedByMe}
              count={likes}
              labels={{
                like: t("news.like"),
                liked: t("news.liked"),
                likes: t("news.likes"),
              }}
            />
          ) : (
            <span className="views-chip">
              ♥ {likes} {t("news.likes")}
            </span>
          )}
        </div>

        {cover && (
          <div className="news-detail-media">
            <Image
              src={cover}
              alt=""
              width={1200}
              height={675}
              sizes="(max-width: 800px) 100vw, 760px"
              priority
            />
          </div>
        )}

        <div className="news-detail-body">
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p key={i} style={{ whiteSpace: "pre-wrap" }}>
                {p}
              </p>
            ))
          ) : (
            <p style={{ whiteSpace: "pre-wrap" }}>{tr?.body ?? ""}</p>
          )}
        </div>
      </div>
    </article>
  );
}
