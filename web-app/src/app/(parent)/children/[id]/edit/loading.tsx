// Skeleton for the child-info edit form (same .wiz-page column as Add-Child).
import {
  Skeleton,
  SkeletonButton,
  SkeletonCard,
  SkeletonForm,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell style={{ width: "100%", maxWidth: 720, marginInline: "auto" }}>
      <div className={s.rowBetween} style={{ marginBottom: 12 }}>
        <Skeleton w={240} h={26} />
        <SkeletonButton w={130} h={36} />
      </div>
      <Skeleton w="70%" h={13} style={{ marginBottom: 20 }} />

      <div style={{ maxWidth: 520, marginInline: "auto" }}>
        <SkeletonCard r={16} pad={22}>
          <SkeletonForm fields={5} inputH={44} />
        </SkeletonCard>
      </div>
    </SkeletonShell>
  );
}
