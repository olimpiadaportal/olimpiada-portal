// Skeleton for the Add-Child wizard (mirrors .wiz-page: 720px centered column,
// head row with back button, step indicator, narrow form column).
import {
  Skeleton,
  SkeletonButton,
  SkeletonCard,
  SkeletonFilters,
  SkeletonForm,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell style={{ width: "100%", maxWidth: 720, marginInline: "auto" }}>
      {/* .wiz-head: title left, dashboard link right */}
      <div className={s.rowBetween} style={{ marginBottom: 12 }}>
        <Skeleton w={230} h={26} />
        <SkeletonButton w={130} h={36} />
      </div>
      <Skeleton w="80%" h={13} style={{ marginBottom: 20 }} />

      {/* wizard step indicator */}
      <SkeletonFilters chips={4} w={72} h={26} style={{ marginBottom: 20 }} />

      {/* form step (info fields) */}
      <div style={{ maxWidth: 520, marginInline: "auto" }}>
        <SkeletonCard r={16} pad={22}>
          <SkeletonForm fields={5} inputH={44} />
        </SkeletonCard>
      </div>
    </SkeletonShell>
  );
}
