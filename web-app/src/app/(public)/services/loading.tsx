// Skeleton for the services page: centered head, the two-column pricing
// configurator (.pcfg geometry), sibling-discount box, footnote.
import {
  Skeleton,
  SkeletonCard,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell style={{ maxWidth: 1040, margin: "0 auto", padding: "8px 0 48px" }}>
      {/* centered .pricing-head */}
      <div
        className={s.stack}
        style={{ alignItems: "center", gap: 12, maxWidth: 720, margin: "0 auto 40px" }}
      >
        <Skeleton w="60%" h={36} style={{ maxWidth: 420 }} />
        <Skeleton w="80%" h={14} style={{ maxWidth: 520 }} />
        <Skeleton w={220} h={28} r={999} />
      </div>

      {/* configurator: subject picker + summary panel */}
      <div className="pcfg">
        <SkeletonCard r={20} pad="24px">
          <div className={s.stack} style={{ gap: 14 }}>
            <Skeleton w={160} h={16} />
            <Skeleton w="70%" h={12} />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={52} r={14} />
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard r={20} pad="24px">
          <div className={s.stack} style={{ gap: 14 }}>
            <Skeleton w={150} h={16} />
            <Skeleton h={44} r={999} />
            <Skeleton h={140} r={16} />
            <Skeleton h={48} r={14} />
          </div>
        </SkeletonCard>
      </div>

      {/* sibling-discount box */}
      <SkeletonCard r={16} pad="18px 20px" style={{ marginTop: 28 }}>
        <div className={s.row} style={{ gap: 14 }}>
          <Skeleton circle w={40} h={40} />
          <div className={s.stack} style={{ gap: 8, flex: 1 }}>
            <Skeleton w={200} h={14} />
            <Skeleton w="85%" h={12} />
          </div>
        </div>
      </SkeletonCard>

      <Skeleton w="55%" h={12} style={{ margin: "22px auto 0" }} />
    </SkeletonShell>
  );
}
