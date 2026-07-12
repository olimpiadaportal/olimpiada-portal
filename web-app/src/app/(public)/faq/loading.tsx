// Skeleton for the public FAQ (title + accordion rows).
import { Skeleton, SkeletonShell, skeletonStyles as s } from "@/components/skeletons";
import { FaqSkeleton } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <SkeletonShell className={s.stack} style={{ gap: 22 }}>
      <Skeleton w={220} h={28} />
      <FaqSkeleton rows={8} />
    </SkeletonShell>
  );
}
