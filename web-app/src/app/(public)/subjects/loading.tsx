// Skeleton for the subjects overview (title, lead, four subject cards).
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonCard,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell className={s.stack} style={{ gap: 14 }}>
      <Skeleton w={220} h={28} />
      <Skeleton w="60%" h={14} style={{ maxWidth: 460 }} />
      <SkeletonAutoGrid min={200} gap={14} style={{ marginTop: 8 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} r={10} pad="16px 18px">
            <Skeleton w="55%" h={15} />
          </SkeletonCard>
        ))}
      </SkeletonAutoGrid>
      <Skeleton w="45%" h={12} style={{ marginTop: 8 }} />
    </SkeletonShell>
  );
}
