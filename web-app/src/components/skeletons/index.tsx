// =============================================================================
// Centralized skeleton primitives (route-level loading.tsx building blocks).
//
// Pure presentational server components — no text, no i18n, no client JS.
// Every shape is aria-hidden; wrap a page's skeleton in <SkeletonShell> which
// exposes a single role="status" landmark (no label — skeletons are language-
// neutral by design). Colors come exclusively from existing theme tokens via
// the CSS Module fallback chains, so the same primitives render correctly in
// the public/parent shells (light + dark) AND inside the student `.arena`
// scope (all palettes).
// =============================================================================
import type { CSSProperties, ReactNode } from "react";
import styles from "./skeletons.module.css";

type Size = number | string;

const px = (v: Size | undefined): string | undefined =>
  v === undefined ? undefined : typeof v === "number" ? `${v}px` : v;

const cx = (...parts: Array<string | false | undefined>): string =>
  parts.filter(Boolean).join(" ");

/* ---------------------------------------------------------------- Shell -- */

export function SkeletonShell({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className} style={style}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- Skeleton -- */

export type SkeletonProps = {
  /** width (px number or any CSS length) — defaults to 100% */
  w?: Size;
  /** height (px number or any CSS length) — defaults to 14px */
  h?: Size;
  /** border radius (px number or any CSS length) — defaults to 8px */
  r?: Size;
  /** render as a circle (ignores r; w doubles as the diameter) */
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Base shimmer block. */
export function Skeleton({ w = "100%", h = 14, r, circle, className, style }: SkeletonProps) {
  const s: CSSProperties = {
    width: px(circle ? (w === "100%" ? h : w) : w),
    height: px(h),
    ...(r !== undefined && !circle ? { borderRadius: px(r) } : null),
    ...style,
  };
  return (
    <span
      aria-hidden="true"
      className={cx(styles.bone, circle && styles.circle, className)}
      style={s}
    />
  );
}

/** Round avatar / icon mark. */
export function SkeletonAvatar({ size = 40, style }: { size?: number; style?: CSSProperties }) {
  return <Skeleton circle w={size} h={size} style={style} />;
}

/** Button-shaped block. */
export function SkeletonButton({
  w = 128,
  h = 38,
  r = 10,
  style,
}: {
  w?: Size;
  h?: Size;
  r?: Size;
  style?: CSSProperties;
}) {
  return <Skeleton w={w} h={h} r={r} style={style} />;
}

/** Pill / chip shape (filters, tabs, badges). */
export function SkeletonPill({
  w = 84,
  h = 30,
  style,
}: {
  w?: Size;
  h?: Size;
  style?: CSSProperties;
}) {
  return <Skeleton w={w} h={h} r={999} style={style} />;
}

/* ----------------------------------------------------------------- Text -- */

const LINE_WIDTHS = ["100%", "94%", "82%", "97%", "88%"] as const;

/** Paragraph of shimmer lines; the last line is intentionally shorter. */
export function SkeletonText({
  lines = 3,
  size = 13,
  gap = 9,
  width = "100%",
  lastWidth = "62%",
  style,
}: {
  lines?: number;
  /** line height in px */
  size?: number;
  gap?: number;
  width?: Size;
  lastWidth?: Size;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={styles.stack}
      style={{ gap, width: px(width), ...style }}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          h={size}
          w={i === lines - 1 && lines > 1 ? lastWidth : LINE_WIDTHS[i % LINE_WIDTHS.length]}
        />
      ))}
    </span>
  );
}

/** Page heading block: optional eyebrow, title bar, optional subtitle line. */
export function SkeletonHeading({
  eyebrow = false,
  titleW = 260,
  titleH = 28,
  sub = false,
  subW = 380,
  style,
}: {
  eyebrow?: boolean;
  titleW?: Size;
  titleH?: number;
  sub?: boolean;
  subW?: Size;
  style?: CSSProperties;
}) {
  return (
    <div className={styles.stack} style={{ gap: 10, ...style }}>
      {eyebrow && <Skeleton w={110} h={11} />}
      <Skeleton w={titleW} h={titleH} style={{ maxWidth: "100%" }} />
      {sub && <Skeleton w={subW} h={13} style={{ maxWidth: "90%" }} />}
    </div>
  );
}

/* ----------------------------------------------------------------- Card -- */

/** Bordered surface shell that mirrors the app's card/panel look. */
export function SkeletonCard({
  r = 14,
  pad = 18,
  className,
  style,
  children,
}: {
  r?: Size;
  pad?: Size | string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cx(styles.panel, className)}
      style={{ borderRadius: px(r), padding: px(pad as Size), ...style }}
    >
      {children}
    </div>
  );
}

/** Full-width banner/carousel placeholder. */
export function SkeletonBanner({
  h = 150,
  r = 14,
  style,
}: {
  h?: Size;
  r?: Size;
  style?: CSSProperties;
}) {
  return (
    <SkeletonCard r={r} pad={0} style={style}>
      <div className={styles.stack} style={{ alignItems: "center", gap: 12, padding: 24, minHeight: px(h), justifyContent: "center" }}>
        <Skeleton w={220} h={18} />
        <Skeleton w="min(460px, 80%)" h={13} />
        <Skeleton w="min(320px, 60%)" h={13} />
      </div>
    </SkeletonCard>
  );
}

