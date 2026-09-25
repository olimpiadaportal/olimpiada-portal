// Group-level fallback for the public site — shaped like the HOME page (app
// showcase hero, site intro, feature card grid, stat band), since the group
// index page is the only route
// whose loading boundary lives at this level; every other public route ships
// its own layout-matched loading.tsx.
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonButton,
  SkeletonCard,
  SkeletonShell,
  SkeletonSplit,
  SkeletonStatGrid,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      {/* App showcase hero (components/appHero): copy column + phone. It is
          ~600px tall on desktop, and a skeleton shorter than that leaves the
          FOOTER on screen while loading and then throws it off the bottom when
          the page arrives — a layout shift of ~0.22 on a 1440x900 screen. */}
      <SkeletonSplit left="1.12fr" right="0.88fr" gap={24} style={{ alignItems: "center", padding: "36px 0 44px" }}>
        <div className={s.stack} style={{ gap: 18 }}>
          <Skeleton w={230} h={28} r={999} />
          <div className={s.stack} style={{ gap: 10 }}>
            <Skeleton w="92%" h={44} />
            <Skeleton w="70%" h={44} />
          </div>
          <div className={s.stack} style={{ gap: 8 }}>
            <Skeleton w="95%" h={15} />
            <Skeleton w="70%" h={15} />
          </div>
          <div className={s.wrapRow} style={{ marginTop: 12, gap: 12 }}>
            <SkeletonButton w={168} h={54} />
            <SkeletonButton w={200} h={54} />
          </div>
          <Skeleton w={280} h={34} />
        </div>
        {/* The phone: 266px wide at the real frame's proportions. */}
        <Skeleton
          w="min(266px, 62vw)"
          h="auto"
          r={50}
          style={{ aspectRatio: "266 / 583", justifySelf: "center" }}
        />
      </SkeletonSplit>

      {/* Site intro — the former hero, now the second section (h2). */}
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
