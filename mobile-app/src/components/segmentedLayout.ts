// Pure geometry for the sliding segmented indicator. No React and no
// react-native imports live here on purpose: the maths is the part that has to
// be right on every locale and every screen width, so it is unit-tested on its
// own (`__tests__/segmented-layout.test.ts`).
//
// Option boxes are MEASURED with onLayout, never derived from
// `trackWidth / options.length` — the Azerbaijani and Russian labels
// ("Həftəlik" / "Aylıq" / "İllik", "Еженедельно" / "Ежемесячно" / "Ежегодно")
// are nowhere near equally wide, so an equal-split indicator would sit under
// the wrong text. onLayout reports `x` relative to the TRACK's border box
// (Yoga folds the parent's padding into the child's x), which is why the
// indicator can be laid out at `left: 0` and simply translated by that x — no
// padding arithmetic to keep in sync with the style.

export type SegmentRect = { x: number; width: number };

/** Position of `value` inside `options`, or -1 when it is not in the set. */
export function segmentIndex<T extends string>(
  options: readonly { value: T }[],
  value: T,
): number {
  return options.findIndex((option) => option.value === value);
}

function isUsable(rect: SegmentRect | undefined): rect is SegmentRect {
  return (
    !!rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.width) &&
    rect.width > 0
  );
}

/**
 * Where the indicator belongs, or `null` when the selected option has not been
 * measured yet. The null case is what keeps the first render clean: the caller
 * leaves the indicator hidden instead of painting a zero-width chip at x=0 and
 * then flying it across the track once the first layout pass lands.
 */
export function indicatorRect(
  rects: readonly (SegmentRect | undefined)[],
  index: number,
): SegmentRect | null {
  if (!Number.isInteger(index) || index < 0 || index >= rects.length) return null;
  const rect = rects[index];
  return isUsable(rect) ? { x: rect.x, width: rect.width } : null;
}

/**
 * Sub-pixel tolerance for accepting a new measurement. Android reports
 * fractional dp that can wobble by hundredths between layout passes; committing
 * that to state would re-render — and re-animate — forever.
 */
export const LAYOUT_EPSILON = 0.5;

/** True when a fresh onLayout differs enough from the stored box to matter. */
export function layoutChanged(
  previous: SegmentRect | undefined,
  next: SegmentRect,
): boolean {
  if (!previous) return true;
  return (
    Math.abs(previous.x - next.x) >= LAYOUT_EPSILON ||
    Math.abs(previous.width - next.width) >= LAYOUT_EPSILON
  );
}
