import { requireParent } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { NewsBrowser } from "@/components/NewsBrowser";

// Parent-panel news (R10, F10): the same shared list as /news, kept INSIDE the
// parent shell (nav + drawer + footer). In-app news is not governed by the
// news_public flag (that flag controls the PUBLIC site section only).
export default async function ParentNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  await requireParent();
  const t = await getT();
  const sp = await searchParams;

  return (
    <section className="prose">
      <h1>{t("nav.news")}</h1>
      <NewsBrowser basePath="/dashboard/news" sp={sp} />
    </section>
  );
}
