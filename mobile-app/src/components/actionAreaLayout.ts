// Pure geometry behind the ACTION-AREA contract (same split as
// keyboardLayout.ts / listRowLayout.ts / segmentedLayout.ts beside their
// components: the component keeps the RN wiring, the maths lives here so it is
// testable and cannot drift between the four containers that consume it).
//
// THE BUG THIS EXISTS FOR
// -----------------------
// Testers on small phones reported that the "I've read and understood the
// rules" tick and the Start button under it — the last things on the test setup
// page and the last things in the daily-exam dialog — sat "at the bottom of the
// screen where they can't touch it". Two mechanisms, one shape:
//
//   * A SCREEN put its primary action at the very END of a ~900pt scroll. On a
//     320x568 phone, or on any phone with the OS font scale raised, that is
//     several screenfuls down; the action is reachable only by scrolling past
//     every rule, and it is the control the user is looking for FIRST.
//
//   * A DIALOG clamped itself with `maxHeight: "85%"` of the whole window and
//     never measured a single safe-area inset. A transparent RN Modal is its own
//     native window and, under the edge-to-edge windows Android now enforces,
//     that window spans the entire screen INCLUDING the strip behind the gesture
//     pill / three-button bar — the same mechanism the Ranking subject picker
//     was fixed for. 85% of the window, centred, leaves 7.5% of the window under
//     the card; on a 640pt-tall phone that is 48pt, which is exactly a
//     three-button navigation bar. And the control that ENABLES the primary
//     action (the consent tick) lived inside the dialog's inner ScrollView while
//     the button lived outside it, so on a short screen the tick scrolled out of
//     sight and the button stayed visible and permanently inert. "They can't
//     touch it somehow", literally.
//
// THE RULE, and it is one rule: an action area is a NON-SCROLLING region that
// the container lays out as a sibling BELOW its scrolling body. The body is
// `flex: 1` and yields the space; the action area is `flexShrink: 0` and cannot
// be squeezed out. Nothing can ever be hidden behind it because it never
// overlays anything — the reservation is structural, not a padding somebody has
// to remember. Everything the area needs to clear (the home indicator, the
// Android gesture bar, the keyboard) is MEASURED and arrives here as a number;
// there is no constant in this file that stands in for a device.

import { spacing } from "@/theme/tokens";

/** Non-finite / negative inputs read as zero — a measurement that has not
 *  landed yet must never become negative padding. */
