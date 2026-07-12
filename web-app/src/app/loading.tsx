// Root suspense fallback — a neutral, language-free shell skeleton shown on
// the FIRST load of any area while the group layout (auth guards, flags, i18n)
// is still resolving. It sketches the shared chrome every shell renders — a
// top bar (brand mark, nav pills, avatar) over a content column — using only
// theme tokens, so it reads correctly in light and dark before any layout
// mounts. Per-route loading.tsx files take over for in-app navigations.
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonPill,
  SkeletonShell,
  SkeletonText,
  skeletonStyles as s,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <SkeletonShell>
      {/* top bar (mirrors .pnav / .site-nav geometry) */}
      <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div
          className={s.row}
          style={{ maxWidth: 1080, margin: "0 auto", padding: "14px 28px", gap: 14 }}
        >
          <Skeleton circle w={18} h={18} />
          <div className={s.wrapRow} style={{ gap: 8 }}>
            <SkeletonPill w={72} h={30} />
            <SkeletonPill w={72} h={30} />
            <SkeletonPill w={72} h={30} />
          </div>
          <div className={s.row} style={{ marginLeft: "auto", gap: 10 }}>
            <SkeletonAvatar size={36} />
          </div>
        </div>
      </div>

      {/* content column (mirrors .site-main: 960px, 24px top padding) */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 40px" }}>
        <div className={s.stack} style={{ gap: 12, margin: "8px 0 24px" }}>
          <Skeleton w="45%" h={26} style={{ maxWidth: 340 }} />
          <Skeleton w="65%" h={13} style={{ maxWidth: 480 }} />
        </div>

        <SkeletonAutoGrid min={260} gap={18}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} r={14} pad={20}>
              <div className={s.stack} style={{ gap: 10 }}>
                <Skeleton w="55%" h={16} />
                <SkeletonText lines={3} size={12} lastWidth="60%" />
              </div>
            </SkeletonCard>
          ))}
        </SkeletonAutoGrid>

        <SkeletonCard r={14} pad={20} style={{ marginTop: 18 }}>
          <div className={s.stack} style={{ gap: 14 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={s.row} style={{ gap: 12 }}>
                <Skeleton circle w={30} h={30} />
                <Skeleton w={`${68 - i * 9}%`} h={12} />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </SkeletonShell>
  );
}
