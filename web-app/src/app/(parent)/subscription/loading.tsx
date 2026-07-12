// Skeleton for the subscription center: page head, child tabs, section tabs,
// plans (child head + three plan cards), billing rows panel, invoices table.
// Mirrors .billing-page (1080px) / .plans-grid / .billing-panel geometry.
import {
  Skeleton,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  SkeletonFilters,
  SkeletonPill,
  SkeletonShell,
  SkeletonTable,
  skeletonStyles as s,
} from "@/components/skeletons";
import { SkeletonPlansGrid } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <SkeletonShell
      style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 28px 72px" }}
    >
      {/* .billing-head */}
      <div className={s.stack} style={{ gap: 10, marginBottom: 22 }}>
        <Skeleton w={280} h={30} />
        <Skeleton w={400} h={13} style={{ maxWidth: "90%" }} />
      </div>

      {/* child selector tabs + section tabs */}
      <SkeletonFilters chips={2} w={160} h={44} style={{ marginBottom: 14 }} />
      <SkeletonFilters chips={3} w={110} h={36} style={{ marginBottom: 28 }} />

      {/* PLANS section: child head row + three-up plan cards */}
      <div className={s.stack} style={{ gap: 18, marginBottom: 40 }}>
        <Skeleton w={170} h={20} />
        <div className={s.row} style={{ gap: 12 }}>
          <SkeletonAvatar size={40} />
          <Skeleton w={150} h={16} />
          <SkeletonPill w={82} h={24} />
        </div>
        <SkeletonPlansGrid benefits={3} />
      </div>

      {/* BILLING section: label/value rows + action buttons */}
      <div className={s.stack} style={{ gap: 18, marginBottom: 40 }}>
        <Skeleton w={140} h={20} />
        <SkeletonCard r={18} pad="26px 28px">
          <div className={s.stack} style={{ gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={s.rowBetween}>
                <Skeleton w={130} h={13} />
                <Skeleton w={110} h={13} />
              </div>
            ))}
            <div className={s.wrapRow} style={{ marginTop: 8 }}>
              <SkeletonButton w={150} h={38} />
              <SkeletonButton w={130} h={38} />
              <SkeletonButton w={160} h={38} />
            </div>
          </div>
        </SkeletonCard>
      </div>

      {/* INVOICES section */}
      <div className={s.stack} style={{ gap: 18 }}>
        <Skeleton w={130} h={20} />
        <SkeletonTable rows={4} cols={5} />
      </div>
    </SkeletonShell>
  );
}
