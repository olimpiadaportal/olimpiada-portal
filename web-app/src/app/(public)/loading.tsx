// Group-level fallback for the public site — shaped like the HOME page (hero,
// feature card grid, stat band), since the group index page is the only route
// whose loading boundary lives at this level; every other public route ships
// its own layout-matched loading.tsx.
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonButton,
  SkeletonCard,
  SkeletonShell,
  SkeletonStatGrid,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      {/* .hero */}
      <div className={s.stack} style={{ gap: 12, padding: "28px 0 8px" }}>
        <Skeleton w="70%" h={34} style={{ maxWidth: 560 }} />
        <Skeleton w="55%" h={15} style={{ maxWidth: 460 }} />
        <div className={s.wrapRow} style={{ marginTop: 16, gap: 12 }}>
          <SkeletonButton w={150} h={42} />
          <SkeletonButton w={140} h={42} />
        </div>
      </div>

      {/* .grid feature cards: repeat(auto-fit, minmax(200px, 1fr)) gap 14 */}
      <div style={{ marginTop: 18 }}>
        <SkeletonAutoGrid min={200} gap={14}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} r={10} pad="16px 18px">
              <div className={s.stack} style={{ gap: 9 }}>
                <Skeleton w="60%" h={15} />
                <Skeleton w="95%" h={12} />
                <Skeleton w="75%" h={12} />
              </div>
            </SkeletonCard>
          ))}
        </SkeletonAutoGrid>
      </div>

      {/* stat band */}
      <div className={s.stack} style={{ gap: 22, marginTop: 40 }}>
        <Skeleton w={260} h={22} />
        <SkeletonStatGrid items={4} min={180} gap={16} valueH={30} />
      </div>
    </SkeletonShell>
  );
}
