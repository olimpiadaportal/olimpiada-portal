// Skeleton for the in-app About page (same .about2-* geometry as the public one).
import { SkeletonShell, skeletonStyles as s } from "@/components/skeletons";
import { AboutSkeleton } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <SkeletonShell className={s.stack} style={{ gap: 48 }}>
      <AboutSkeleton />
    </SkeletonShell>
  );
}
