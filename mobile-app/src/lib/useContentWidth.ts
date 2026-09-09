import { useWindowDimensions } from "react-native";

/**
 * THE CONTENT COLUMN, so a phone layout does not become a stretched one on a tablet.
 *
 * Every screen in this app was laid out for a 360–430pt phone. Run the same tree
 * on an iPad in portrait — 744pt on a Mini, 1024pt on a 12.9" — and nothing
 * OVERFLOWS, but everything stretches: a two-button row spreads until the
 * buttons are a hand's width apart, a text block runs to 90+ characters a line,
 * and a card that framed its content on a phone becomes a wide empty band with
 * a label floating at the left edge. That is what "does not fit properly" means
 * on a tablet — not clipping, but a layout asked to be a shape it was never
 * drawn for.
 *
 * The fix is one number applied in one place: cap the column and centre it. That
 * is what phone-first apps do on tablets, and it is why this is a shared hook
 * rather than a per-screen media query — 40 screens each guessing a breakpoint
 * is how a design system dies.
 *
 * WHY IT IS A GUTTER AND NOT A `maxWidth`. A `maxWidth` on the container would
 * clamp the box but leave its CHILDREN stretching inside it wherever a child
 * sets its own width, and it interacts badly with the flex rows this codebase
 * uses everywhere (mobile-app/CLAUDE.md: "rows are flex rows", `flex: 1` +
 * `minWidth: 0`). Extra horizontal PADDING narrows the space those rows lay out
 * in, so every existing `flex` and percentage keeps working unchanged and the
 * result is centred for free.
 *
 * ON A PHONE THIS RETURNS EXACTLY 0, so there is no behaviour change on the
 * device the app is actually tested on — the branch cannot alter a phone layout
 * even if the cap is later tuned.
 */

/**
 * The widest a text-and-form column may get before it stops being readable.
 * 560pt is a little over 70 characters at this app's body size, which is the
 * usual upper bound for comfortable reading, and it keeps a two-up button row
 * at roughly the proportions it has on a large phone.
 *
 * It deliberately does NOT vary by device class. An iPad Mini and a 12.9" Pro
 * get the same column and differently sized margins, which is what makes the
 * app look like one product across the range instead of four tuned variants.
 */
export const MAX_CONTENT_WIDTH = 560;

/**
 * Horizontal padding to ADD to a container's existing padding so its content
 * sits in a centred column no wider than `MAX_CONTENT_WIDTH`.
 *
 * Returns 0 on every phone. Rounded down to a whole point: a fractional padding
 * lands text on a half-pixel and softens it on some scale factors.
 */
export function useContentGutter(): number {
  const { width } = useWindowDimensions();
  if (!Number.isFinite(width) || width <= MAX_CONTENT_WIDTH) return 0;
  return Math.floor((width - MAX_CONTENT_WIDTH) / 2);
}

// A `useIsWideLayout()` boolean was written alongside the gutter and removed
// before it shipped: nothing imported it. It is noted here rather than left in
// place because an exported, documented, never-called hook reads as a supported
// part of the design and invites a second per-screen breakpoint — which is the
// drift the single shared gutter exists to prevent. If a genuine need appears
// (a grid choosing its column count is the plausible one), add it back THEN,
// keyed on `width > MAX_CONTENT_WIDTH` and never on `Platform.isPad`: an iPad in
// a narrow Split View slot is really phone-width, and a large Android tablet
// really is not.
