// Skeleton for the in-panel news list (shared NewsBrowser composition).
import { NewsListSkeleton } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <section className="prose">
      <NewsListSkeleton />
    </section>
  );
}
