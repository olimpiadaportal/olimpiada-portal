// Skeleton for the student olympiads page: heading, planned-events card grid
// (three-up with 16/9 covers like .oly4-grid), "my olympiads" panel rows.
import {
  Skeleton,
  SkeletonColumns,
  SkeletonHeading,
  SkeletonList,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";
import { SkeletonMediaCard } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <SkeletonShell>
      <SkeletonHeading eyebrow titleW={240} titleH={28} style={{ marginBottom: 20 }} />

      {/* planned events */}
      <div className={s.stack} style={{ gap: 14, marginBottom: 30 }}>
        <Skeleton w={210} h={18} />
        <SkeletonColumns cols={3} gap={16}>
          <SkeletonMediaCard chips={2} metaRow />
          <SkeletonMediaCard chips={2} metaRow />
          <SkeletonMediaCard chips={2} metaRow />
        </SkeletonColumns>
      </div>

      {/* my olympiads */}
      <div className={s.stack} style={{ gap: 14 }}>
        <Skeleton w={180} h={18} />
        <SkeletonList rows={3} icon trailing pad="6px 20px" />
      </div>
    </SkeletonShell>
  );
}
