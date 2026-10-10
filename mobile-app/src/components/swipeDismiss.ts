// Pure release rule behind components/SwipeDownSheet (same split as
// actionAreaLayout.ts beside ActionArea: the component keeps the RN wiring, the
// numbers live here so they are testable without rendering anything).

/** Height of the draggable strip at the top of a sheet card (touch target). */
export const HANDLE_STRIP = 44;
/** A release past this many points (or SWIPE_FRACTION of the card) dismisses. */
export const SWIPE_DISTANCE = 120;
export const SWIPE_FRACTION = 0.3;
/** A downward flick faster than this (points/ms) dismisses regardless of distance. */
export const SWIPE_VELOCITY = 1.0;

/**
 * Whether a drag released at `dy` points down, moving at `vy` points/ms, should
 * dismiss a card `sheetHeight` points tall. A short card needs a proportionally
 * short pull (30% of itself); a tall one never needs more than SWIPE_DISTANCE.
 * An upward or zero drag never dismisses, however fast.
 */
export function shouldDismissOnRelease(dy: number, vy: number, sheetHeight: number): boolean {
  if (dy <= 0) return false;
  if (vy > SWIPE_VELOCITY) return true;
  const fraction = sheetHeight > 0 ? sheetHeight * SWIPE_FRACTION : SWIPE_DISTANCE;
  return dy > Math.min(SWIPE_DISTANCE, fraction);
}
