// Skeleton for the parent "Olimpiadalar" catalog: page head, child picker
// segment, three-up package-card grid with 16/9 covers (mirrors .poly-page /
// .poly-grid geometry, collapsing 3-2-1 on smaller screens).
import {
  Skeleton,
  SkeletonColumns,
  SkeletonFilters,
  SkeletonHeading,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";
import { SkeletonMediaCard } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <SkeletonShell className={s.stack} style={{ gap: 20 }}>
      {/* .poly-head */}
      <SkeletonHeading titleW={220} titleH={28} sub subW={420} />

      {/* child picker segment */}
      <div className={s.stack} style={{ gap: 8 }}>
        <Skeleton w={130} h={12} />
        <SkeletonFilters chips={2} w={130} h={38} />
      </div>

      {/* .poly-grid: repeat(3, minmax(0,1fr)) gap 18 */}
      <SkeletonColumns cols={3} gap={18}>
        <SkeletonMediaCard chips={2} />
        <SkeletonMediaCard chips={2} />
        <SkeletonMediaCard chips={2} />
      </SkeletonColumns>
    </SkeletonShell>
  );
}
