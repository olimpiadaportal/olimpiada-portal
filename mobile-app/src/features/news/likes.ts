// Own-like state + the optimistic like toggle shared by the news list and the
// article view. Likes are a direct RLS write with the user's own JWT (the table
// grants insert/delete to `authenticated`, scoped to the caller's profile), so
// there is no BFF hop; public.news.like_count stays trigger-maintained.
//
// The counter only ever moves inside the returned press handler — never during
// a render or a refetch. That is the same discipline the web view beacon
// enforces, and it is what keeps a like from inflating anything by re-render.
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { fetchMyNewsLikes, setNewsLike, type NewsListItem } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { useAuthStore } from "@/features/auth/authStore";
import {
  nextLikedIds,
  patchArticleLikeCount,
  patchListLikeCount,
  type LikeCounted,
} from "./likeCache";

const LIKES_STALE_MS = 5 * 60_000;

/** The two caches carrying a like count. They share no prefix, so both the
 *  optimistic patch and the settle-invalidate have to address each of them. */
const NEWS_LIST_KEY = ["news"] as const;
const NEWS_ARTICLE_KEY = ["news-article"] as const;

/** Per-profile so a second account on the same device can never inherit it
 *  (sign-out clears the whole cache anyway — this is belt and braces). */
export const newsLikesKey = (profileId: string) => ["news-likes", profileId] as const;

/** Stable empty set: a fresh one per render would re-render every card. */
const NO_LIKES: ReadonlySet<string> = new Set<string>();

/** One write per article at a time: a rapid double-tap would otherwise race two
 *  opposing writes and leave the optimistic count off by one. */
const inFlight = new Set<string>();

/**
 * The ids this viewer has liked. Signed-out viewers get an empty set WITHOUT a
 * request: anon holds no grant on news_likes, so an ungated query would answer
 * 42501 and flip the public news screens into their error state.
 */
export function useMyNewsLikes(): ReadonlySet<string> {
  const profileId = useAuthStore((s) => s.profileId);
  const signedIn = useAuthStore((s) => s.status === "signedIn");

  const q = useQuery({
    queryKey: newsLikesKey(profileId ?? "anon"),
    queryFn: fetchMyNewsLikes,
    enabled: isSupabaseConfigured && signedIn && !!profileId,
    staleTime: LIKES_STALE_MS,
    select: (ids: string[]) => new Set(ids) as ReadonlySet<string>,
  });

  return q.data ?? NO_LIKES;
}

/** True when the viewer is allowed to like at all (web: the button only renders
 *  for a signed-in profile; everyone else sees a plain counter). */
export function useCanLikeNews(): boolean {
  return useAuthStore((s) => s.status === "signedIn" && !!s.profileId);
}

/**
 * `toggle(newsId, liked)` where `liked` is the DESIRED next state. The three
 * caches flip before the write leaves the device (web useOptimistic parity) and
 * are restored verbatim if it fails — silent, exactly like the web action.
 */
export function useToggleNewsLike() {
  const profileId = useAuthStore((s) => s.profileId);
  const qc = useQueryClient();

  return async (newsId: string, liked: boolean): Promise<void> => {
    if (!profileId || inFlight.has(newsId)) return;
    inFlight.add(newsId);

    const likesKey = newsLikesKey(profileId);
    const delta = liked ? 1 : -1;

    // Snapshot only the caches that actually hold data — patching a pending
    // query is a no-op in React Query, so restoring one would be wrong.
    const prevLikes = qc.getQueryData<string[]>(likesKey);
    const prevLists = qc
      .getQueriesData<NewsListItem[]>({ queryKey: NEWS_LIST_KEY })
      .filter(([, data]) => data !== undefined);
    const prevArticles = qc
      .getQueriesData<LikeCounted>({ queryKey: NEWS_ARTICLE_KEY })
      .filter(([, data]) => data !== undefined);

    qc.setQueryData<string[]>(likesKey, (ids) => nextLikedIds(ids, newsId, liked));
    // The prefix form covers every cached locale, so switching language after a
    // like never shows a stale count.
    qc.setQueriesData<NewsListItem[]>({ queryKey: NEWS_LIST_KEY }, (list) =>
      patchListLikeCount(list, newsId, delta),
    );
    qc.setQueriesData<LikeCounted>({ queryKey: NEWS_ARTICLE_KEY }, (article) =>
      patchArticleLikeCount(article, newsId, delta),
    );

    let ok = false;
    try {
      ok = await setNewsLike(newsId, profileId, liked);
    } catch {
      ok = false; // the network layer threw — as unlanded as a rejected write
    } finally {
      inFlight.delete(newsId);
    }

    if (ok) {
      // Mark the trigger-maintained truth stale without spending a round-trip
      // per tap; the next mount or pull-to-refresh reconciles it.
      void qc.invalidateQueries({ queryKey: NEWS_LIST_KEY, refetchType: "none" });
      void qc.invalidateQueries({ queryKey: NEWS_ARTICLE_KEY, refetchType: "none" });
      void qc.invalidateQueries({ queryKey: likesKey, refetchType: "none" });
      return;
    }

    // The like never landed (offline, revoked session) — put the counters back
    // where they were rather than lying about the server state. Silent, exactly
    // like the web action, which swallows its errors too.
    if (prevLikes === undefined) qc.removeQueries({ queryKey: likesKey, exact: true });
    else qc.setQueryData(likesKey, prevLikes);
    restoreAll(qc, prevLists);
    restoreAll(qc, prevArticles);
  };
}

function restoreAll<T>(qc: QueryClient, entries: [QueryKey, T | undefined][]) {
  for (const [key, data] of entries) qc.setQueryData(key, data);
}
