// Skeleton for the pricing page: centered head, three-up plan cards,
// sibling-discount box, footnote (mirrors .pricing2-page geometry).
import {
  Skeleton,
  SkeletonCard,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";
import { SkeletonPlansGrid } from "@/components/skeletons/pages";

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

      <SkeletonPlansGrid benefits={3} />

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
