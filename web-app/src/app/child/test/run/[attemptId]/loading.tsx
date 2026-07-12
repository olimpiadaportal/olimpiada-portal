// Minimal runner-frame skeleton for a live attempt: sticky-top bar shapes
// (title + save state + timer), meta line, then the 1fr/264px run grid —
// question card (code, prompt, options, actions) and the side palette
// (5-across cells) — mirroring .tst-run / .tst-run-grid / .tst-palette.
import type { CSSProperties } from "react";
import {
  Skeleton,
  SkeletonButton,
  SkeletonCard,
  SkeletonShell,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* top bar */}
      <SkeletonCard r={14} pad="14px 18px" style={{ marginBottom: 14 }}>
        <div className={s.rowBetween}>
          <div className={s.row} style={{ gap: 12 }}>
            <Skeleton w={140} h={14} />
            <Skeleton w={56} h={12} />
          </div>
          <div className={s.row} style={{ gap: 12 }}>
            <Skeleton w={80} h={11} />
            <Skeleton w={72} h={28} r={8} />
          </div>
        </div>
      </SkeletonCard>

      {/* subject + topics meta line */}
      <div className={s.wrapRow} style={{ margin: "0 0 16px" }}>
        <Skeleton w={110} h={12} />
        <Skeleton w={90} h={12} />
        <Skeleton w={120} h={12} />
      </div>

      {/* run grid: question card | palette side (stacks under 860px) */}
      <div
        className={s.split}
        style={{ "--sk-left": "1fr", "--sk-right": "264px", "--sk-gap": "18px" } as CSSProperties}
      >
        <SkeletonCard r={16} pad={26}>
          <div className={s.rowBetween} style={{ marginBottom: 16 }}>
            <Skeleton w={70} h={12} />
            <Skeleton w={30} h={30} r={9} />
          </div>
          <div className={s.stack} style={{ gap: 10, marginBottom: 22 }}>
            <Skeleton w="96%" h={15} />
            <Skeleton w="88%" h={15} />
            <Skeleton w="60%" h={15} />
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

        <SkeletonCard r={14} pad={20}>
          <Skeleton w={110} h={10} style={{ marginBottom: 12 }} />
          <div
            aria-hidden="true"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
            }}
          >
            {Array.from({ length: 25 }).map((_, i) => (
              <Skeleton key={i} w="100%" h="auto" r={9} style={{ aspectRatio: "1" }} />
            ))}
          </div>
          <div className={s.stack} style={{ gap: 10, marginTop: 16 }}>
            <Skeleton w="80%" h={10} />
            <SkeletonButton w="100%" h={40} r={12} />
            <SkeletonButton w="100%" h={36} r={12} />
          </div>
        </SkeletonCard>
      </div>
    </SkeletonShell>
  );
}
