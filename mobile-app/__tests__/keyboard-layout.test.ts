// Round 53 — the app-wide keyboard contract. The owner's report was "the
// keyboard covers the field and I cannot scroll far enough to see it", on a
// physical Android phone, on every form.
//
// These tests pin the geometry that replaced KeyboardAvoidingView +
// `keyboardVerticalOffset`. Numbers are a real 320x568 phone (the smallest
// supported width) with a 260pt keyboard, measured in WINDOW coordinates.
import {
  ACTION_BUTTON_ROOM,
  FIELD_MESSAGE_ROOM,
  FOCUS_EXTRA_OFFSET,
  FOCUS_TOP_GAP,
  chainLastAction,
  chainReturnKeyType,
  chainSubmitBehavior,
  focusScrollDelta,
  isLastField,
  keyboardOverlap,
  keyboardTopFromFrame,
  nextScrollOffset,
  scrollPaddingBottom,
  type Rect,
} from "@/components/keyboardLayout";

const WINDOW_H = 568;
const KEYBOARD_H = 260;
const KEYBOARD_TOP = WINDOW_H - KEYBOARD_H; // 308

/** Headerless screen (login, register): the body spans the whole window. */
const HEADERLESS: Rect = { top: 0, height: WINDOW_H };
/** Under a native-stack header (add-child, edit-child, both profiles). */
const HEADER_H = 64;
const UNDER_HEADER: Rect = { top: HEADER_H, height: WINDOW_H - HEADER_H };
/** Android `adjustResize` actually shrank the window: the body ends at the keyboard. */
const ANDROID_RESIZED: Rect = { top: 0, height: KEYBOARD_TOP };

describe("keyboardTopFromFrame", () => {
  it("takes a normal soft-keyboard frame at face value", () => {
    expect(
      keyboardTopFromFrame({ screenY: KEYBOARD_TOP, height: KEYBOARD_H, windowHeight: WINDOW_H }),
    ).toBe(KEYBOARD_TOP);
  });

  it("reads a zero-height frame as closed (Android + hardware keyboard)", () => {
    expect(keyboardTopFromFrame({ screenY: WINDOW_H, height: 0, windowHeight: WINDOW_H })).toBeNull();
  });

  it("reads a frame parked at/below the window bottom as closed", () => {
    // `keyboardWillChangeFrame` fires on dismissal with the frame at the bottom.
    expect(
      keyboardTopFromFrame({ screenY: WINDOW_H, height: KEYBOARD_H, windowHeight: WINDOW_H }),
    ).toBeNull();
    expect(
      keyboardTopFromFrame({ screenY: WINDOW_H + 40, height: KEYBOARD_H, windowHeight: WINDOW_H }),
    ).toBeNull();
  });

  it("rejects missing/garbage metrics instead of padding for a phantom keyboard", () => {
    expect(keyboardTopFromFrame({ screenY: undefined, height: 260, windowHeight: WINDOW_H })).toBeNull();
    expect(keyboardTopFromFrame({ screenY: NaN, height: 260, windowHeight: WINDOW_H })).toBeNull();
    expect(keyboardTopFromFrame({ screenY: 0, height: 260, windowHeight: WINDOW_H })).toBeNull();
    expect(keyboardTopFromFrame({ screenY: 308, height: null, windowHeight: WINDOW_H })).toBeNull();
  });
});

