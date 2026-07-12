// Skeleton for the parent home: info carousel, "My children" head + card grid,
// latest-news block. Reuses the page's real layout classes (.parent-home,
// .home-block, .children-head, .children-grid) so widths/gaps/breakpoints are
// identical to the loaded page (no layout shift).
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonBanner,
  SkeletonButton,
  SkeletonCard,
  SkeletonPill,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";
import { SkeletonMediaCard } from "@/components/skeletons/pages";

function ChildCardSkeleton() {
  return (
    <SkeletonCard r={10} pad="16px 18px">
      <div className={s.stack} style={{ gap: 10 }}>
        <Skeleton w={150} h={16} />
        <Skeleton w="70%" h={12} />
        <SkeletonPill w={96} h={24} />
        <SkeletonPill w={140} h={24} />
        <div className={s.wrapRow} style={{ marginTop: 6 }}>
          <SkeletonButton w={110} h={34} />
          <SkeletonButton w={110} h={34} />
          <SkeletonButton w={110} h={34} />
        </div>
      </div>
    </SkeletonCard>
  );
}

export default function Loading() {
  return (
    <SkeletonShell className="parent-home">
      {/* 1) Information carousel */}
      <div className="home-block">
        <SkeletonBanner h={150} r={14} />
      </div>

      {/* 2) My children: heading left, add-child button right, card grid */}
      <div className="home-block">
        <div className="children-head">
          <Skeleton w={200} h={26} />
          <SkeletonButton w={150} h={40} />
        </div>
        <div className="children-grid">
          <ChildCardSkeleton />
          <ChildCardSkeleton />
          <ChildCardSkeleton />
        </div>
      </div>

      {/* 3) Latest news */}
      <div className="home-block">
        <Skeleton w={160} h={20} />
        <SkeletonAutoGrid min={300} gap={20}>
          <SkeletonMediaCard />
          <SkeletonMediaCard />
          <SkeletonMediaCard />
        </SkeletonAutoGrid>
      </div>
    </SkeletonShell>
  );
}
