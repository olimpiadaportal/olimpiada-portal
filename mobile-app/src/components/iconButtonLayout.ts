// GEOMETRY EVERY ICON-ONLY BUTTON SHARES.
//
// WHY ONE MODULE AND NOT FOUR LOCAL STYLE OBJECTS. The four header controls —
// the back chevron on the left, and the home glyph, the bell and the account
// avatar on the right — are four components that never appear together in one
// file, so nothing kept them in step and they drifted: a 44pt box beside three
// 34pt ones, a glyph pinned to the left edge of its box beside three centred
// ones, and one of the four drawing a chip background of its own. That drift
// is what the owner reported from a TestFlight build as "the icons inside the
// header buttons are not centred".
//
// WHY THE BOX SIZE MATTERS AS MUCH AS THE CENTRING. Since iOS 26 the system
// draws its OWN rounded container behind a navigation-bar button, sized to the
// view we hand it — nothing in this repository draws the circle that appears
// around the back chevron on an iOS screenshot. Two header buttons of
// different sizes therefore get two containers of different sizes, and a
// button that draws a chip of its own ends up as a chip inside a container.
// Neither is fixable from inside our own view; one box for all four is.
//
// WHY 34 AND NOT A 44pt BOX. The student tab header already carries the streak
// chip, the bell and the avatar on a 320pt screen with a centred title between
// them; a 44pt box each would take 20pt from that title for nothing a user can
// see. The TOUCH target is met with hitSlop instead, which is invisible and
// costs the layout nothing — `touchSpan` is that arithmetic, and the unit test
// checks it against MIN_TOUCH_TARGET rather than trusting the numbers here.
import { Platform, type ViewStyle } from "react-native";

/**
 * A glyph in a FIXED-SIZE box is centred by the box.
 *
 * Symmetric padding also centres a glyph — right up until the glyph, its
 * stroke weight or the icon set changes and nobody adjusts the padding, at
 * which point it is off by a pixel or two with nothing in the file saying it
 * was ever meant to be centred. These two flex properties say it outright and
 * survive any glyph put inside them.
 */
export function iconButtonBox(size: number): ViewStyle {
  return {
    width: size,
    height: size,
    alignItems: "center",
    justifyContent: "center",
  };
}

/** The box every header button draws itself into (back, home, bell, avatar). */
export const HEADER_BUTTON_SIZE = 34;

/** Invisible touch margin around that box — see `touchSpan` below. */
export const HEADER_BUTTON_HIT_SLOP = 8;

/** That box as a style, ready to sit at the head of a Pressable style array. */
export const headerButtonBox: ViewStyle = iconButtonBox(HEADER_BUTTON_SIZE);

/** Glyph size inside it — the house and the bell, which fill their 24-grid. */
export const HEADER_GLYPH_SIZE = 22;

/**
 * The back glyph is LARGER on purpose, and it is the one exception here.
 * Lucide draws a chevron as 6 units of ink across a 24-unit grid where a house
 * or a bell covers 18, so at an equal nominal size the back arrow reads as the
 * faintest thing in the bar. iOS also expects a large HIG chevron and Android
 * the platform's own 24dp arrow. This is optical WEIGHT; the glyph's POSITION
 * is not nudged anywhere (components/BackButton.tsx says why not).
 */
export const HEADER_BACK_GLYPH_SIZE = Platform.OS === "ios" ? 26 : 24;

/**
 * The larger of the two platform minimums (iOS HIG 44pt, Material 48dp), so a
 * single number satisfies both and no caller has to pick one.
 */
export const MIN_TOUCH_TARGET = 48;

/** What a box of `size` with `hitSlop` around it actually accepts touches in. */
export function touchSpan(size: number, hitSlop: number): number {
  return size + hitSlop * 2;
}