describe("keyboardOverlap", () => {
  it("is the keyboard height on a headerless screen", () => {
    expect(keyboardOverlap({ container: HEADERLESS, keyboardTop: KEYBOARD_TOP })).toBe(KEYBOARD_H);
  });

  it("REGRESSION: is STILL the keyboard height under a navigator header", () => {
    // This is the whole point of measuring instead of using
    // `keyboardVerticalOffset`. KeyboardAvoidingView's parent-relative frame
    // maths would have produced KEYBOARD_H - HEADER_H = 196 here and left the
    // field 64pt under the keyboard — the owner's exact symptom on the
    // header-bearing forms (add-child, edit-child, both profiles).
    expect(keyboardOverlap({ container: UNDER_HEADER, keyboardTop: KEYBOARD_TOP })).toBe(KEYBOARD_H);
    expect(keyboardOverlap({ container: UNDER_HEADER, keyboardTop: KEYBOARD_TOP })).not.toBe(
      KEYBOARD_H - HEADER_H,
    );
  });

  it("is ZERO when the platform already resized the window (Android adjustResize)", () => {
    // Without this, Android would get padded twice and the form would end up
    // with a keyboard-sized hole under it.
    expect(keyboardOverlap({ container: ANDROID_RESIZED, keyboardTop: KEYBOARD_TOP })).toBe(0);
  });

  it("is ZERO when the keyboard is closed, whatever the container", () => {
    for (const container of [HEADERLESS, UNDER_HEADER, ANDROID_RESIZED]) {
      expect(keyboardOverlap({ container, keyboardTop: null })).toBe(0);
    }
  });

  it("never goes negative for a container that ends above the keyboard", () => {
    // e.g. a short body sitting above a bottom tab bar.
    expect(keyboardOverlap({ container: { top: 0, height: 200 }, keyboardTop: KEYBOARD_TOP })).toBe(0);
  });
});

describe("scrollPaddingBottom", () => {
  const BASE = 16 + 34; // spacing.lg + a home-indicator bottom inset

  it("PROOF (no permanent empty space): a closed keyboard returns the base padding EXACTLY", () => {
    expect(scrollPaddingBottom(BASE, 0)).toBe(BASE);
    expect(scrollPaddingBottom(BASE, keyboardOverlap({ container: HEADERLESS, keyboardTop: null }))).toBe(
      BASE,
    );
  });

  it("adds exactly the overlap while the keyboard is open", () => {
    expect(scrollPaddingBottom(BASE, KEYBOARD_H)).toBe(BASE + KEYBOARD_H);
  });

  it("clamps a negative overlap so a bad measurement can never shrink the layout", () => {
    expect(scrollPaddingBottom(BASE, -120)).toBe(BASE);
  });
});

describe("focus clearance constants", () => {
  it("reserves room for BOTH the validation message and the action button", () => {
    expect(FOCUS_EXTRA_OFFSET).toBe(FIELD_MESSAGE_ROOM + ACTION_BUTTON_ROOM);
    // Button.tsx pins `minHeight: 48`; the reserve must still cover it.
    expect(ACTION_BUTTON_ROOM).toBeGreaterThanOrEqual(48);
    // One line of inline error text under the input (TextField renders it there).
    expect(FIELD_MESSAGE_ROOM).toBeGreaterThanOrEqual(20);
  });

  it("covers the REAL chain under the last field of a Card-grouped form", () => {
    // login / register / both profiles put the shared validation line and the
    // CTA next to the field inside a Card, so what actually sits below the
    // measured field wrapper is:
    //   card gap + error line(s) + card gap + Button(48)
    // The az string for `auth.child.err.idFormat` wraps to two lines in the
    // 256pt-wide card of a 320pt screen, which is the worst realistic case.
    const CARD_GAP = 16; // spacing.lg
    const LINE = 20;
    const BUTTON = 48;
    const oneLine = CARD_GAP + LINE + CARD_GAP + BUTTON; // 100
    const twoLines = CARD_GAP + 2 * LINE + CARD_GAP + BUTTON; // 120
    expect(FOCUS_EXTRA_OFFSET).toBeGreaterThanOrEqual(oneLine);
    expect(FOCUS_EXTRA_OFFSET).toBeGreaterThanOrEqual(twoLines);
  });

  it("still FITS the smallest supported screen under a header", () => {
    // 320x568 under a native-stack header, keyboard up: the usable band is
    // 568 - 64 - 260 = 244. A field wrapper (label 20 + gap 4 + input 48 = 72)
    // plus the top gap plus the full reserve has to fit inside it, or every
    // focus would degrade to "park at the top".
    const band = KEYBOARD_TOP - HEADER_H;
    const wrapper = 20 + 4 + 48;
    expect(FOCUS_TOP_GAP + wrapper + FOCUS_EXTRA_OFFSET).toBeLessThanOrEqual(band);
  });
});

