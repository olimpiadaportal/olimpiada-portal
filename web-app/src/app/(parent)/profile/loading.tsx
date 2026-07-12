// Skeleton for the parent profile: 720px column, identity card (avatar +
// name/contact rows + edit fields), notification-preferences card.
import {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonForm,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell
      className={s.stack}
      style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 64px", gap: 20 }}
    >
      <Skeleton w={160} h={26} />

      {/* identity / edit card */}
      <SkeletonCard r={18} pad={24}>
        <div className={s.row} style={{ gap: 16, marginBottom: 22 }}>
          <SkeletonAvatar size={72} />
          <div className={s.stack} style={{ gap: 8, flex: 1 }}>
            <Skeleton w={180} h={18} />
            <Skeleton w={220} h={12} />
          </div>
        </div>
        <SkeletonForm fields={3} inputH={42} />
      </SkeletonCard>

      {/* notification preferences card */}
      <SkeletonCard r={18} pad={24}>
        <div className={s.stack} style={{ gap: 16 }}>
          <Skeleton w={230} h={17} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={s.rowBetween}>
              <Skeleton w={170} h={13} />
              <Skeleton w={44} h={24} r={999} />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonShell>
  );
}
