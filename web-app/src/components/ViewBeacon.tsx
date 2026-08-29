"use client";

// Registers a news view ONCE per browser session per article (Round 7).
// Runs after mount so server re-renders (revalidatePath from a like click,
// router refreshes, …) never bump the counter — only a real visit does.
import { useEffect } from "react";
import { registerNewsView } from "@/lib/newsActions";

// Fallback watermark for browsers where sessionStorage is unavailable (private
// mode, "block site data"). Module-scoped, so it survives client-side
// navigation within one page session and resets on a full reload — the same
// shape the mobile app uses (mobile-app/src/features/news/viewedNews.ts).
const viewedThisPageSession = new Set<string>();

/**
 * Should this mount register a view? At most once per article per page session.
 *
 * The storage failure used to `return` — i.e. it treated "no storage" as
 * "already viewed" and dropped the view, while the like button on the very same
 * page kept working. That was the one way the WEB could end up with an article
 * showing more likes than views. The database enforces the invariant now
 * (migration 157), but a real visit that is never counted is still a wrong
 * number, so a blocked-storage reader falls back to the in-memory watermark
 * instead of being skipped.
 *
 * Exported for the unit test: the web suite runs in a node environment with no
 * DOM, so this is the only way to exercise the decision directly.
 */
export function shouldCountView(
  key: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  seen: Set<string>,
): boolean {
  try {
    if (!storage) throw new Error("no storage");
    if (storage.getItem(key)) return false;
    storage.setItem(key, "1");
  } catch {
    // Still at-most-once: React 18 double-invokes effects in dev, and a
    // client-side return to the article re-mounts this component.
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function ViewBeacon({ newsId, slug }: { newsId: string; slug: string }) {
  useEffect(() => {
    // Touching sessionStorage can itself throw where site data is blocked, so
    // even the lookup is guarded.
    let storage: Pick<Storage, "getItem" | "setItem"> | null = null;
    try {
      storage = sessionStorage;
    } catch {
      storage = null;
    }
    if (!shouldCountView(`olympiq-viewed:${slug}`, storage, viewedThisPageSession)) return;
    void registerNewsView(newsId);
  }, [newsId, slug]);

  return null;
}
