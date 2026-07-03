import Link from "next/link";
import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { NewsArticleView } from "@/components/NewsArticleView";

// Public news article — thin wrapper around the shared <NewsArticleView/>
// (R10); the news_public feature gate applies to the PUBLIC surface only.
export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getT();

  const newsEnabled = await isFeatureEnabled("news_public");
  if (!newsEnabled) {
    return (
      <section className="prose">
        <Link href="/news" className="muted">
          {t("newsp.back")}
        </Link>
        <p className="muted">{t("news.unavailable")}</p>
      </section>
    );
  }

  return <NewsArticleView slug={slug} basePath="/news" />;
}
