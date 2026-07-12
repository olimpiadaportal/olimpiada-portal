// Skeleton for the student test home: heading, continue bar, subject grid
// (auto-fill minmax(280px,1fr) like .tst-grid), recent-attempts panel.
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonButton,
  SkeletonCard,
  SkeletonHeading,
  SkeletonList,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonHeading eyebrow titleW={240} titleH={28} sub subW={420} style={{ marginBottom: 26 }} />

      {/* continue-attempt bar */}
      <SkeletonCard r={14} pad="18px 20px" style={{ marginBottom: 26 }}>
        <div className={s.rowBetween}>
          <div className={s.stack} style={{ gap: 7, flex: 1, minWidth: 160 }}>
            <Skeleton w={180} h={14} />
            <Skeleton w={220} h={11} style={{ maxWidth: "90%" }} />
          </div>
          <SkeletonButton w={110} h={36} />
        </div>
      </SkeletonCard>

      <Skeleton w={160} h={17} style={{ margin: "0 0 14px" }} />

      {/* subject cards */}
      <SkeletonAutoGrid min={280} gap={14}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} r={14} pad="16px 18px">
            <div className={s.row} style={{ gap: 14 }}>
              <Skeleton circle w={40} h={40} />
              <div className={s.stack} style={{ gap: 7, flex: 1 }}>
                <Skeleton w="65%" h={14} />
                <Skeleton w="85%" h={11} />
              </div>
              <SkeletonButton w={64} h={32} />
            </div>
          </SkeletonCard>
        ))}
      </SkeletonAutoGrid>

      <Skeleton w={180} h={17} style={{ margin: "26px 0 14px" }} />
      <SkeletonList rows={4} icon={false} trailing pad="6px 20px" />
    </SkeletonShell>
  );
}
