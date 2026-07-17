// Skeleton for the About page (shared .about2-* geometry lives in AboutSkeleton).
import { SkeletonShell, skeletonStyles as s } from "@/components/skeletons";
import { AboutSkeleton } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <SkeletonShell className={s.stack} style={{ gap: 48 }}>
      <AboutSkeleton />
    </SkeletonShell>
  );
}
