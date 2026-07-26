// Skeleton for /olympiad-packages/<code>: back link + cover banner + the
// labelled detail rows (mirrors .polydet geometry).
import {
  Skeleton,
  SkeletonBanner,
  SkeletonCard,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell className={s.stack} style={{ gap: 14 }}>
      <Skeleton w={140} h={14} />
      <SkeletonBanner h={220} r={20} />
      <SkeletonCard r={20} pad="18px 20px 22px">
        <div className={s.stack} style={{ gap: 12 }}>
          <Skeleton w="45%" h={14} style={{ maxWidth: 260 }} />
          <Skeleton w="75%" h={26} style={{ maxWidth: 460 }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} w="100%" h={16} />
          ))}
          <Skeleton w="90%" h={12} />
          <Skeleton w="60%" h={12} />
        </div>
      </SkeletonCard>
    </SkeletonShell>
  );
}
