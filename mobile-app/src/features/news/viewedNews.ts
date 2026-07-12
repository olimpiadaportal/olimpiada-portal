// Session view watermark (web sessionStorage-beacon parity): bump_news_view
// fires at most once per article per app session, never on re-renders.
const viewed = new Set<string>();

/** Returns true exactly once per app session for a given news id. */
export function markViewedOnce(newsId: string): boolean {
  if (viewed.has(newsId)) return false;
  viewed.add(newsId);
  return true;
}
