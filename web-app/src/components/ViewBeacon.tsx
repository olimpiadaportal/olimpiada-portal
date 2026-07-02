"use client";

// Registers a news view ONCE per browser session per article (Round 7).
// Runs after mount so server re-renders (revalidatePath from a like click,
// router refreshes, …) never bump the counter — only a real visit does.
// sessionStorage may be unavailable (privacy modes); failures are silent and
// simply skip counting.
import { useEffect } from "react";
import { registerNewsView } from "@/lib/newsActions";

export function ViewBeacon({ newsId, slug }: { newsId: string; slug: string }) {
  useEffect(() => {
    try {
      const key = `olimpiq-viewed:${slug}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return; // no storage → don't risk double counting
    }
    void registerNewsView(newsId);
  }, [newsId, slug]);

  return null;
}
