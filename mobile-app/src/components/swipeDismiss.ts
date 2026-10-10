// Pure geometry and release rules behind components/SwipeDownSheet (same split
// as actionAreaLayout.ts beside ActionArea: the component keeps the RN wiring,
// the numbers live here so they are testable without rendering anything).
//
// THE TWO DETENTS (owner, 2026-10-10). A sheet opens at most COLLAPSED_FRACTION
// of the window tall — it used to grow until its grab line sat under the camera
// cutout. A sheet whose content is taller than that can be dragged UP to the
// full detent, whose top edge is the top safe-area inset and never above it.
// A sheet shorter than the collapsed cap keeps its natural height and only
// moves down.
//
// Positions are measured in one axis, "extra": how many points the card's
// height cap stands ABOVE the collapsed cap. 0 is the collapsed detent,
// `maxExtra` the full one, and a NEGATIVE value is the card pushed below its
// collapsed rest, on its way out.
import type { AppTokens } from "@/theme/tokens";

/** Height of the draggable strip at the top of a sheet card (touch target). */
export const HANDLE_STRIP = 44;
/** The grab line itself: wide and thick enough to read as a control. */
export const HANDLE_WIDTH = 48;
export const HANDLE_THICKNESS = 5;
/** A release past this many points (or SWIPE_FRACTION of the card) dismisses. */
export const SWIPE_DISTANCE = 120;
export const SWIPE_FRACTION = 0.3;
/** A flick faster than this (points/ms) decides the direction on its own. */
export const SWIPE_VELOCITY = 1.0;
/** The collapsed detent: a sheet never OPENS taller than this share of the window. */
export const COLLAPSED_FRACTION = 0.8;

export type SheetDetent = "collapsed" | "expanded";
export type ReleaseOutcome = SheetDetent | "dismiss";

/**
 * The two height caps for a window `windowHeight` tall whose top `topGuard`
 * points (the status bar / camera cutout, or a larger caller margin) the card
 * must never enter. The collapsed cap can never exceed the full one — on a
 * short landscape window the two meet and there is nothing to expand into.
 */
export function sheetDetents(
  windowHeight: number,
  topGuard: number,
): { collapsed: number; full: number } {
  const full = Math.max(0, Math.round(windowHeight - Math.max(0, topGuard)));
  const collapsed = Math.min(Math.round(windowHeight * COLLAPSED_FRACTION), full);
  return { collapsed, full };
}

/**
 * Where a drag that started at `start` (in extra-space) and has moved `dy`
 * points (positive = down) puts the card: `extra` is the height-cap growth,
 * clamped to [0, maxExtra] — a sheet cannot be pulled above its full detent,
 * and a short sheet (`maxExtra` 0) cannot be pulled up at all — and `drop` is
 * the translateY past the collapsed rest.
 */
export function dragPosition(
  start: number,
  dy: number,
  maxExtra: number,
): { extra: number; drop: number } {
  const raw = start - dy;
  const ceiling = Math.max(0, maxExtra);
  return { extra: Math.min(Math.max(raw, 0), ceiling), drop: Math.max(0, -raw) };
}

/**
 * Whether a card `sheetHeight` tall, pushed `dy` points below its collapsed
 * rest and released at `vy` points/ms, should close. A short card needs a
 * proportionally short pull (30% of itself); a tall one never needs more than
 * SWIPE_DISTANCE. An upward or zero drag never dismisses, however fast.
 */
export function shouldDismissOnRelease(dy: number, vy: number, sheetHeight: number): boolean {
  if (dy <= 0) return false;
  if (vy > SWIPE_VELOCITY) return true;
  const fraction = sheetHeight > 0 ? sheetHeight * SWIPE_FRACTION : SWIPE_DISTANCE;
  return dy > Math.min(SWIPE_DISTANCE, fraction);
}

/**
 * Where a released drag goes.
 *
 *   * A FLICK decides direction by itself. Down: from the full detent it drops
 *     one detent to collapsed; from collapsed — or once the card is already
 *     below collapsed — it closes. Up: to the full detent if there is one.
 *   * Otherwise BELOW the collapsed rest, the dismiss distance rule applies
 *     (shouldDismissOnRelease, measured against the collapsed card) and a short
 *     pull springs back to collapsed.
 *   * Otherwise BETWEEN the detents, the nearest one wins.
 */
export function releaseOutcome({
  start,
  dy,
  vy,
  maxExtra,
  restHeight,
}: {
  /** Position at grant, in extra-space (0 collapsed, maxExtra full). */
  start: number;
  /** Total vertical movement, positive = down. */
  dy: number;
  /** Release velocity, points/ms, positive = down. */
  vy: number;
  /** Extra-space position of the full detent; 0 for a sheet that cannot expand. */
  maxExtra: number;
  /** The card's height at its collapsed rest — the dismiss rule's yardstick. */
  restHeight: number;
}): ReleaseOutcome {
  const ceiling = Math.max(0, maxExtra);
  const pos = start - dy;
  if (vy > SWIPE_VELOCITY && dy > 0) {
    return start > 0 && pos >= 0 ? "collapsed" : "dismiss";
  }
  if (vy < -SWIPE_VELOCITY && dy < 0) {
    return ceiling > 0 ? "expanded" : "collapsed";
  }
  if (pos < 0) {
    return shouldDismissOnRelease(-pos, 0, restHeight) ? "dismiss" : "collapsed";
  }
  return ceiling > 0 && pos > ceiling / 2 ? "expanded" : "collapsed";
}

/**
 * The grab line's colour. NOT `border`: that token is a hairline tuned to be
 * barely there (1.2:1 on the light surface, 1.31:1 on the dark one), which is
 * exactly why owners could not see the handle. `muted` is the quietest ink that
 * still reads as a control on the sheet surface in both themes (3.19:1 light,
 * 5.92:1 dark — pinned by __tests__/swipe-to-dismiss.test.ts).
 */
export function sheetHandleColor(tokens: Pick<AppTokens, "muted">): string {
  return tokens.muted;
}
