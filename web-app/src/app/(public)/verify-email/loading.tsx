// Skeleton for the verify-email notice page (short centered text card).
import {
  Skeleton,
  SkeletonCard,
  SkeletonShell,
  SkeletonText,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell style={{ maxWidth: 440, margin: "8px auto 0" }}>
      <Skeleton w={200} h={26} style={{ marginBottom: 16 }} />
      <SkeletonCard r={16} pad={22}>
        <SkeletonText lines={3} size={13} lastWidth="50%" />
      </SkeletonCard>
    </SkeletonShell>
  );
}
