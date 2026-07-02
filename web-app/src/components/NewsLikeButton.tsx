"use client";

// Heart-toggle for a news article (signed-in profiles only; the server action
// and RLS enforce that). Optimistic flip via useOptimistic so the tap feels
// instant; the revalidated server count settles the truth.
import { useOptimistic, useTransition } from "react";
import { toggleNewsLike } from "@/lib/newsActions";

export function NewsLikeButton({
  newsId,
  slug,
  liked,
  count,
  labels,
}: {
  newsId: string;
  slug: string;
  liked: boolean;
  count: number;
  labels: { like: string; liked: string; likes: string };
}) {
  const [state, setOptimistic] = useOptimistic({ liked, count });
  const [, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      setOptimistic({
        liked: !state.liked,
        count: state.count + (state.liked ? -1 : 1),
      });
      await toggleNewsLike(formData);
    });
  }

  return (
    <form action={onSubmit} className="like-form">
      <input type="hidden" name="news_id" value={newsId} />
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        className={state.liked ? "like-btn liked" : "like-btn"}
        aria-pressed={state.liked}
        title={state.liked ? labels.liked : labels.like}
      >
        <span aria-hidden="true">{state.liked ? "♥" : "♡"}</span>
        <span>
          {state.count} {labels.likes}
        </span>
      </button>
    </form>
  );
}
