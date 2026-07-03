import { requireChild } from "@/lib/auth/session";
import { NewsArticleView } from "@/components/NewsArticleView";

// Student-panel news article (R10, F10) — stays inside the arena shell.
export default async function ChildNewsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireChild();
  const { slug } = await params;
  return <NewsArticleView slug={slug} basePath="/child/news" />;
}
