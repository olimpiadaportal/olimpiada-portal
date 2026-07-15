// Skeleton for the student arena home (Round 21 layout): hero (welcome panel
// + rank panel), ticker strip, two-column [leaderboard quick-look | subject
// strength] row, full-width recent-rounds list. Reuses the real .arena-hero /
// .arena-cols grid classes so column ratios and breakpoints match the loaded
// page exactly. Renders inside the .arena scope, so the bones pick up the
// arena panel tokens automatically.
import {
  Skeleton,
  SkeletonButton,
  SkeletonCard,
  SkeletonList,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      {/* ---- Hero: 1.3fr / 1fr grid ---- */}
      <div className="arena-hero">
        <SkeletonCard r={16} pad={30}>
          <div className={s.stack} style={{ gap: 14 }}>
            <Skeleton w={140} h={11} />
            <Skeleton w="85%" h={26} />
            <Skeleton w="55%" h={26} />
            <div className={s.wrapRow} style={{ marginTop: 12 }}>
              <SkeletonButton w={150} h={44} r={12} />
              <SkeletonButton w={130} h={44} r={12} />
            </div>
          </div>
        </SkeletonCard>
        <SkeletonCard r={16} pad={24}>
          <div className={s.stack} style={{ gap: 14 }}>
            <Skeleton w={110} h={11} />
            <Skeleton w={90} h={40} />
            <div className={s.row} style={{ gap: 12, marginTop: 6 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={s.stack} style={{ gap: 6, flex: 1 }}>
                  <Skeleton w="70%" h={18} />
                  <Skeleton w="90%" h={10} />
                </div>
              ))}
            </div>
          </div>
        </SkeletonCard>
      </div>

      {/* ---- Ticker strip ---- */}
      <Skeleton w="100%" h={40} r={999} style={{ margin: "0 0 26px" }} />

      {/* ---- Two-column: leaderboard quick-look | subject strength ---- */}
      <div className="arena-cols">
        <SkeletonCard r={16} pad="18px 20px">
          <div className={s.rowBetween} style={{ marginBottom: 14 }}>
            <Skeleton w={170} h={13} />
            <Skeleton w={110} h={12} />
          </div>
          <div className={s.row} style={{ gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={s.stack} style={{ gap: 6, flex: 1 }}>
                <Skeleton w="60%" h={20} />
                <Skeleton w="85%" h={10} />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <div>
          <Skeleton w={190} h={17} style={{ margin: "0 0 14px" }} />
          <SkeletonCard r={14} pad={20}>
            <div className={s.stack} style={{ gap: 16 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={s.stack} style={{ gap: 8 }}>
                  <div className={s.rowBetween}>
                    <Skeleton w={120} h={12} />
                    <Skeleton w={36} h={12} />
                  </div>
                  <Skeleton w="100%" h={8} r={999} />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>

      {/* ---- Recent rounds — full-width history strip ---- */}
      <Skeleton w={150} h={17} style={{ margin: "26px 0 14px" }} />
      <SkeletonList rows={3} icon={false} trailing pad="6px 20px" />
    </SkeletonShell>
  );
}
