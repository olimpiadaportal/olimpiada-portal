// Skeleton for the attempt result page: heading, score card (big score +
// percent + actions), per-topic breakdown panel with progress bars.
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
      <SkeletonHeading eyebrow titleW={220} titleH={28} sub subW={160} style={{ marginBottom: 22 }} />

      <SkeletonCard r={16} pad={26} style={{ maxWidth: 640 }}>
        <div className={s.stack} style={{ gap: 12 }}>
          <Skeleton w={150} h={44} />
          <Skeleton w={70} h={18} />
          <div className={s.wrapRow} style={{ marginTop: 10 }}>
            <SkeletonButton w={150} h={42} r={12} />
            <SkeletonButton w={130} h={42} r={12} />
          </div>
        </div>
      </SkeletonCard>

      <Skeleton w={170} h={17} style={{ margin: "30px 0 14px" }} />
      <SkeletonCard r={14} pad={20} style={{ maxWidth: 640 }}>
        <div className={s.stack} style={{ gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={s.stack} style={{ gap: 8 }}>
              <div className={s.rowBetween}>
                <Skeleton w={140} h={12} />
                <Skeleton w={44} h={12} />
              </div>
              <Skeleton w="100%" h={8} r={999} />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonShell>
  );
}
