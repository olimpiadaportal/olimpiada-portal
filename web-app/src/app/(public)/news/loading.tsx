// Skeleton for the public news list (shared NewsBrowser composition).
import { NewsListSkeleton } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <section className="prose">
      <NewsListSkeleton />
    </section>
  );
}
