// Pure geometry + focus-chain rules behind the keyboard contract (same split as
// listRowLayout.ts / segmentedLayout.ts beside their components: the hook keeps
// the RN wiring, the maths lives here so it is testable and cannot drift).
//
// WHY MEASURED GEOMETRY INSTEAD OF `keyboardVerticalOffset`
// --------------------------------------------------------
// KeyboardAvoidingView computes `bottom = frame.y + frame.height - keyboardY`
// from an onLayout frame that is PARENT-relative, while the keyboard frame is
// absolute. Under a navigator header that under-shifts by exactly the header
// height, which is why `keyboardVerticalOffset` exists at all — it is a manual
// correction for a number the container already knows. Everything here works in
// WINDOW coordinates instead (`measureInWindow` on both the scroll container and
// the focused field), so headers, tab bars, safe-area insets, Android
// `adjustResize` and Android edge-to-edge (no resize) all fall out of the same
// arithmetic with no per-screen constant to get wrong:
//
//   * Android resized the window  -> container bottom == keyboard top -> overlap 0
//   * Android did NOT resize      -> overlap == keyboard height
//   * iOS under a header          -> overlap == keyboard height (container bottom
//                                     is the window bottom either way)
//
// The overlap is then added to the scroll content's bottom padding. Growing the
// CONTENT (rather than shrinking the container, which is what a `padding`
// KeyboardAvoidingView does) keeps the full scroll range, so the action button
// under the last field can always be scrolled into view.

import { spacing } from "@/theme/tokens";

/** A window-space vertical band: `top` is the window Y of the upper edge. */
export type Rect = { top: number; height: number };

// ---- room reserved below a focused field ----------------------------------
// A focused field must clear the keyboard together with the things the owner
// named: its own validation message AND the screen's main action button.
//
// WHAT IS MEASURED, AND WHAT IS RESERVED
// --------------------------------------
// The input primitives report their WRAPPER View (label + input + inline
// error), not the bare TextInput, so a validation message that is ALREADY on
// screen is inside the measured rect at its real rendered height — including
// an az/ru string that wrapped to two lines. These constants only have to
// cover what is NOT measured:
//
//   * a validation message that has not appeared yet, and the message rendered
//     as a SIBLING of the field rather than inside it — which is the shape on
//     login, register and both profiles (a Card with `gap: spacing.lg`, one
//     shared error line under the last field). Two lines, because az/ru wrap
//     inside a 320pt-wide screen's card;
//   * the primary action button plus the gap above it.
//
// Deliberately generous: over-reserving degrades into "park the field at the
// top of the visible band", which is the best placement available anyway
// (`focusScrollDelta` clamps to the headroom). Under-reserving hides the
// button — the exact bug the owner reported.

/** Gap + up to two wrapped lines of validation text rendered beside the field. */
export const FIELD_MESSAGE_ROOM = spacing.lg + 2 * 20;
/** Gap + the primary <Button> min height (Button.tsx `minHeight: 48`). */
export const ACTION_BUTTON_ROOM = spacing.lg + 48;
/** Default clearance requested below a focused field. */
export const FOCUS_EXTRA_OFFSET = FIELD_MESSAGE_ROOM + ACTION_BUTTON_ROOM;
/**
 * Clearance kept ABOVE a focused field. The measured rect starts at the field's
 * label, so this is breathing room rather than a correction — but it also keeps
 * the field off the container's very top edge, which on a headerless screen
 * (login, register) sits behind the status bar.
 */
export const FOCUS_TOP_GAP = spacing.xl;

/**
 * Turn a reported keyboard frame into a window-space "top of the keyboard" Y,
 * or `null` when there is effectively no keyboard covering the window.
 *
 * Defensive on purpose: Android reports a zero-height frame for a hardware
 * keyboard, and `keyboardWillChangeFrame` fires on dismissal with the frame
 * parked at the bottom of the screen. Both must read as "closed" or every
 * consumer would pad for a keyboard that is not there.
 */
export function keyboardTopFromFrame(input: {
  screenY: number | null | undefined;
  height: number | null | undefined;
  windowHeight: number;
}): number | null {
  const { screenY, height, windowHeight } = input;
  if (typeof screenY !== "number" || !Number.isFinite(screenY)) return null;
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return null;
  if (screenY <= 0) return null;
  if (Number.isFinite(windowHeight) && windowHeight > 0 && screenY >= windowHeight) return null;
  return screenY;
}

