// Skeleton for the About page: hero (copy + illustration), alternating
// copy/art blocks, values card grid (mirrors .about2-* geometry).
import type { CSSProperties } from "react";
import {
  Skeleton,
  SkeletonCard,
  SkeletonColumns,
  SkeletonPill,
  SkeletonShell,
  SkeletonText,
  skeletonStyles as s,
} from "@/components/skeletons";

function Block({ reversed = false }: { reversed?: boolean }) {
  const art = <Skeleton w="100%" h="auto" r={18} style={{ aspectRatio: "4 / 3" }} />;
  const copy = (
    <div className={s.stack} style={{ gap: 12 }}>
      <SkeletonPill w={90} h={24} />
      <Skeleton w="70%" h={24} />
      <SkeletonText lines={3} size={13} lastWidth="55%" />
    </div>
  );
  return (
    <div
      className={s.split}
      style={{ "--sk-left": "1fr", "--sk-right": "1fr", "--sk-gap": "40px", alignItems: "center" } as CSSProperties}
    >
      {reversed ? copy : art}
      {reversed ? art : copy}
    </div>
  );
}

export default function Loading() {
  return (
    <SkeletonShell className={s.stack} style={{ gap: 48 }}>
      {/* hero */}
      <SkeletonCard r={22} pad="48px 44px">
        <div
          className={s.split}
          style={{ "--sk-left": "1.1fr", "--sk-right": "0.9fr", "--sk-gap": "40px", alignItems: "center" } as CSSProperties}
        >
          <div className={s.stack} style={{ gap: 14 }}>
            <Skeleton w={130} h={12} />
            <Skeleton w="85%" h={34} />
            <SkeletonText lines={3} size={13} lastWidth="60%" />
            <div className={s.wrapRow} style={{ marginTop: 6 }}>
              <SkeletonPill w={96} h={28} />
              <SkeletonPill w={96} h={28} />
              <SkeletonPill w={96} h={28} />
            </div>
          </div>
          <Skeleton w="100%" h="auto" r={16} style={{ aspectRatio: "4 / 3" }} />
        </div>
      </SkeletonCard>

      <Block />
      <Block reversed />

      {/* values */}
      <div className={s.stack} style={{ gap: 16 }}>
        <Skeleton w={280} h={26} />
        <Skeleton w="60%" h={13} style={{ maxWidth: 480 }} />
        <SkeletonColumns cols={2} gap={20} style={{ marginTop: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} r={16} pad={22}>
              <div className={s.row} style={{ gap: 14, alignItems: "flex-start" }}>
                <Skeleton circle w={40} h={40} />
                <div className={s.stack} style={{ gap: 9, flex: 1 }}>
                  <Skeleton w="55%" h={15} />
                  <SkeletonText lines={2} size={12} lastWidth="70%" />
                </div>
              </div>
            </SkeletonCard>
          ))}
        </SkeletonColumns>
      </div>
    </SkeletonShell>
  );
}
