// Skeleton for the in-app FAQ (mirrors .help-page column + accordion rows).
import { Skeleton, SkeletonShell } from "@/components/skeletons";
import { FaqSkeleton } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <SkeletonShell className="prose help-page">
      <Skeleton w={220} h={26} />
      <FaqSkeleton rows={8} />
    </SkeletonShell>
  );
}
