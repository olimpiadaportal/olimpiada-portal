// Skeleton for the per-child olympiad purchase page (560px column: title,
// child name, package card grid, back link).
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonButton,
  SkeletonCard,
  SkeletonPill,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell style={{ maxWidth: 560 }}>
      <div className={s.stack} style={{ gap: 10, marginBottom: 18 }}>
        <Skeleton w={260} h={26} />
        <Skeleton w={120} h={13} />
      </div>

      <SkeletonAutoGrid min={200} gap={14}>
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} r={10} pad="16px 18px">
            <div className={s.stack} style={{ gap: 10 }}>
              <Skeleton w="85%" h={15} />
              <Skeleton w={80} h={12} />
              <SkeletonPill w={90} h={26} />
            </div>
          </SkeletonCard>
        ))}
      </SkeletonAutoGrid>

      <SkeletonButton w={140} h={36} style={{ marginTop: 16 }} />
    </SkeletonShell>
  );
}
