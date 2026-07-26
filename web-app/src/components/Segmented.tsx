"use client";

/**
 * SLIDING SEGMENTED CONTROLS — one shared mechanism for every segmented / tab /
 * period-switcher control in the web app (owner: "the Weekly/Monthly/Yearly
 * switcher jumps between states, it must SLIDE").
 *
 * How it works
 * ------------
 * The moving pill is a single `::before` pseudo-element on the CONTAINER (see
 * the "SLIDING SEGMENTED CONTROLS" block in globals.css). It sits behind the
 * labels (`z-index: 0` vs `z-index: 1`), is `pointer-events: none`, and its
 * geometry comes from four CSS custom properties written by this component:
 *
 *     --seg-x  --seg-y  --seg-w  --seg-h
 *
 * so the CSS owns the LOOK (fill, radius, border, shadow, easing) and this
 * component only owns the COORDINATES. No animation library, no per-control
 * bespoke code — a control opts in just by rendering through <Segmented>.
 *
 * Why measurement instead of `nth-child` maths: the options have different
 * label widths in all three locales (az/en/ru) and several controls wrap onto
 * two lines on a phone. Measuring the real active element handles both, so the
 * indicator can never be stranded in the wrong place. When the active option
 * moves to a DIFFERENT LINE the move is applied instantly (no diagonal slide
 * across the control); movement inside one line slides.
 *
 * Progressive enhancement: the server renders `data-seg="idle"`, which paints
 * the control exactly as it looks today with a zero-width (invisible) pill.
 * Only once a real measurement exists does the container flip to
 * `data-seg="on"`, at which point the CSS hands the active highlight over to
 * the sliding pill. `data-seg="off"` (no active option) keeps the plain look.
 *
 * Reduced motion is handled in CSS (`prefers-reduced-motion: reduce` drops the
 * transition entirely — the pill still lands in the right place, it just does
 * not travel).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

// Avoid React's "useLayoutEffect does nothing on the server" SSR warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * What counts as "the selected option". Every control in this codebase marks
 * its current option with at least one of these, so no markup had to change:
 *   .active                     — the house convention (chips, tabs, nav links)
 *   .is-on                      — the pricing configurator's radio segments
 *   [aria-selected="true"]      — real ARIA tablists
 *   [aria-current] (not false)  — <Link>-based navigation tabs
 *   [data-active="true"]        — escape hatch for future controls
 */
const ACTIVE_SELECTOR = [
  ".active",
  ".is-on",
  '[aria-selected="true"]',
  '[data-active="true"]',
  '[aria-current]:not([aria-current="false"])',
].join(",");

type Rect = { x: number; y: number; w: number; h: number };

export type SegmentedProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  /** Rendered element. `nav` for link-based tab rows, `div` otherwise. */
  as?: "div" | "nav";
  /** `pill` (default) fills the option; `underline` draws a bar under it. */
  variant?: "pill" | "underline";
  /**
   * Adds the shared `.seg-track` skin: the container becomes the rounded
   * "rail" and the options go flat, so the pill is never occluded by an
   * option's own background while it travels. Controls that already own a
   * rail (`.pcfg-seg`, `.ana-seg`, `.poly-seg`, `.billing-tabs`,
   * `.arena-tabs`) leave this off.
   */
  track?: boolean;
  /**
   * ARIA tablist keyboard support: ←/→/Home/End move focus between the
   * `[role="tab"]` options. Focus only — activation stays on Enter/Space, so
   * no existing behaviour changes.
   */
  arrowKeys?: boolean;
  children?: ReactNode;
};

