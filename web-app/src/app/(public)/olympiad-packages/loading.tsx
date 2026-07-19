// Skeleton for the /olympiad-packages page: small hero + a card grid
// (mirrors .poly-grid geometry used by PublicOlympiadPackages).
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonCard,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell className={s.stack} style={{ gap: 8 }}>
      <Skeleton w="50%" h={30} style={{ maxWidth: 420 }} />
      <Skeleton w="70%" h={14} style={{ maxWidth: 520, marginBottom: 20 }} />
      <SkeletonAutoGrid min={220} gap={18}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} r={16} pad="18px 20px">
            <div className={s.stack} style={{ gap: 10 }}>
              <Skeleton w="40%" h={12} />
              <Skeleton w="80%" h={18} />
              <Skeleton w="95%" h={12} />
              <Skeleton w="60%" h={12} />
            </div>
          </SkeletonCard>
        ))}
      </SkeletonAutoGrid>
    </SkeletonShell>
  );
}
