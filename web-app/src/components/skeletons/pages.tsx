// =============================================================================
// Shared per-page skeleton compositions.
//
// These mirror surfaces that are reused across the public, parent and student
// shells (news list/article, notification center, auth forms, plan cards,
// cover-media cards), so the three route groups keep identical loading
// geometry from a single source. Layout mirrors the real components' grids:
//   - news list  → .news-grid  (auto-fill minmax(300px,1fr)), 16/9 media
//   - news detail→ .news-detail (760px centered), 16/9 media, long body
//   - notifications → 720px centered head + filter chips + divided rows
//   - plan cards → .plans-grid three-up card geometry
// =============================================================================
import type { CSSProperties } from "react";
import {
  Skeleton,
  SkeletonAutoGrid,
  SkeletonButton,
  SkeletonCard,
  SkeletonColumns,
  SkeletonFilters,
  SkeletonForm,
  SkeletonHeading,
  SkeletonPill,
  SkeletonShell,
  SkeletonText,
  skeletonStyles as s,
} from "./index";

/* ------------------------------------------------------- Cover media card -- */

/** Card with a 16/9 cover + text body (news card / olympiad package card). */
export function SkeletonMediaCard({
  chips = 0,
  metaRow = true,
  style,
}: {
  chips?: number;
  metaRow?: boolean;
  style?: CSSProperties;
}) {
  return (
    <SkeletonCard r={16} pad={0} style={{ overflow: "hidden", ...style }}>
      <Skeleton w="100%" h="auto" r={0} style={{ aspectRatio: "16 / 9" }} />
      <div className={s.stack} style={{ gap: 10, padding: "16px 18px 18px" }}>
        {chips > 0 && (
          <div className={s.wrapRow}>
            {Array.from({ length: chips }).map((_, i) => (
              <SkeletonPill key={i} w={64} h={22} />
            ))}
          </div>
        )}
        <Skeleton w="85%" h={16} />
        <SkeletonText lines={2} size={12} lastWidth="55%" />
        {metaRow && (
          <div className={s.rowBetween} style={{ marginTop: 4 }}>
            <Skeleton w={90} h={11} />
            <Skeleton w={54} h={11} />
          </div>
        )}
      </div>
    </SkeletonCard>
  );
}

/* -------------------------------------------------------------- News list -- */

/**
 * Mirrors <NewsBrowser/>: sort-chip toolbar, .news-grid of media cards
 * (auto-fill minmax(300px,1fr)), pager row. `eyebrow` mimics the arena
 * heading style used by /child/news.
 */
export function NewsListSkeleton({ eyebrow = false }: { eyebrow?: boolean }) {
  return (
    <SkeletonShell>
      <SkeletonHeading eyebrow={eyebrow} titleW={220} titleH={26} style={{ marginBottom: 18 }} />
      {/* .news-toolbar: sort chips left, count right */}
      <div className={s.rowBetween} style={{ margin: "6px 0 18px" }}>
        <SkeletonFilters chips={3} w={92} h={30} />
        <Skeleton w={70} h={12} />
      </div>
      {/* .news-grid: repeat(auto-fill, minmax(300px, 1fr)) gap 20 */}
      <SkeletonAutoGrid min={300} gap={20}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonMediaCard key={i} />
        ))}
      </SkeletonAutoGrid>
      {/* .news-pager */}
      <div className={s.row} style={{ justifyContent: "center", marginTop: 26 }}>
        <SkeletonButton w={38} h={34} />
        <SkeletonButton w={38} h={34} />
        <Skeleton w={64} h={12} />
        <SkeletonButton w={38} h={34} />
        <SkeletonButton w={38} h={34} />
      </div>
    </SkeletonShell>
  );
}

/* ----------------------------------------------------------- News article -- */

/** Mirrors <NewsArticleView/>: .news-detail column (max 760px, centered). */
export function NewsArticleSkeleton() {
  return (
    <SkeletonShell style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 44px" }}>
      <Skeleton w={110} h={12} style={{ marginBottom: 18 }} />
      <div className={s.stack} style={{ gap: 10 }}>
        <Skeleton w="92%" h={30} />
        <Skeleton w="60%" h={30} />
      </div>
      {/* meta row: date + views + likes chips */}
      <div className={s.wrapRow} style={{ margin: "16px 0 6px" }}>
        <Skeleton w={110} h={12} />
        <SkeletonPill w={64} h={24} />
        <SkeletonPill w={64} h={24} />
      </div>
      {/* 16/9 cover, radius 18 (.news-detail-media) */}
      <Skeleton w="100%" h="auto" r={18} style={{ aspectRatio: "16 / 9", margin: "18px 0 22px" }} />
      <SkeletonText lines={4} size={14} gap={12} />
      <div style={{ height: 18 }} />
      <SkeletonText lines={5} size={14} gap={12} lastWidth="40%" />
    </SkeletonShell>
  );
}