export function Segmented({
  as = "div",
  variant,
  track = false,
  arrowKeys = false,
  className,
  children,
  onKeyDown,
  ...rest
}: SegmentedProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Last written geometry, so repeat measurements do not touch the DOM.
  const lastRef = useRef<Rect | null>(null);
  const rafRef = useRef(0);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // Direct children only: `.active` also appears on nested marks/badges
    // (e.g. `.bkids-tab.active .bkids-mark`), which must never be measured.
    let active: HTMLElement | null = null;
    for (const node of Array.from(el.children)) {
      if (node instanceof HTMLElement && node.matches(ACTIVE_SELECTOR)) {
        active = node;
        break;
      }
    }

    const box = active?.getBoundingClientRect();
    // No selection, or the control is not laid out yet (hidden drawer, tab
    // panel, `display: none`): fall back to the plain look and re-enter
    // without a slide once it becomes visible again.
    if (!active || !box || (box.width === 0 && box.height === 0)) {
      lastRef.current = null;
      el.setAttribute("data-seg", "off");
      return;
    }

    const host = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // The pill is absolutely positioned against the container's PADDING box and
    // scrolls with its content (`.billing-tabs` is horizontally scrollable), so
    // strip the border and add the scroll offset back in.
    const next: Rect = {
      x: box.left - host.left - (parseFloat(cs.borderLeftWidth) || 0) + el.scrollLeft,
      y: box.top - host.top - (parseFloat(cs.borderTopWidth) || 0) + el.scrollTop,
      w: box.width,
      h: box.height,
    };

    const prev = lastRef.current;
    const unchanged =
      prev !== null &&
      Math.abs(prev.x - next.x) < 0.5 &&
      Math.abs(prev.y - next.y) < 0.5 &&
      Math.abs(prev.w - next.w) < 0.5 &&
      Math.abs(prev.h - next.h) < 0.5;

    if (!unchanged) {
      // Jump (never slide) on the first measurement, when the control comes
      // back from a hidden/unselected state, and when the selection moves to
      // another LINE of a wrapped control — a diagonal fly-across reads as a
      // glitch. `--seg-dur: 0s` + a forced reflow suppresses the transition
      // for exactly that one commit.
      const jump = prev === null || Math.abs(prev.y - next.y) > 0.5;
      if (jump) el.style.setProperty("--seg-dur", "0s");
      el.style.setProperty("--seg-x", `${next.x}px`);
      el.style.setProperty("--seg-y", `${next.y}px`);
      el.style.setProperty("--seg-w", `${next.w}px`);
      el.style.setProperty("--seg-h", `${next.h}px`);
      el.setAttribute("data-seg", "on");
      if (jump) {
        void el.offsetWidth; // flush the un-transitioned frame
        el.style.removeProperty("--seg-dur");
      }
      lastRef.current = next;
      return;
    }

    el.setAttribute("data-seg", "on");
  }, []);

  // Re-measure after every render: React re-renders whenever the selection
  // changes, including the server round-trip behind <Link>-based tab rows.
  useIsoLayoutEffect(measure);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const schedule = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    // Container resize covers viewport changes and re-wrapping.
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(el);

    // Selection changes that bypass a re-render of this wrapper, plus options
    // being added/removed. `style`/`data-seg` are deliberately NOT observed, so
    // our own writes can never feed back into this observer.
    const mo = new MutationObserver(schedule);
    mo.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-selected", "aria-current", "data-active"],
    });

    // Web-font swap changes label widths without resizing the container.
    let cancelled = false;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(() => {
      if (!cancelled) schedule();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      ro?.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    onKeyDown?.(event);
    if (!arrowKeys || event.defaultPrevented) return;
    const { key } = event;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") {
      return;
    }
    const el = ref.current;
    if (!el) return;
    const tabs = Array.from(
      el.querySelectorAll<HTMLElement>('[role="tab"]'),
    ).filter(
      (tab) =>
        !(tab as HTMLButtonElement).disabled &&
        tab.getAttribute("aria-disabled") !== "true",
    );
    if (tabs.length < 2) return;
    const current = tabs.indexOf(document.activeElement as HTMLElement);
    if (current < 0) return;

    const rtl = getComputedStyle(el).direction === "rtl";
    let next = current;
    if (key === "Home") next = 0;
    else if (key === "End") next = tabs.length - 1;
    else {
      const forward = key === (rtl ? "ArrowLeft" : "ArrowRight");
      next = (current + (forward ? 1 : -1) + tabs.length) % tabs.length;
    }
    if (next === current) return;
    event.preventDefault();
    tabs[next].focus();
  }

  const props = {
    ...rest,
    ref: (node: HTMLElement | null) => {
      ref.current = node;
    },
    className: track ? `${className ?? ""} seg-track`.trim() : className,
    "data-seg": "idle",
    "data-seg-variant": variant,
    onKeyDown: handleKeyDown,
  } as const;

  return as === "nav" ? <nav {...props}>{children}</nav> : <div {...props}>{children}</div>;
}