describe("focusScrollDelta", () => {
  const open = { container: UNDER_HEADER, keyboardTop: KEYBOARD_TOP, extraBelow: FOCUS_EXTRA_OFFSET };
  // What the primitives report is the field WRAPPER — label + input + inline
  // error — not the bare input box, so an error already on screen is inside
  // this height instead of being estimated.
  const FIELD_H = 48;
  const WRAPPER_H = 20 + 4 + FIELD_H; // label + spacing.xs + input

  it("leaves a field that already clears the keyboard alone", () => {
    // Nothing to do => no jarring scroll on focusing the first field of a form.
    expect(focusScrollDelta({ ...open, field: { top: 100, height: FIELD_H } })).toBe(0);
  });

  it("scrolls a low field up until its message AND the action button clear the keyboard", () => {
    const field = { top: 260, height: FIELD_H };
    const delta = focusScrollDelta({ ...open, field });
    expect(delta).toBe(120);
    // After the scroll, field bottom + the reserved room lands exactly on the
    // keyboard's top edge — not the input's own box, the whole cluster.
    expect(field.top - delta + field.height + FOCUS_EXTRA_OFFSET).toBe(KEYBOARD_TOP);
  });

  it("handles a field far down a long form (register, child info, edit child)", () => {
    const field = { top: 520, height: FIELD_H };
    const delta = focusScrollDelta({ ...open, field });
    expect(delta).toBe(380);
    expect(field.top - delta + field.height + FOCUS_EXTRA_OFFSET).toBe(KEYBOARD_TOP);
  });

  it("REGRESSION: the CTA under a Card-grouped field clears the keyboard", () => {
    // The owner's exact requirement, walked end to end on a 320x568 phone under
    // a header. Password wrapper low in the form; below it inside the Card:
    // gap 16 + a two-line az error (40) + gap 16 + Button 48.
    const wrapper = { top: 300, height: WRAPPER_H };
    const delta = focusScrollDelta({ ...open, field: wrapper });
    const wrapperBottom = wrapper.top - delta + wrapper.height;
    const ctaBottom = wrapperBottom + 16 + 40 + 16 + 48;
    expect(ctaBottom).toBeLessThanOrEqual(KEYBOARD_TOP);
    // ...and the field itself stayed on screen while that happened.
    expect(wrapper.top - delta).toBeGreaterThanOrEqual(UNDER_HEADER.top);
  });

  it("REGRESSION: re-running after a validation message GROWS the form scrolls again", () => {
    // `onContentSizeChange` re-reveals the focused field when the form grows
    // under it — tapping submit with the keyboard up (persistTaps="handled")
    // renders the inline error and everything below shifts down. Because the
    // primitives report the WRAPPER, that growth shows up as a taller measured
    // rect, and the first pass had parked the old cluster exactly on the
    // keyboard edge, so a second pass must move again rather than return 0.
    const first = { top: 260, height: FIELD_H };
    const delta1 = focusScrollDelta({ ...open, field: first });
    const MESSAGE = 4 + 20 + 12; // spacing.xs + one line + the shift below it
    const grown = { top: first.top - delta1, height: FIELD_H + MESSAGE };
    const delta2 = focusScrollDelta({ ...open, field: grown });
    expect(delta2).toBeGreaterThan(0);
    expect(grown.top - delta2 + grown.height + FOCUS_EXTRA_OFFSET).toBe(KEYBOARD_TOP);
  });

  it("never scrolls the focused field off the TOP: it parks it below the container edge", () => {
    // Tall keyboard / short viewport: the full clearance does not fit, so the
    // best possible placement is the field at the top of what is visible.
    const tight = { container: UNDER_HEADER, keyboardTop: 200, extraBelow: FOCUS_EXTRA_OFFSET };
    const field = { top: 150, height: FIELD_H };
    const delta = focusScrollDelta({ ...tight, field });
    expect(delta).toBe(62);
    expect(field.top - delta).toBe(UNDER_HEADER.top + FOCUS_TOP_GAP);
  });

  it("keeps FOCUS_TOP_GAP so the field never touches the container's top edge", () => {
    // On a headerless screen (login, register) the container's top edge is the
    // window's, i.e. behind the status bar.
    const field = { top: 400, height: FIELD_H };
    const delta = focusScrollDelta({
      container: UNDER_HEADER,
      keyboardTop: 180,
      extraBelow: FOCUS_EXTRA_OFFSET,
      field,
    });
    expect(field.top - delta).toBeGreaterThanOrEqual(UNDER_HEADER.top + FOCUS_TOP_GAP);
  });

  it("pulls a field that sits ABOVE the viewport back down (backwards focus chaining)", () => {
    const delta = focusScrollDelta({ ...open, field: { top: 70, height: FIELD_H } });
    expect(delta).toBe(-18); // negative = scroll up
    expect(70 - delta).toBe(UNDER_HEADER.top + FOCUS_TOP_GAP);
  });

  it("still brings the action button into view with NO keyboard (hardware keyboard)", () => {
    const delta = focusScrollDelta({
      container: UNDER_HEADER,
      keyboardTop: null,
      extraBelow: FOCUS_EXTRA_OFFSET,
      field: { top: 460, height: FIELD_H },
    });
    expect(delta).toBe(60);
  });

  it("does nothing when the keyboard leaves no usable viewport", () => {
    expect(
      focusScrollDelta({
        container: UNDER_HEADER,
        keyboardTop: HEADER_H - 10,
        extraBelow: FOCUS_EXTRA_OFFSET,
        field: { top: 100, height: FIELD_H },
      }),
    ).toBe(0);
  });

  it("does nothing on a degenerate measurement instead of scrolling to nowhere", () => {
    expect(
      focusScrollDelta({ ...open, container: { top: 0, height: 0 }, field: { top: 100, height: 48 } }),
    ).toBe(0);
    expect(focusScrollDelta({ ...open, field: { top: NaN, height: 48 } })).toBe(0);
  });

  it("works identically on a headerless screen — the header is never a parameter", () => {
    const headerless = focusScrollDelta({
      container: HEADERLESS,
      keyboardTop: KEYBOARD_TOP,
      extraBelow: FOCUS_EXTRA_OFFSET,
      field: { top: 260, height: FIELD_H },
    });
    expect(headerless).toBe(focusScrollDelta({ ...open, field: { top: 260, height: FIELD_H } }));
  });
});

