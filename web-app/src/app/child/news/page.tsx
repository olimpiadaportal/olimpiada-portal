import { requireChild } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { NewsBrowser } from "@/components/NewsBrowser";

// Student-panel news (R10, F10): the shared list inside the arena shell.
// In-app news is not governed by the news_public flag (public site only).
export default async function ChildNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  await requireChild();
  const t = await getT();
  const sp = await searchParams;

  return (
    <section>
      <p className="arena-eyebrow">{t("nav.news")}</p>
      <h1 style={{ marginBottom: 20 }}>{t("news.latest")}</h1>
      <NewsBrowser basePath="/child/news" sp={sp} />
    </section>
  );
}
