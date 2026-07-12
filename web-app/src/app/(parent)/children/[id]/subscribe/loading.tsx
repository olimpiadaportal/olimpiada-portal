// Skeleton for the per-child subscribe/manage-subjects page (600px column:
// title, child name, subject checkbox rows, interval segment, summary, CTA).
import {
  Skeleton,
  SkeletonButton,
  SkeletonCard,
  SkeletonFilters,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell style={{ maxWidth: 600 }}>
      <div className={s.stack} style={{ gap: 10, marginBottom: 20 }}>
        <Skeleton w={230} h={26} />
        <Skeleton w={150} h={13} />
      </div>

      <SkeletonCard r={14} pad={22}>
        <div className={s.stack} style={{ gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={s.row} style={{ gap: 12 }}>
              <Skeleton w={20} h={20} r={6} />
              <Skeleton w={`${52 - i * 6}%`} h={14} />
              <Skeleton w={64} h={12} style={{ marginLeft: "auto" }} />
            </div>
          ))}
          <SkeletonFilters chips={3} w={96} h={34} style={{ marginTop: 8 }} />
          <Skeleton w="60%" h={14} style={{ marginTop: 6 }} />
          <SkeletonButton w={180} h={44} style={{ marginTop: 8 }} />
        </div>
      </SkeletonCard>
    </SkeletonShell>
  );
}