describe("nextScrollOffset", () => {
  it("adds the delta to the live offset", () => {
    expect(nextScrollOffset(120, 88)).toBe(208);
  });

  it("never produces a negative offset (a ScrollView would just clamp anyway)", () => {
    expect(nextScrollOffset(100, -260)).toBe(0);
  });
});

describe("focus chain", () => {
  it("marks only the final field of a run", () => {
    expect(isLastField(0, 2)).toBe(false);
    expect(isLastField(1, 2)).toBe(true);
    expect(isLastField(0, 1)).toBe(true); // a one-field run is all last
  });

  it("never claims a last field in an empty run", () => {
    expect(isLastField(0, 0)).toBe(false);
    expect(isLastField(-1, 0)).toBe(false);
  });

  it("labels the return key Next until the end of the run, then Done", () => {
    // login (id/e-mail -> password), profile password (new -> confirm).
    expect(chainReturnKeyType(0, 2)).toBe("next");
    expect(chainReturnKeyType(1, 2)).toBe("done");
    // register: first -> last -> e-mail -> phone -> password.
    expect([0, 1, 2, 3, 4].map((i) => chainReturnKeyType(i, 5))).toEqual([
      "next",
      "next",
      "next",
      "next",
      "done",
    ]);
  });

  it("keeps the keyboard up mid-run and closes it on the last field", () => {
    // "submit" fires onSubmitEditing WITHOUT blurring, so moving focus to the
    // next field does not flash the keyboard shut and open again.
    expect(chainSubmitBehavior(0, 2)).toBe("submit");
    expect(chainSubmitBehavior(1, 2)).toBe("blurAndSubmit");
  });

  it("INVARIANT: a run with no submit handler dismisses — it never invents a submit", () => {
    // add-child, edit-child and both profiles have a summary card / avatar
    // picker / a second form between the last field and the CTA.
    expect(chainLastAction(false)).toBe("dismiss");
    expect(chainLastAction(true)).toBe("submit");
  });
});