/**
 * How much of a container the keyboard covers, in points. Zero whenever the
 * keyboard is closed OR the platform already resized the window out from under
 * it — which is what guarantees "no permanent empty space when it closes".
 */
export function keyboardOverlap(input: {
  container: Rect;
  keyboardTop: number | null;
}): number {
  const { container, keyboardTop } = input;
  if (keyboardTop == null) return 0;
  if (!Number.isFinite(container.top) || !Number.isFinite(container.height)) return 0;
  return Math.max(0, container.top + container.height - keyboardTop);
}

/**
 * Bottom padding for a scroll container's content: the padding the screen would
 * have had, plus the live keyboard overlap. `overlap === 0` returns the base
 * value unchanged — byte-identical to the pre-keyboard layout.
 */
export function scrollPaddingBottom(basePadding: number, overlap: number): number {
  return basePadding + Math.max(0, overlap);
}

/**
 * How far to scroll (points, positive = content moves up) so a focused field
 * clears the keyboard with `extraBelow` room for its validation message and the
 * action button. Returns 0 when the field is already comfortably placed.
 *
 * Never scrolls so far that the field's own top leaves the viewport: when the
 * requested clearance does not fit, the field is parked at the top instead,
 * which is the most of the form-below that can possibly be shown.
 */
export function focusScrollDelta(input: {
  /** Focused input box, window coordinates. */
  field: Rect;
  /** Scroll viewport, window coordinates. */
  container: Rect;
  /** Window Y of the keyboard top, or null when it is closed. */
  keyboardTop: number | null;
  extraBelow: number;
  topGap?: number;
}): number {
  const { field, container, keyboardTop, extraBelow } = input;
  const topGap = input.topGap ?? FOCUS_TOP_GAP;

  if (!Number.isFinite(field.top) || !Number.isFinite(field.height)) return 0;
  if (!Number.isFinite(container.top) || container.height <= 0) return 0;

  const visibleTop = container.top;
  const visibleBottom =
    keyboardTop == null
      ? container.top + container.height
      : Math.min(container.top + container.height, keyboardTop);
  // Keyboard taller than the container (tiny landscape phone): nothing usable is
  // visible, so any scroll would be a guess. Leave the content where it is.
  if (visibleBottom <= visibleTop) return 0;

  // Field sits above the viewport (chained focus moving backwards, or a field
  // scrolled off the top): pull the content back down.
  if (field.top < visibleTop + topGap) return field.top - visibleTop - topGap;

  const overflow = field.top + field.height + Math.max(0, extraBelow) - visibleBottom;
  if (overflow <= 0) return 0;

  const headroom = field.top - visibleTop - topGap; // >= 0 given the branch above
  return Math.min(overflow, headroom);
}

/** Apply a delta to the current scroll offset; a ScrollView never goes negative. */
export function nextScrollOffset(current: number, delta: number): number {
  return Math.max(0, current + delta);
}

// ---- focus chain ("Next" -> "Next" -> "Done") ------------------------------
// A chain covers ONE contiguous run of text inputs. Runs are declared per form,
// never per screen: a form whose text inputs are split by selects, a summary
// card or a second form must declare a separate run for each side, or "Next"
// would silently skip required fields / cross into another submit handler.

/** What the return key on the LAST field of a run does. */
export type FieldChainLast =
  /** Fire the screen's EXISTING submit handler (auth screens). */
  | "submit"
  /** Just close the keyboard (forms with content between the field and the CTA). */
  | "dismiss";

/**
 * A run only submits when the screen actually handed us its EXISTING submit
 * handler. With no handler the return key just closes the keyboard — a chain
 * must never invent a submit that the screen did not ask for.
 */
export function chainLastAction(hasSubmitHandler: boolean): FieldChainLast {
  return hasSubmitHandler ? "submit" : "dismiss";
}

export function isLastField(index: number, count: number): boolean {
  return count > 0 && index === count - 1;
}

export function chainReturnKeyType(index: number, count: number): "next" | "done" {
  return isLastField(index, count) ? "done" : "next";
}

/**
 * `submit` keeps the keyboard up while `onSubmitEditing` moves focus to the next
 * field (no open/close flicker mid-form); `blurAndSubmit` closes it on the last
 * field, whether that field submits or merely dismisses.
 *
 * Uses RN 0.81's `submitBehavior`, not the deprecated `blurOnSubmit`.
 */
export function chainSubmitBehavior(
  index: number,
  count: number,
): "submit" | "blurAndSubmit" {
  return isLastField(index, count) ? "blurAndSubmit" : "submit";
}
