import Link from "next/link";
import Image from "next/image";
import { getLocale, getT } from "@/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { isFeatureEnabled } from "@/lib/flags";

const PAGE_SIZE = 6;

type Sort = "latest" | "oldest" | "mostViewed" | "mostLiked";

function parseSort(v: string | undefined): Sort {
  return v === "oldest" || v === "mostViewed" || v === "mostLiked" ? v : "latest";
}

// Derive a short plain-text snippet from an article body: collapse whitespace and
// truncate on a word boundary so the card excerpt stays clean.
function excerptFrom(body: string | null | undefined, max = 140): string {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export default async function NewsListPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const t = await getT();
  const locale = await getLocale();
  const sp = await searchParams;

  // Feature gate: an administrator can turn the public news page off. When off,
  // render a calm "unavailable" state instead of the list (never throw).
  const newsEnabled = await isFeatureEnabled("news_public");
  if (!newsEnabled) {
    return (
      <section className="prose">
        <h1>{t("nav.news")}</h1>
        <p className="muted">{t("news.unavailable")}</p>
      </section>
    );
  }

  // Sort + pagination are driven entirely by URL search params (server-rendered).
  const sort = parseSort(sp.sort);
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  let items: {
    slug: string;
    title: string;
    excerpt: string;
    cover: string | null;
    views: number;
    likes: number;
    publishedAt: string | null;
  }[] = [];
  let total = 0;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // RLS exposes only published news to the public. The cover image path comes
    // from the linked media_assets row; news-media is a public bucket.
    let query = supabase
      .from("news")
      .select(
        "slug, published_at, view_count, like_count, cover_media_id, news_translations(locale, title, body), media_assets:cover_media_id(bucket, path)",
        { count: "exact" },
      )
      .eq("status", "published");

    if (sort === "oldest") {
      query = query.order("published_at", { ascending: true });
    } else if (sort === "mostViewed") {
      query = query.order("view_count", { ascending: false });
    } else if (sort === "mostLiked") {
      query = query.order("like_count", { ascending: false });
    } else {
      query = query.order("published_at", { ascending: false });
    }

    const { data, count } = await query.range(from, to);
    total = count ?? 0;
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
      return {
        slug: n.slug,
        title: tr?.title ?? n.slug,
        excerpt: excerptFrom(tr?.body),
        cover,
        views: typeof n.view_count === "number" ? n.view_count : 0,
        likes: typeof n.like_count === "number" ? n.like_count : 0,
        publishedAt: n.published_at ?? null,
      };
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const sortHref = (s: Sort) => `/news?sort=${s}`;
  const pageHref = (p: number) => `/news?sort=${sort}&page=${p}`;

  const SORTS: { key: Sort; label: string }[] = [
    { key: "latest", label: t("news.sort.latest") },
    { key: "oldest", label: t("news.sort.oldest") },
    { key: "mostViewed", label: t("news.sort.mostViewed") },
    { key: "mostLiked", label: t("news.sort.mostLiked") },
  ];

  return (
    <section className="prose">
      <h1>{t("nav.news")}</h1>

      <div className="news-toolbar">
        <div className="news-sort">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={sortHref(s.key)}
              className={
                sort === s.key ? "news-sort-btn active" : "news-sort-btn"
              }
              aria-current={sort === s.key ? "true" : undefined}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="muted">{page > 1 ? t("news.empty2") : t("newsp.none")}</p>
      ) : (
        <div className="news-grid">
          {items.map((it, i) => (
            <Link className="news-card" href={`/news/${it.slug}`} key={it.slug}>
              <div className={it.cover ? "news-card-media" : "news-card-media empty"}>
                {it.cover && (
                  <Image
                    src={it.cover}
                    alt=""
                    width={640}
                    height={360}
                    sizes="(max-width: 640px) 100vw, 400px"
                    priority={i === 0}
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                )}
              </div>
              <div className="news-card-body">
                <h2 className="news-card-title">{it.title}</h2>
                {it.excerpt && <p className="news-card-excerpt">{it.excerpt}</p>}
                <div className="news-card-meta">
                  <span>{formatDate(it.publishedAt, locale)}</span>
                  <span className="views-chip">
                    {it.views} {t("news.views")}
                  </span>
                  <span className="views-chip">
                    ♥ {it.likes}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="news-pager">
          {hasPrev ? (
            <Link className="news-page-btn" href={pageHref(page - 1)}>
              {t("news.page.prev")}
            </Link>
          ) : (
            <span className="news-page-btn disabled" aria-disabled="true">
              {t("news.page.prev")}
            </span>
          )}
          <span className="news-page-indicator">
            {t("news.page.indicator")
              .replace("{current}", String(page))
              .replace("{total}", String(totalPages))}
          </span>
          {hasNext ? (
            <Link className="news-page-btn" href={pageHref(page + 1)}>
              {t("news.page.next")}
            </Link>
          ) : (
            <span className="news-page-btn disabled" aria-disabled="true">
              {t("news.page.next")}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
