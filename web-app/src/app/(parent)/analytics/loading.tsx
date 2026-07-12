// Skeleton for the parent analytics dashboard: page head, 4 metric cards,
// section head, child/subject selector row, KPI grid, chart cards, topics
// table. Mirrors .ana-page / .analytics-grid / .ana-kpis geometry.
import type { CSSProperties } from "react";
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonCard,
  SkeletonFilters,
  SkeletonHeading,
  SkeletonShell,
  SkeletonStatGrid,
  SkeletonTable,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell
      className={s.stack}
      style={{ gap: 24, padding: "8px 0 24px" } as CSSProperties}
    >
      {/* .ana-head */}
      <SkeletonHeading titleW={260} titleH={28} sub subW={420} />

      {/* .analytics-grid: repeat(auto-fit, minmax(200px, 1fr)) gap 18 */}
      <SkeletonStatGrid items={4} min={200} gap={18} valueH={28} />

      {/* .ana-section-head (bordered top) */}
      <div
        className={s.stack}
        style={{
          gap: 8,
          marginTop: 16,
          paddingTop: 24,
          borderTop: "1px solid var(--line, var(--border))",
        }}
      >
        <Skeleton w={230} h={20} />
        <Skeleton w={340} h={12} style={{ maxWidth: "90%" }} />
      </div>

      {/* child selector + subject tabs */}
      <div className={s.wrapRow} style={{ gap: 10 }}>
        <Skeleton w={190} h={40} r={10} />
        <SkeletonFilters chips={4} w={92} h={34} />
      </div>

      {/* KPI grid: repeat(auto-fill, minmax(160px, 1fr)) gap 16 */}
      <SkeletonStatGrid items={6} min={160} gap={16} valueH={24} />

      {/* chart cards */}
      <SkeletonAutoGrid min={300} gap={18}>
        {[0, 1].map((i) => (
          <SkeletonCard key={i} r={16} pad={20}>
            <div className={s.stack} style={{ gap: 10 }}>
              <Skeleton w={170} h={15} />
              <Skeleton w={230} h={11} style={{ maxWidth: "80%" }} />
              <Skeleton w="100%" h={200} r={10} style={{ marginTop: 8 }} />
            </div>
          </SkeletonCard>
        ))}
      </SkeletonAutoGrid>

      {/* topics / mistakes table */}
      <SkeletonTable rows={6} cols={5} />
    </SkeletonShell>
  );
}
