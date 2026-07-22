// Pure reducers behind the optimistic like toggle (likes.ts applies them to the
// React Query caches). Kept dependency-free so the counter arithmetic — the part
// that can silently drift out of sync with the DB — is unit-testable on its own.

/** What both cached news shapes have in common for counting purposes. */
export type LikeCounted = { id: string; like_count: number | null };

/** Add/remove one id, keeping the array identity when nothing changes. */
export function nextLikedIds(
  ids: string[] | undefined,
  newsId: string,
  liked: boolean,
): string[] | undefined {
  const has = ids?.includes(newsId) ?? false;
  if (has === liked) return ids;
  if (liked) return [...(ids ?? []), newsId];
  return (ids ?? []).filter((id) => id !== newsId);
}

/** Patch one article's count inside a cached list (floored at 0, like the DB
 *  trigger; a NULL count counts as 0). */
export function patchListLikeCount<T extends LikeCounted>(
  list: T[] | undefined,
  newsId: string,
  delta: number,
): T[] | undefined {
  if (!list?.some((n) => n.id === newsId)) return list;
  return list.map((n) =>
    n.id === newsId ? { ...n, like_count: Math.max(0, (n.like_count ?? 0) + delta) } : n,
  );
}

/** Same for a single cached article; a different article is left untouched. */
export function patchArticleLikeCount<T extends LikeCounted>(
  article: T | undefined,
  newsId: string,
  delta: number,
): T | undefined {
  if (!article || article.id !== newsId) return article;
  return { ...article, like_count: Math.max(0, (article.like_count ?? 0) + delta) };
}
