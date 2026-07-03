import { requireParent } from "@/lib/auth/session";
import { NewsArticleView } from "@/components/NewsArticleView";

// Parent-panel news article (R10, F10) — stays inside the parent shell.
export default async function ParentNewsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireParent();
  const { slug } = await params;
  return <NewsArticleView slug={slug} basePath="/dashboard/news" />;
}
