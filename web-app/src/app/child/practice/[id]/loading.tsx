// Skeleton for the practice runner: progress strip + question card with
// options and confirm action (compact single-column quiz frame).
import {
  Skeleton,
  SkeletonButton,
  SkeletonCard,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      <div className={s.rowBetween} style={{ marginBottom: 14 }}>
        <Skeleton w={140} h={14} />
        <Skeleton w={70} h={12} />
      </div>
      <Skeleton w="100%" h={8} r={999} style={{ marginBottom: 18 }} />

      <SkeletonCard r={16} pad={26}>
        <div className={s.stack} style={{ gap: 10, marginBottom: 22 }}>
          <Skeleton w="94%" h={15} />
          <Skeleton w="72%" h={15} />
        </div>
        <div className={s.stack} style={{ gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} w="100%" h={52} r={12} />
          ))}
        </div>
        <div className={s.rowBetween} style={{ marginTop: 22 }}>
          <SkeletonButton w={110} h={40} r={12} />
          <SkeletonButton w={130} h={40} r={12} />
        </div>
      </SkeletonCard>
    </SkeletonShell>
  );
}
