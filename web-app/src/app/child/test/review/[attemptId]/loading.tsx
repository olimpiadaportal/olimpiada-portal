// Skeleton for the attempt review: heading + score line, state filter chips,
// stacked question cards (prompt + options), bottom action row.
import {
  Skeleton,
  SkeletonButton,
  SkeletonCard,
  SkeletonFilters,
  SkeletonHeading,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonHeading eyebrow titleW={260} titleH={28} sub subW={90} style={{ marginBottom: 22 }} />

      <SkeletonFilters chips={4} w={96} h={32} style={{ marginBottom: 18 }} />

      <div className={s.stack} style={{ gap: 16 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} r={16} pad={24}>
            <div className={s.rowBetween} style={{ marginBottom: 14 }}>
              <Skeleton w={60} h={12} />
              <Skeleton w={84} h={24} r={999} />
            </div>
            <div className={s.stack} style={{ gap: 9, marginBottom: 18 }}>
              <Skeleton w="94%" h={14} />
              <Skeleton w="70%" h={14} />
            </div>
            <div className={s.stack} style={{ gap: 9 }}>
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} w="100%" h={46} r={12} />
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>

      <div className={s.wrapRow} style={{ marginTop: 24, gap: 12 }}>
        <SkeletonButton w={160} h={42} r={12} />
        <SkeletonButton w={130} h={42} r={12} />
      </div>
    </SkeletonShell>
  );
}
