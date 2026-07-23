import { getT } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/flags";
import { redirect } from "next/navigation";
import { getChild } from "@/lib/auth/session";
import { NewsBrowser } from "@/components/NewsBrowser";

// Public news list — a thin wrapper around the shared <NewsBrowser/> (R10):
// the feature gate + public chrome live here; the list itself is shared with
// the parent (/dashboard/news) and student (/child/news) panel routes.
export default async function NewsListPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  // Student sessions read news inside the arena (see [slug] page note).
  if (await getChild()) redirect("/child/news");
  const t = await getT();
  const sp = await searchParams;

  // Feature gate: an administrator can turn the PUBLIC news page off. When off,
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

  return (
    <section className="prose">
      <h1>{t("nav.news")}</h1>
      <NewsBrowser basePath="/news" sp={sp} />
    </section>
  );
}
