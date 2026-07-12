// Skeleton for the test setup page: eyebrow + subject title, topic picker
// panel (tri-state rows), start CTA.
import {
  Skeleton,
  SkeletonButton,
  SkeletonCard,
  SkeletonHeading,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonHeading eyebrow titleW={220} titleH={28} style={{ marginBottom: 22 }} />

      <SkeletonCard r={14} pad={20} style={{ marginBottom: 18 }}>
        <div className={s.stack} style={{ gap: 14 }}>
          <div className={s.wrapRow} style={{ marginBottom: 4 }}>
            <Skeleton w={110} h={30} r={999} />
            <Skeleton w={110} h={30} r={999} />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={s.row} style={{ gap: 12 }}>
              <Skeleton w={20} h={20} r={6} />
              <Skeleton w={`${64 - (i % 3) * 9}%`} h={13} />
            </div>
          ))}
        </div>
      </SkeletonCard>

      <SkeletonButton w={200} h={46} r={12} />
    </SkeletonShell>
  );
}
