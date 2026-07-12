// Skeleton for the leaderboard: heading, board tabs, scope/period chips,
// top-50 table panel, sticky "your rank" card shape at the bottom.
import {
  Skeleton,
  SkeletonCard,
  SkeletonFilters,
  SkeletonHeading,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonHeading eyebrow titleW={230} titleH={28} style={{ marginBottom: 18 }} />

      {/* board tabs + scope chips + period chips */}
      <SkeletonFilters chips={2} w={120} h={38} style={{ marginBottom: 16 }} />
      <SkeletonFilters chips={3} w={92} h={30} style={{ marginBottom: 12 }} />
      <SkeletonFilters chips={2} w={104} h={30} style={{ marginBottom: 18 }} />

      {/* top-50 table */}
      <SkeletonCard r={14} pad="8px 14px">
        <div className={s.divided}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className={s.listItem} style={{ padding: "13px 0" }}>
              <Skeleton w={32} h={14} style={{ flex: "none" }} />
              <Skeleton circle w={30} h={30} />
              <div className={s.grow}>
                <Skeleton w={`${52 - (i % 4) * 7}%`} h={13} />
              </div>
              <Skeleton w={56} h={14} style={{ flex: "none" }} />
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* your-rank card */}
      <SkeletonCard r={16} pad="16px 20px" style={{ marginTop: 16 }}>
        <div className={s.rowBetween}>
          <div className={s.stack} style={{ gap: 7 }}>
            <Skeleton w={90} h={10} />
            <Skeleton w={120} h={20} />
          </div>
          <Skeleton w={90} h={18} />
        </div>
      </SkeletonCard>
    </SkeletonShell>
  );
}