/* ---------------------------------------------------------------- Stats -- */

/** Responsive grid of stat/KPI cards (value bar + label bar). */
export function SkeletonStatGrid({
  items = 4,
  min = 200,
  gap = 18,
  valueH = 26,
  style,
}: {
  items?: number;
  /** minmax() minimum in px — mirror the real grid's minmax */
  min?: number;
  gap?: number;
  valueH?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={styles.autoGrid}
      style={{ "--sk-min": `${min}px`, "--sk-gap": `${gap}px`, ...style } as CSSProperties}
    >
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonCard key={i} pad="20px 22px">
          <div className={styles.stack} style={{ gap: 8 }}>
            <Skeleton w={72} h={valueH} />
            <Skeleton w="70%" h={12} />
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- List -- */

/** One list row: leading mark, text lines, trailing block. */
export function SkeletonListItem({
  icon = true,
  iconSize = 38,
  lines = 2,
  trailing = true,
  trailingW = 64,
  trailingH = 28,
  style,
}: {
  icon?: boolean;
  iconSize?: number;
  lines?: number;
  trailing?: boolean;
  trailingW?: Size;
  trailingH?: Size;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden="true" className={styles.listItem} style={style}>
      {icon && <Skeleton circle w={iconSize} h={iconSize} />}
      <div className={styles.grow}>
        <SkeletonText lines={lines} size={12} gap={7} lastWidth="45%" />
      </div>
      {trailing && <Skeleton w={trailingW} h={trailingH} r={9} style={{ flex: "none" }} />}
    </div>
  );
}

/** Panel of divided list rows (news feed, recent rounds, notifications…). */
export function SkeletonList({
  rows = 5,
  icon = true,
  trailing = true,
  pad = "6px 18px",
  style,
}: {
  rows?: number;
  icon?: boolean;
  trailing?: boolean;
  pad?: string;
  style?: CSSProperties;
}) {
  return (
    <SkeletonCard pad={pad} style={style}>
      <div className={styles.divided}>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonListItem key={i} icon={icon} trailing={trailing} />
        ))}
      </div>
    </SkeletonCard>
  );
}

/* ---------------------------------------------------------------- Table -- */

/** Table placeholder: header row + data rows inside a panel. */
export function SkeletonTable({
  rows = 8,
  cols = 4,
  style,
}: {
  rows?: number;
  cols?: number;
  style?: CSSProperties;
}) {
  const template = `repeat(${cols}, 1fr)`;
  return (
    <SkeletonCard pad={18} style={style}>
      <div className={styles.tableWrap}>
        <div className={styles.tableGrid}>
          <div
            className={styles.tableRow}
            style={{ "--sk-tcols": template } as CSSProperties}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} w="60%" h={10} />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className={styles.tableRow}
              style={{ "--sk-tcols": template } as CSSProperties}
            >
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} w={c === 0 ? "80%" : "65%"} h={13} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </SkeletonCard>
  );
}

/* -------------------------------------------------------------- Filters -- */

/** Row of filter chips / segmented controls. */
export function SkeletonFilters({
  chips = 4,
  w = 88,
  h = 32,
  style,
}: {
  chips?: number;
  w?: Size;
  h?: Size;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden="true" className={styles.wrapRow} style={style}>
      {Array.from({ length: chips }).map((_, i) => (
        <SkeletonPill key={i} w={w} h={h} />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- Form -- */

/** Label + input pairs, optionally followed by a submit button. */
export function SkeletonForm({
  fields = 3,
  submit = true,
  inputH = 42,
  style,
}: {
  fields?: number;
  submit?: boolean;
  inputH?: number;
  style?: CSSProperties;
}) {
  return (
    <div aria-hidden="true" className={styles.stack} style={{ gap: 16, ...style }}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className={styles.stack} style={{ gap: 7 }}>
          <Skeleton w={120} h={11} />
          <Skeleton w="100%" h={inputH} r={10} />
        </div>
      ))}
      {submit && <SkeletonButton w={160} h={42} style={{ marginTop: 4 }} />}
    </div>
  );
}

/* ------------------------------------------------- Layout helper exports -- */

/** Fixed-column grid that collapses 3→2→1 like .plans-grid / .poly-grid. */
export function SkeletonColumns({
  cols = 3,
  gap = 18,
  style,
  children,
}: {
  cols?: number;
  gap?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={styles.colsGrid}
      style={{ "--sk-cols": cols, "--sk-gap": `${gap}px`, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** Two-pane split (stacks under 860px). */
export function SkeletonSplit({
  left = "1.2fr",
  right = "1fr",
  gap = 18,
  style,
  children,
}: {
  left?: string;
  right?: string;
  gap?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={styles.split}
      style={
        { "--sk-left": left, "--sk-right": right, "--sk-gap": `${gap}px`, ...style } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

/** Responsive auto-fill grid — mirror a page's minmax() with `min`. */
export function SkeletonAutoGrid({
  min = 260,
  gap = 18,
  style,
  children,
}: {
  min?: number;
  gap?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={styles.autoGrid}
      style={{ "--sk-min": `${min}px`, "--sk-gap": `${gap}px`, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}

export { styles as skeletonStyles };
