// Skeleton for the student profile: 720px column with identity card,
// read-only school info rows, sticker-theme gallery, palette picker row.
import {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell
      className={s.stack}
      style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 64px", gap: 16 }}
    >
      <Skeleton w={140} h={22} style={{ marginBottom: 4 }} />

      {/* identity card */}
      <SkeletonCard r={18} pad={24}>
        <div className={s.row} style={{ gap: 16 }}>
          <SkeletonAvatar size={64} />
          <div className={s.stack} style={{ gap: 8, flex: 1 }}>
            <Skeleton w={170} h={17} />
            <Skeleton w={120} h={12} />
          </div>
          <Skeleton w={96} h={34} r={10} style={{ flex: "none" }} />
        </div>
      </SkeletonCard>

      {/* school info rows */}
      <SkeletonCard r={18} pad={24}>
        <div className={s.stack} style={{ gap: 14 }}>
          <Skeleton w={180} h={15} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={s.rowBetween}>
              <Skeleton w={100} h={12} />
              <Skeleton w={160} h={12} />
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* sticker themes gallery */}
      <SkeletonCard r={18} pad={24}>
        <div className={s.stack} style={{ gap: 14 }}>
          <Skeleton w={200} h={15} />
          <Skeleton w="75%" h={11} />
          <div className={s.wrapRow} style={{ gap: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} w={140} h={96} r={12} />
            ))}
          </div>
        </div>
      </SkeletonCard>

      {/* palette picker */}
      <SkeletonCard r={18} pad={24}>
        <div className={s.stack} style={{ gap: 14 }}>
          <Skeleton w={160} h={15} />
          <div className={s.wrapRow} style={{ gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} circle w={44} h={44} />
            ))}
          </div>
        </div>
      </SkeletonCard>
    </SkeletonShell>
  );
}