/* ------------------------------------------------------------ Notifications -- */

/** Mirrors <NotificationsPanel/>: 720px centered head, chips, divided rows. */
export function NotificationsSkeleton() {
  return (
    <SkeletonShell style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className={s.rowBetween} style={{ marginBottom: 16 }}>
        <Skeleton w={190} h={24} />
        <Skeleton w={110} h={13} />
      </div>
      <SkeletonFilters chips={2} w={96} h={30} style={{ marginBottom: 14 }} />
      <SkeletonCard pad="4px 16px">
        <div className={s.divided}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={s.listItem}>
              <Skeleton circle w={30} h={30} />
              <div className={s.grow}>
                <SkeletonText lines={2} size={12} gap={7} lastWidth="72%" />
              </div>
              <Skeleton w={54} h={10} style={{ flex: "none" }} />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonShell>
  );
}

/* -------------------------------------------------------------- Auth form -- */

/** Narrow centered auth column (login/register/reset/forgot/verify). */
export function AuthFormSkeleton({
  maxWidth = 440,
  tabs = false,
  fields = 2,
  note = true,
}: {
  maxWidth?: number;
  tabs?: boolean;
  fields?: number;
  note?: boolean;
}) {
  return (
    <SkeletonShell style={{ maxWidth, margin: "8px auto 0" }}>
      <SkeletonHeading eyebrow titleW={200} titleH={26} style={{ marginBottom: 20 }} />
      {tabs && <SkeletonFilters chips={2} w={130} h={40} style={{ marginBottom: 16 }} />}
      <SkeletonCard pad={22} r={16}>
        <SkeletonForm fields={fields} inputH={44} />
      </SkeletonCard>
      {note && <Skeleton w="70%" h={12} style={{ marginTop: 18 }} />}
    </SkeletonShell>
  );
}

/* -------------------------------------------------------------- Plan cards -- */

/** One pricing/subscription plan card (mirrors .plan-card geometry). */
export function SkeletonPlanCard({ benefits = 3 }: { benefits?: number }) {
  return (
    <SkeletonCard r={20} pad="32px 28px 28px">
      <div className={s.stack} style={{ gap: 12 }}>
        <Skeleton w={110} h={15} />
        <Skeleton w={140} h={30} />
        <Skeleton w={90} h={11} />
        <SkeletonText lines={2} size={12} lastWidth="70%" />
        <div className={s.stack} style={{ gap: 9, margin: "8px 0 4px" }}>
          {Array.from({ length: benefits }).map((_, i) => (
            <div key={i} className={s.row} style={{ gap: 9 }}>
              <Skeleton circle w={14} h={14} />
              <Skeleton w={`${72 - i * 8}%`} h={12} />
            </div>
          ))}
        </div>
        <SkeletonButton w="100%" h={44} r={12} style={{ marginTop: 8 }} />
      </div>
    </SkeletonCard>
  );
}

/** Three-up plan grid (collapses like .plans-grid). */
export function SkeletonPlansGrid({ benefits = 3 }: { benefits?: number }) {
  return (
    <SkeletonColumns cols={3} gap={20}>
      <SkeletonPlanCard benefits={benefits} />
      <SkeletonPlanCard benefits={benefits} />
      <SkeletonPlanCard benefits={benefits} />
    </SkeletonColumns>
  );
}

/* --------------------------------------------- FAQ accordion + contact ---- */

/** Accordion rows (FAQ pages). */
export function FaqSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className={s.stack} style={{ gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} r={12} pad="16px 18px">
          <div className={s.rowBetween}>
            <Skeleton w={`${58 + (i % 3) * 12}%`} h={14} />
            <Skeleton circle w={18} h={18} />
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

/** Contact page body: info card + map frame (mirrors .contact-equal). */
export function ContactSkeleton() {
  return (
    <div
      className={s.split}
      style={{ "--sk-left": "1fr", "--sk-right": "1.2fr", "--sk-gap": "20px", marginTop: 8 } as CSSProperties}
    >
      <SkeletonCard r={12} pad={20}>
        <div className={s.stack} style={{ gap: 12 }}>
          <Skeleton w={120} h={15} />
          <SkeletonText lines={2} size={12} lastWidth="80%" />
          <Skeleton w={100} h={15} style={{ marginTop: 8 }} />
          <Skeleton w="55%" h={12} />
          <Skeleton w="75%" h={11} style={{ marginTop: 10 }} />
        </div>
      </SkeletonCard>
      <Skeleton w="100%" h="auto" r={12} style={{ minHeight: 320 }} />
    </div>
  );
}