function px(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/**
 * Bottom padding for an action area pinned to the window edge.
 *
 * The keyboard and the system bar are an EITHER/OR, never a sum: when the
 * keyboard is up it COVERS the navigation bar the padding would otherwise be
 * clearing, so adding the two parks the bar a whole bar-height above the
 * keyboard with a dead band under it. `keyboardInset` is 0 whenever the
 * keyboard is closed (or the platform already resized the window), so the
 * resting value is exactly the safe-area inset and nothing else.
 */
export function actionAreaBottomPadding(
  insetBottom: number,
  keyboardInset: number = 0,
): number {
  const kb = px(keyboardInset);
  return kb > 0 ? kb : px(insetBottom);
}

/**
 * Horizontal padding for an action area: the screen's own gutter, plus the
 * landscape/notch inset, plus the shared tablet content gutter so the bar's
 * buttons line up with the column above them instead of spanning a 1024pt iPad.
 */
export function actionAreaSidePadding(
  base: number,
  insetSide: number,
  gutter: number = 0,
): number {
  return px(base) + px(insetSide) + px(gutter);
}

/**
 * What a scroll body should still add at the bottom when it has an action area
 * below it.
 *
 * The safe-area inset belongs to whichever element actually touches the window
 * edge. With an action area that is the ACTION AREA, so the body must drop it
 * or the two double-count and the last row of content floats a navigation
 * bar's height above the bar. Without one the body keeps it, exactly as before.
 */
export function scrollBodyBottomInset(insetBottom: number, hasActionArea: boolean): number {
  return hasActionArea ? 0 : px(insetBottom);
}

/**
 * Padding for a dialog's BACKDROP, per side.
 *
 * A transparent Modal's window spans the whole screen, system bars included, so
 * the backdrop is the only thing that can hold a centred dialog out of them.
 * Adding the inset to the base gutter (rather than taking the larger of the
 * two) is deliberate: the base is the visual margin the dialog is drawn with,
 * and the inset is uninhabitable space — a dialog that merely reaches the top
 * of the gesture bar still looks like it is falling off the screen.
 */
export function dialogEdgePadding(base: number, inset: number): number {
  return px(base) + px(inset);
}

/** The action area's own vertical rhythm — one token, so the four containers
 *  cannot each pick a different one. */
export const ACTION_AREA_PADDING_TOP = spacing.md;
/** Gap between the base gutter and the window edge on the sides. */
export const ACTION_AREA_PADDING_SIDE = spacing.lg;
/** Breathing room under the action row before the safe-area inset starts. */
export const ACTION_AREA_PADDING_BOTTOM = spacing.md;

/**
 * THE ACTION AREA'S OWN CEILING, as a share of the window height.
 *
 * The contract above makes the bar unshrinkable so the body can never push it
 * off the screen — but unshrinkable cuts both ways. An action area is content
 * sized with `flexShrink: 0`, so if the CONTENT of the bar is tall enough the
 * bar itself exceeds the window and its last row — the primary button — is
 * below the bottom edge, which is the exact bug this whole contract exists to
 * prevent, reintroduced from the other side.
 *
 * It is reachable on a real device, not a thought experiment. The daily-round
 * gate's bar is a two-line consent tick + a warning line + an error line + a
 * button; AppText caps at `maxFontSizeMultiplier` 1.3, and Azerbaijani and
 * Russian both run longer than the English these lines were measured in. At
 * 1.3x on a 320x568 phone that stack is most of the window.
 *
 * So the bar gets a ceiling and starts scrolling inside it. Half the window is
 * the number: it is generous enough that no bar in the app reaches it at 1x
 * (nothing changes on any device today), and it still guarantees the body above
 * keeps half the screen, which is what stops a "reachable" action area from
 * eating the question it belongs to.
 */
export const ACTION_AREA_MAX_SHARE = 0.5;

/**
 * The pixel ceiling for the bar's CONTENT, or `undefined` for "do not cap".
 *
 * IT IS THE CONTENT'S CEILING, NOT THE BAR'S. The bar's padding is what lifts
 * it over the keyboard and the gesture strip; capping the padded box would let
 * a 300pt keyboard inset consume the whole allowance and leave the buttons zero
 * height — the bar would vanish exactly when a form needs it. So the ceiling
 * belongs to the scrolling region inside the padding.
 *
 * AND IT IS MEASURED AGAINST THE SPACE THE BAR REALLY HAS. On iOS the window
 * does not resize for the keyboard, so with one open the inhabitable height is
 * the window MINUS the overlap the bar is already lifting itself over; half of
 * the full window would be half of a screen that is not there. `keyboardInset`
 * is 0 whenever the keyboard is closed (or the platform resized the window
 * itself), so the resting value is exactly half the window.
 *
 * Undefined rather than 0 when a measurement has not landed: a 0 ceiling
 * collapses the bar and hides every button in it — strictly worse than the
 * overflow it guards against. An uncapped bar on the first frame is the safe
 * direction to fail in.
 */
export function actionAreaMaxHeight(
  windowHeight: number | null | undefined,
  keyboardInset: number = 0,
): number | undefined {
  const available = px(windowHeight) - px(keyboardInset);
  if (available <= 0) return undefined;
  // Whole points: a fractional max-height lands the hairline on a half pixel.
  return Math.floor(available * ACTION_AREA_MAX_SHARE);
}
