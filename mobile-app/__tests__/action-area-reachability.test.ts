// A SCREEN'S PRIMARY ACTION HAS TO BE REACHABLE ON THE SMALLEST PHONE WE SHIP TO.
//
// REPORTED BY THE OWNER, from testers on small devices: "the 'read the rules'
// button that we have in some places in exams and before entering exams or
// tests ... those buttons were on the bottom of the screen where they can't
// touch it somehow."
//
// There were two mechanisms behind that one sentence, and they share a shape:
//
//   * THE SETUP PAGE put the consent tick and Start at the very END of a ~900pt
//     scroll. On a 320x568 phone that is three screenfuls down — more with the
//     OS font scale raised — and it lands in the last screenful, where the
//     Android gesture strip is.
//
//   * THE DIALOGS clamped themselves at `maxHeight: "85%"` of the WHOLE window
//     and measured no safe-area inset at all. A transparent RN Modal is its own
//     native window and, under Android's edge-to-edge windows, that window
//     covers the navigation bar too (the mechanism select-sheet-insets.test.ts
//     documents for the picker sheets). 85% centred leaves 7.5% of the window
//     below the card — exactly a 48pt three-button bar on a 640pt phone. Worse,
//     the rules gate kept the CONSENT TICK inside its inner ScrollView while
//     the Start button sat outside: on a short screen the tick scrolled away
//     and a visible, permanently disabled button stayed behind with nothing to
//     explain it. And ConfirmModal — the runner's submit/cancel/leave dialog —
//     had no clamp and no scroll at all, so a long az/ru message simply pushed
//     its buttons off the bottom of the window.
//
// THE SAME DEFECT CLASS KEPT TURNING UP, so the list is longer than those two:
//
//   * THE EXAM RUNNER — the surface the owner's report names FIRST ("in
//     exams") — kept Geri / İrəli / Təsdiqlə as an ordinary child at the end of
//     the question scroll. A long question body, or a raised font scale, put
//     SUBMIT below the fold and the student could not finish the attempt.
//
//   * THE ACCOUNT-DELETION SHEET had a flat 24pt bottom padding, no inset, no
//     clamp and no scroll: its buttons sat behind Android's three-button bar,
//     and at 1.3x its ~180-character confirmation grew the card until they left
//     the window. On the most destructive action in the app.
//
//   * THE BOOT SCREENS (maintenance / force update) centre an ADMIN-SUPPLIED
//     message of unbounded length above the only control that exists — the
//     navigator is not mounted, so there is no back and no tab. A long enough
//     message written in the admin panel stranded the user.
//
//   * AND THE CONTRACT ITSELF HAD THE BUG IN IT. `flexShrink: 0` says the body
//     cannot squeeze the bar; nothing in that said the bar cannot outgrow the
//     WINDOW. A bar carrying a wrapped consent line, a warning and an error
//     above its button, at the 1.3x scale AppText allows, pushed its own
//     primary button off the bottom edge. The bar is now capped at a share of
//     the measured window and scrolls inside it.
//
// THE FIX IS ONE SHARED CONTRACT, and this file is what stops it eroding:
// an action area is a NON-SCROLLING sibling BELOW a flexible body. The body is
// `flex: 1` and yields; the area is `flexShrink: 0` and cannot be squeezed.
// The reservation is therefore structural — there is no height constant for a
// future edit to get wrong, which is the specific regression pinned below.
//
// Source assertions on purpose: the containers are .tsx, this suite is .ts-only
// (package.json testMatch), and the failure mode is a DELETION — a container
// that quietly stops consuming the insets, or a fifth body that never adopted
// the contract, looks completely normal in a diff.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACTION_AREA_MAX_SHARE,
  actionAreaBottomPadding,
  actionAreaMaxHeight,
  actionAreaSidePadding,
  dialogEdgePadding,
  scrollBodyBottomInset,
} from "@/components/actionAreaLayout";
import { spacing } from "@/theme/tokens";

const SRC = resolve(__dirname, "..", "src");

/** Source with comments blanked: prose ABOUT insets must never satisfy a test
 *  that the code applies them. The `[^:]` guard keeps `https://` intact. */
function code(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf8")
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The text of a JSX prop's expression — `actions={ ... }` — found by counting
 * braces rather than by regex, so a prop containing objects, arrow functions
 * and nested JSX comes back whole. Returns "" when the prop is absent.
 */
function propValue(source: string, prop: string): string {
  const open = source.indexOf(prop + "={");
  if (open === -1) return "";
  let depth = 0;
  const start = open + prop.length + 1;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

/**
 * The balanced `( ... )` body of a `const <name> = (` declaration.
 *
 * Needed because a screen whose action area is more than two buttons declares
 * it as a local before handing it over — `actions={actions}` — and the
 * assertion below is POSITIONAL: it has to see what is actually in that region
 * rather than accept the name of it.
 */
function constBody(source: string, name: string): string {
  const decl = "const " + name + " = (";
  const at = source.indexOf(decl);
  if (at === -1) return "";
  const start = at + decl.length - 1;
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

/**
 * The source of ONE component in a multi-component file: from its `function
 * <name>` to the next top-level `export function`.
 *
 * Needed because a file like features/boot/screens.tsx holds five screens and a
 * shell, all of which have an `actions` prop; asserting on the file as a whole
 * would let the force-update CTA be pinned by the UNKNOWN-ROLE screen's bar.
 */
function section(source: string, name: string): string {
  const at = source.indexOf("function " + name);
  if (at === -1) return "";
  const next = source.indexOf("\nexport function ", at + 1);
  return next === -1 ? source.slice(at) : source.slice(at, next);
}

/**
 * The balanced `{ ... }` that FOLLOWS a marker — a callback handed to a
 * subscription or an interval, the object literal of a `const`.
 *
 * The engine assertions below need it because a guarantee like "the leave
 * dialog opens before anything navigates away" lives INSIDE a handler, and a
 * test that only checks the handler is subscribed asserts nothing about what it
 * does. Returns "" when the marker is absent, so a renamed handler fails the
 * assertion rather than silently passing an empty string to `toContain`
 * (`"".toContain(x)` is false for every non-empty x).
 */
function blockAfter(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at === -1) return "";
  const start = source.indexOf("{", at);
  if (start === -1) return "";
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

/** The action region's real contents: the prop's expression, or — when the
 *  prop is a bare identifier — the local that identifier names. */
function actionRegion(source: string): string {
  const prop = propValue(source, "actions");
  const alias = /^\{\s*([A-Za-z_$][\w$]*)\s*\}$/.exec(prop.trim());
  return alias ? constBody(source, alias[1]) : prop;
}

// ---------------------------------------------------------------------------
// The pure geometry
// ---------------------------------------------------------------------------

describe("actionAreaBottomPadding", () => {
  it("is the safe-area inset while the keyboard is closed", () => {
    // The resting case, and the whole point: the bar ends above the home
    // indicator / gesture pill / three-button bar, whatever that device has.
    expect(actionAreaBottomPadding(48, 0)).toBe(48);
    expect(actionAreaBottomPadding(34, 0)).toBe(34);
    expect(actionAreaBottomPadding(0, 0)).toBe(0);
  });

  it("is the keyboard overlap INSTEAD OF the inset, never their sum", () => {
    // An open keyboard COVERS the system bar the inset would be clearing.
    // Adding them parks the bar a whole bar-height above the keyboard with a
    // dead band under it — which reads as a layout bug, not as room.
    expect(actionAreaBottomPadding(48, 300)).toBe(300);
    expect(actionAreaBottomPadding(48, 300)).not.toBe(348);
  });

  it("never returns a negative or a NaN padding from an unlanded measurement", () => {
    // measureInWindow can report before layout; a negative padding throws on
    // Android and silently reorders the layout on iOS.
    expect(actionAreaBottomPadding(-10, 0)).toBe(0);
    expect(actionAreaBottomPadding(Number.NaN, Number.NaN)).toBe(0);
    expect(actionAreaBottomPadding(48, Number.POSITIVE_INFINITY)).toBe(48);
  });
});

describe("scrollBodyBottomInset", () => {
  it("hands the safe-area inset to whichever element touches the window edge", () => {
    // With an action area the BAR touches the edge, so the body must drop the
    // inset; without one the body still owns it, exactly as before this change.
    expect(scrollBodyBottomInset(48, true)).toBe(0);
    expect(scrollBodyBottomInset(48, false)).toBe(48);
  });

  it("cannot double-count: body + bar is one inset, never two", () => {
    const inset = 48;
    const total = scrollBodyBottomInset(inset, true) + actionAreaBottomPadding(inset, 0);
    expect(total).toBe(inset);
  });
});

describe("actionAreaSidePadding", () => {
  it("adds the landscape/notch inset and the shared tablet gutter to the gutter", () => {
    expect(actionAreaSidePadding(spacing.lg, 0, 0)).toBe(spacing.lg);
    expect(actionAreaSidePadding(spacing.lg, 44, 0)).toBe(spacing.lg + 44);
    // On a 1024pt iPad the gutter keeps the buttons in the same centred column
    // as the content above them instead of spanning the whole slab.
    expect(actionAreaSidePadding(spacing.lg, 0, 232)).toBe(spacing.lg + 232);
  });
});

describe("dialogEdgePadding", () => {
  it("adds the inset to the visual margin rather than taking the larger", () => {
    // A dialog whose edge merely REACHES the top of the gesture bar still reads
    // as falling off the screen; the margin is what makes it look placed.
    expect(dialogEdgePadding(spacing.xl, 48)).toBe(spacing.xl + 48);
    expect(dialogEdgePadding(spacing.xl, 0)).toBe(spacing.xl);
  });
});

describe("actionAreaMaxHeight", () => {
  it("is a share of the window, so the body always keeps the rest of it", () => {
    expect(actionAreaMaxHeight(640)).toBe(320);
    expect(actionAreaMaxHeight(568)).toBe(284);
    // Whole points: a fractional ceiling lands the hairline on a half pixel.
    expect(Number.isInteger(actionAreaMaxHeight(667) as number)).toBe(true);
  });

  it("leaves the body at least as much room as the bar", () => {
    // The reachability guarantee cuts both ways: an action area allowed to grow
    // without limit is reachable and useless, because the question it belongs
    // to is off the screen instead.
    expect(ACTION_AREA_MAX_SHARE).toBeLessThanOrEqual(0.5);
    expect(ACTION_AREA_MAX_SHARE).toBeGreaterThan(0);
  });

  it("measures against the space the bar HAS, not the window it is drawn in", () => {
    // On iOS the window does not resize for the keyboard: the bar lifts itself
    // over the overlap instead. Half of the whole window would then be half of
    // a screen that is not there — and since the ceiling governs the bar's
    // CONTENT, a bar whose padding is already 300pt would be allowed 320 more
    // and stand taller than the phone.
    expect(actionAreaMaxHeight(640, 300)).toBe(170);
    // Closed keyboard (and Android, which resizes the window itself) is the
    // resting case, and it is exactly half the window again.
    expect(actionAreaMaxHeight(640, 0)).toBe(actionAreaMaxHeight(640));
  });

  it("does NOT cap at all until the window has been measured", () => {
    // undefined, never 0. A 0 ceiling collapses the bar and hides every button
    // in it — strictly worse than the overflow it guards against, and it would
    // happen on the first frame of every screen.
    expect(actionAreaMaxHeight(0)).toBeUndefined();
    expect(actionAreaMaxHeight(Number.NaN)).toBeUndefined();
    expect(actionAreaMaxHeight(-640)).toBeUndefined();
    expect(actionAreaMaxHeight(null)).toBeUndefined();
    // Same rule for a nonsense keyboard measurement: no cap beats a zero one.
    expect(actionAreaMaxHeight(640, 640)).toBeUndefined();
    expect(actionAreaMaxHeight(640, Number.POSITIVE_INFINITY)).toBe(320);
  });
});

// ---------------------------------------------------------------------------
// Geometry on the phone class the report came from
// ---------------------------------------------------------------------------

describe("a dialog on a 360x640 phone with a three-button navigation bar", () => {
  const WINDOW_H = 640;
  const NAV_BAR = 48;
  const STATUS = 24;

  it("shows why `maxHeight: 85%` of the WINDOW was the bug", () => {
    // The old clamp, centred inside a full-window backdrop: 7.5% of the window
    // is left under the card on each side. On this device that is the
    // navigation bar to the pixel, so the card's lower edge sat ON it.
    const card = WINDOW_H * 0.85;
    const belowCard = (WINDOW_H - card) / 2;
    expect(Math.round(belowCard)).toBe(NAV_BAR);
  });

  it("the padded backdrop cannot put a dialog in that strip at any height", () => {
    // The clamp is now the backdrop's own content box, and the backdrop starts
    // ABOVE the navigation bar — so the largest possible card still ends
    // `spacing.xl` clear of it, and it is the flex shrink (not a percentage)
    // that decides how tall the card actually is.
    const padBottom = dialogEdgePadding(spacing.xl, NAV_BAR);
    const padTop = dialogEdgePadding(spacing.xl, STATUS);
    const tallestCard = WINDOW_H - padTop - padBottom;
    expect(padBottom).toBeGreaterThanOrEqual(NAV_BAR + spacing.xl);
    expect(tallestCard).toBeGreaterThan(0);
  });

  it("a screen's action bar clears the same strip", () => {
    expect(actionAreaBottomPadding(NAV_BAR, 0)).toBe(NAV_BAR);
  });

  it("and at a 1.3x font scale the bar is clamped instead of eating the screen", () => {
    // The daily-round gate's bar: a consent tick that wraps to three lines, a
    // selection warning, a server error and the Start button — around 370pt at
    // 1x on this phone, on copy that runs longer again in az and ru, and
    // AppText allows a maxFontSizeMultiplier of 1.3 on top of that.
    const barAt1x = 370;
    const barAt13x = Math.round(barAt1x * 1.3); // 481
    const usable = WINDOW_H - STATUS - NAV_BAR; // 568 — the inhabitable window
    const cap = actionAreaMaxHeight(WINDOW_H)!;

    // Uncapped the bar is `flexShrink: 0`, so it simply TAKES those 481 points:
    // the question above it is left under 90, which is not two lines of it, and
    // one more wrapped line inside the bar puts Start behind the gesture strip.
    // There is no font scale at which that is the layout anyone wanted.
    expect(usable - barAt13x).toBeLessThan(90);

    // Capped, the bar gives way at half the window and scrolls inside itself,
    // so the body keeps at least the other half whatever the bar contains...
    expect(barAt13x).toBeGreaterThan(cap);
    expect(WINDOW_H - cap).toBeGreaterThanOrEqual(cap);
    // ...and the bar plus the strip it has to clear still fit inside the
    // window, which is what keeps the primary button on screen at any scale.
    expect(cap + actionAreaBottomPadding(NAV_BAR, 0)).toBeLessThanOrEqual(WINDOW_H);
  });
});

// ---------------------------------------------------------------------------
// The shared container owns it
// ---------------------------------------------------------------------------

describe("the shared ActionArea", () => {
  const area = code("components/ActionArea.tsx");

  it("INVARIANT: measures the safe area instead of guessing at a constant", () => {
    expect(area).toContain("useSafeAreaInsets()");
    expect(area).toContain("insets.bottom");
    expect(area).toContain("insets.left");
    expect(area).toContain("insets.right");
  });

  it("INVARIANT: reserves its space by FLEX, never by a height", () => {
    // The regression this file exists to catch. A pinned bar with a hardcoded
    // height needs a matching bottom padding on the content, and that constant
    // goes stale the moment a locale wraps a label or the font scale changes.
    // `flexShrink: 0` beside a `flex: 1` body reserves the space structurally.
    expect(area).toContain("flexShrink: 0");
    // No PIXEL height of any kind, and no percentage of the window either —
    // plain, min or max. The previous form of this was `\b(min|max)Height\s*:`,
    // and a SHORTHAND `maxHeight,` walks straight past it: the pattern has to
    // match the name and then insist the value is neither a number nor a
    // string. The one ceiling this contract allows is the measured one pinned
    // directly below, and it is a shorthand.
    expect(/\b(?:min|max)?[Hh]eight\s*:\s*[\d"']/.test(area)).toBe(false);
  });

  it("INVARIANT: caps its own height at a share of the MEASURED window", () => {
    // The hole this pass closed. `flexShrink: 0` protects the bar from the
    // body; nothing protected the bar from ITSELF, so a tall bar (a wrapped
    // consent line + a warning + an error + the button, at 1.3x, in az or ru)
    // pushed its own primary button off the bottom edge — the reported bug,
    // re-entered from the other side. Both halves are pinned: the ceiling is
    // DERIVED from the window, and it is APPLIED to the bar.
    expect(area).toContain("useWindowDimensions");
    expect(area).toContain("const maxHeight = actionAreaMaxHeight(");
    // APPLIED, not merely computed — and applied to the SCROLLING region, so
    // the padding that lifts the bar over the keyboard cannot eat the ceiling
    // and leave the buttons no height.
    const scroll = area.slice(area.indexOf("<ScrollView"));
    expect(/maxHeight\s*[,}]/.test(scroll)).toBe(true);
  });

  it("INVARIANT: scrolls inside that cap instead of clipping the primary", () => {
    // A ceiling with the overflow hidden under it would hide the button rather
    // than move it — the same failure with a tidier edge. Past the cap the bar
    // stays fully reachable, which means scrollable.
    expect(area).toContain("<ScrollView");
    expect(area).toContain("flexShrink: 1");
    // And a tap on a button in that bar must not be eaten dismissing the
    // keyboard the bar is sitting above.
    expect(area).toContain('keyboardShouldPersistTaps="handled"');
  });

  it("keeps the bar inside the shared tablet content column", () => {
    expect(area).toContain("useContentGutter");
  });

  it("lifts above the keyboard from a measurement that cannot feed back on itself", () => {
    // The shell is `flex: 1`, so its frame does not move when the bar under it
    // grows. Taking the number from the SCROLL BODY instead would oscillate:
    // lift the bar -> body shrinks -> body no longer overlaps -> bar drops.
    expect(area).toContain("useKeyboardViewInset");
    expect(area).toContain("keyboardInset");
  });
});

describe("every shared scroll body offers the action area", () => {
  // All four bodies a screen can reach. A body that does not offer `actions`
  // is a body on which the next screen will hand-roll a footer and get the
  // insets wrong — which is how the four modal pickers drifted apart.
  const BODIES = [
    "components/Screen.tsx",
    "features/parent/ui.tsx",
    "features/arena/ui.tsx",
    "features/tests/TestSetupScreen.tsx",
    "features/tests/TestRunnerScreen.tsx",
  ];

  it.each(BODIES)("%s routes its actions through the shared component", (file) => {
    const src = code(file);
    expect(/ActionArea(Shell)?/.test(src)).toBe(true);
    expect(src).toContain("actions");
  });

  it.each(BODIES)("%s hands the bottom inset to the bar, not to both", (file) => {
    // Without this the last panel floats a navigation bar's height above the
    // bar — the same double-count the picker fix had to reason about.
    expect(code(file)).toContain("scrollBodyBottomInset");
  });

  it.each(BODIES)("%s applies the same tablet gutter the bar does", (file) => {
    // The bar applies useContentGutter() unconditionally. A body that does not
    // agrees with it on every phone (the gutter is 0 there) and disagrees above
    // 560pt: the buttons sit in a centred 560pt column while the content above
    // them spans the whole slab. Both test-chain screens shipped that way.
    const src = code(file);
    expect(src).toContain("useContentGutter()");
    // ADDED to a padding, not merely imported. Importing the hook and then
    // dropping the value is the shape this regression actually takes, and an
    // assertion on the import name alone passes straight through it.
    expect(/\+\s*gutter\b/.test(src)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The dialogs
// ---------------------------------------------------------------------------

describe("the shared ArenaDialog shell", () => {
  const dialog = code("features/tests/ArenaDialog.tsx");

  it("INVARIANT: pads the backdrop with the safe-area insets on every side", () => {
    expect(dialog).toContain("useSafeAreaInsets()");
    for (const side of ["top", "bottom", "left", "right"]) {
      expect(dialog).toContain("insets." + side);
    }
  });

  it("INVARIANT: clamps by flex, never by a percentage of the window", () => {
    // `maxHeight: "85%"` measured the WHOLE window, system bars included, which
    // is what put the card's edge on the navigation bar.
    expect(/maxHeight\s*:\s*"\d+%"/.test(dialog)).toBe(false);
    expect(dialog).toContain("flexShrink: 1");
  });

  it("gives the body a scroll and the actions none", () => {
    // The body is what gives way on a short screen; the action row is what
    // must not.
    expect(dialog).toContain("<ScrollView");
    expect(dialog).toContain("<ActionArea edge={false}>");
  });

  it("keeps the one-tap rule for a dialog hosting a keyboard", () => {
    expect(dialog).toContain('keyboardShouldPersistTaps="handled"');
    expect(dialog).toContain("KeyboardFocusBoundary");
  });
});

describe("no arena dialog draws its own window any more", () => {
  // Three of them were written three times over and all three had the same two
  // defects. The shell is the only place a `<Modal>` may be opened in the test
  // feature, apart from the option picker, which has its own pinned contract in
  // select-sheet-insets.test.ts.
  const ALLOWED = new Set(["ArenaDialog.tsx", "SelectField.tsx"]);
  const FILES = [
    "ArenaDialog.tsx",
    "ConfirmModal.tsx",
    "ReportQuestionSheet.tsx",
    "SelectField.tsx",
    "TestsHomeScreen.tsx",
    "TestRunnerScreen.tsx",
    "TestSetupScreen.tsx",
    "TestResultScreen.tsx",
    "TestReviewScreen.tsx",
  ];

  it.each(FILES)("features/tests/%s", (name) => {
    if (ALLOWED.has(name)) return;
    expect(code("features/tests/" + name).includes("<Modal")).toBe(false);
  });

  it("and the three that used to are all on the shell", () => {
    for (const name of ["ConfirmModal.tsx", "ReportQuestionSheet.tsx", "TestsHomeScreen.tsx"]) {
      expect(code("features/tests/" + name)).toContain("ArenaDialog");
    }
  });
});

// ---------------------------------------------------------------------------
// The exam runner — the surface the owner's report names first
// ---------------------------------------------------------------------------

describe("the exam runner's way through the attempt is pinned", () => {
  const runner = code("features/tests/TestRunnerScreen.tsx");
  const actions = actionRegion(runner);

  it("keeps Prev / Next / Submit out of the question scroll", () => {
    // "In exams." Geri / İrəli / Təsdiqlə were the last child of the scroll,
    // under the question, its figure, five options and the palette. A long
    // question — or a raised font scale — put SUBMIT below the fold, and a
    // student who cannot submit cannot finish the attempt at all.
    expect(actions).not.toBe("");
    expect(actions).toContain('t("arena.quizPrev")');
    expect(actions).toContain('t("test.run.next")');
    expect(actions).toContain('t("test.run.submit")');
  });

  it("offers exactly ONE submit control on the last question", () => {
    // REGRESSION, and a visible one. The scroll kept its own gradient Təsdiqlə
    // under the palette, rendered UNCONDITIONALLY, and the pinned bar renders
    // one when `isLast` — so a student reaching the final question was asked to
    // submit twice, in two different button styles, one under the other. The
    // pinned bar owns the primary action; the scroll keeps Cancel and nothing
    // else. `t("test.run.submitting")` and `t("test.run.submitTitle")` do not
    // match this needle: it ends at the closing paren.
    expect(runner.split('t("test.run.submit")').length - 1).toBe(1);
    expect(actions).toContain('t("test.run.submit")');
  });

  // -------------------------------------------------------------------------
  // THE ENGINE UNDERNEATH — one guarantee per case, each asserted where it
  // actually lives.
  //
  // The first version of this block was a single case that named four
  // guarantees and proved three of them by checking that an IDENTIFIER
  // appeared somewhere in a 1400-line file: `addListener("beforeRemove"`,
  // `BackHandler.addEventListener(...)`, `deadlineFromRemaining`. Every one of
  // those strings survives deleting the `preventDefault()` inside the handler,
  // returning `false` from the back handler, or replacing the tick with a
  // decrement — i.e. it survives exactly the regressions it was written to
  // catch. A fifth guarantee, the answer-sync indicator, was named in the
  // comment and asserted by nothing at all.
  // -------------------------------------------------------------------------

  it("ENGINE: `submitting` still blocks movement through the attempt", () => {
    // Both movement controls, and both halves of each: the `disabled` prop is
    // what greys the button out, and the re-check inside onPress is what stops
    // a press that arrives anyway.
    expect(actions).toContain("disabled={idx === 0 || submitting}");
    expect(actions).toContain("if (idx === 0 || submitting) return;");
    expect(actions).toContain("disabled={submitting}");
    expect(actions).toContain("if (submitting) return;");
    // ...and nothing in the bar opts out of `disabled` the way the setup CTA
    // deliberately does, which would make the prop decorative.
    expect(actions).not.toContain("pressThroughDisabled");
  });

  it("ENGINE: Submit opens the confirm dialog and never fires the RPC", () => {
    expect(actions).toContain("setSubmitOpen(true)");
    // The bar must not submit on the spot: the dialog is where the unanswered
    // count is shown, where a failure is reported, and where the in-flight lock
    // lives. A bar that called doSubmit() would skip all three.
    expect(/doSubmit|submitTestAttempt/.test(actions)).toBe(false);
    // And a second tap while the first request is in flight presses nothing —
    // ArenaButton drops onPress entirely when `pending`.
    expect(actions).toContain("pending={submitting}");
  });

  it("ENGINE: the leave guard still ASKS before anything leaves", () => {
    const beforeRemove = blockAfter(runner, 'addListener("beforeRemove"');
    // Without preventDefault the dialog opens over a screen that is already
    // being torn down: the attempt is left behind either way.
    expect(beforeRemove).toContain("e.preventDefault();");
    expect(beforeRemove).toContain("setLeaveOpen(true)");
    // It stands aside once the attempt is finished or the leave is confirmed,
    // or confirming would re-open the dialog it came from.
    expect(beforeRemove).toContain(
      "if (finishedRef.current || leavingRef.current) return;",
    );

    const back = blockAfter(runner, 'BackHandler.addEventListener("hardwareBackPress"');
    expect(back).toContain("setLeaveOpen(true)");
    // `true` = swallowed. Returning false hands the press to the navigator and
    // the attempt is gone before the dialog can ask anything.
    expect(back).toContain("return true;");
    expect(back).toContain(
      "if (finishedRef.current || leavingRef.current) return false;",
    );
  });

  it("ENGINE: the countdown is recomputed from the anchor, never decremented", () => {
    const tick = blockAfter(runner, "const tick = setInterval(");
    expect(tick).toContain("setRemaining(remainingFrom(deadlineRef.current, Date.now()))");
    // A tick that subtracted from state would drift with every throttled or
    // dropped frame, and would keep counting down straight over a server
    // resync — the clock would stop agreeing with the deadline the server
    // enforces, on a screen whose whole job is that agreement.
    expect(/remaining\s*-\s*1|\(\s*r\s*\)\s*=>/.test(tick)).toBe(false);
    // ...and the anchor itself is re-derived from what the SERVER last said.
    expect(runner).toContain(
      "deadlineRef.current = deadlineFromRemaining(Date.now(), remaining);",
    );
  });

  it("ENGINE: the answer-sync indicator still reports all three states", () => {
    // saving / saved / error — written by the flush, read by the header pill.
    // A student who cannot see that their answers are saved will not trust the
    // screen with an hour of work.
    expect(runner).toContain('setSaveState("saving")');
    expect(runner).toContain('setSaveState(failed ? "error" : "saved")');
    expect(runner).toContain('setSaveState("error")');
    for (const state of ["saving", "saved", "error"]) {
      expect(runner).toContain('saveState === "' + state + '"');
    }
  });

  it("ENGINE: none of that moved INTO the bar", () => {
    // The bar is presentation over the engine: it reads two pieces of state and
    // calls two setters. Autosave, the deadline anchor and the save indicator
    // stay where they were, which is the other half of "the row moved, the
    // guards did not".
    expect(/flushRef|deadlineRef|setSaveState|savingRef/.test(actions)).toBe(false);
  });

  it("leaves the destructive action where a thumb does NOT rest", () => {
    // Cancel-the-attempt scores nothing and cannot be undone. It stays at the
    // end of the scroll, below the palette: reachability is for the action the
    // user is looking for, not for the one they must never hit by accident.
    expect(actions).not.toContain('t("test.run.cancel")');
    expect(runner).toContain('t("test.run.cancel")');
  });
});

// ---------------------------------------------------------------------------
// The double-count guard, at the two screens that actually apply it
// ---------------------------------------------------------------------------

describe("a screen with an action area hands the bottom inset to the BAR", () => {
  // scrollBodyBottomInset() is pinned as arithmetic further up. What was not
  // pinned is the thing it exists for: these two screens each keep TWO padding
  // objects — one for the states that render bare (loading, error, no access)
  // and one for the state that has a bar under it — and the whole guard is
  // which of them drops the inset. Asserting only that the file mentions the
  // helper passes a screen that computed the right number and then let the
  // spread put the old one back.
  const BODIES = [
    "features/tests/TestRunnerScreen.tsx",
    "features/tests/TestSetupScreen.tsx",
  ];

  it.each(BODIES)("%s: the scrolling body drops it", (file) => {
    const scrollPad = blockAfter(code(file), "const scrollPad =");
    expect(scrollPad).not.toBe("");
    expect(scrollPad).toContain("...pad");
    expect(scrollPad).toContain("paddingBottom: scrollBodyBottomInset(insets.bottom, true)");
    // ORDER IS THE GUARD. `{ paddingBottom: …, ...pad }` type-checks, reads
    // fine, and restores the very inset the line above just removed.
    expect(scrollPad.indexOf("...pad")).toBeLessThan(scrollPad.indexOf("paddingBottom"));
  });

  it.each(BODIES)("%s: the states WITHOUT a bar keep it", (file) => {
    // The skeleton, the error retry and the closed/no-access notices render
    // under `pad` with nothing below them. If `pad` dropped the inset too,
    // those screens would end on the gesture bar — the same bug, one state to
    // the left.
    const pad = blockAfter(code(file), "const pad =");
    expect(pad).toContain("paddingBottom: insets.bottom + spacing.xl");
  });

  it("so body + bar is exactly one inset, and the difference is that inset", () => {
    // The pixel difference the guard is worth, in the runner's own arithmetic:
    // a player body sits one navigation bar lower than a skeleton body, and the
    // bar under it makes that space back.
    const inset = 48;
    const bare = inset + spacing.xl;
    const withBar = scrollBodyBottomInset(inset, true) + spacing.xl;
    expect(bare - withBar).toBe(inset);
    expect(withBar + actionAreaBottomPadding(inset, 0)).toBe(bare);
  });
});

// ---------------------------------------------------------------------------
// The confirm dialog, while it is deciding the attempt's fate
// ---------------------------------------------------------------------------

describe("ConfirmModal is strictly modal while its primary is in flight", () => {
  const modal = code("features/tests/ConfirmModal.tsx");
  const shell = code("features/tests/ArenaDialog.tsx");
  const runner = code("features/tests/TestRunnerScreen.tsx");

  it("drops the dismiss handler for the whole request", () => {
    // Not `disabled`: the backdrop and Android's hardware back are not buttons
    // and have nothing to disable. Handing the shell `undefined` is what makes
    // them inert — and a submit abandoned halfway leaves a student staring at a
    // question list with no idea whether the attempt went in.
    expect(modal).toContain("onDismiss={primaryPending ? undefined : dismiss}");
  });

  it("and the shell wires that undefined to BOTH ways out", () => {
    // The backdrop Pressable and the Modal's own onRequestClose. Wiring one and
    // not the other leaves Android's back gesture closing a live request.
    expect(shell).toContain("onPress={onDismiss}");
    expect(shell).toContain("onRequestClose={onDismiss ?? noop}");
  });

  it("holds the secondary button too, so Cancel cannot race Confirm", () => {
    expect(modal).toContain("disabled={primaryPending}");
    // ...and the primary drops its own onPress while pending, so a second tap
    // cannot start a second submit.
    expect(modal).toContain("pending={primaryPending}");
  });

  it("keeps the failure with the buttons, and hides it while retrying", () => {
    // The error rides in `actions` (never in the scrolling body, where it is
    // the first thing to disappear), and the caller passes null while the
    // request is in flight so a previous attempt's message cannot sit under a
    // spinner and read as a fresh failure.
    expect(propValue(modal, "actions")).toContain("errorText");
    expect(runner).toContain("errorText={submitting ? null : fatal}");
    expect(runner).toContain("errorText={canceling ? null : fatal}");
  });

  it("the runner's own close paths refuse to close mid-flight", () => {
    // The labelled Back / Keep-going buttons, which the shell knows nothing
    // about. Both are inert for the same reason the backdrop is.
    expect(
      /if \(submitting\) return;\s*setFatal\(null\);\s*setSubmitOpen\(false\);/.test(runner),
    ).toBe(true);
    expect(
      /if \(canceling\) return;\s*setFatal\(null\);\s*setCancelOpen\(false\);/.test(runner),
    ).toBe(true);
  });

  it("and the LEAVE dialog dismisses to stay, never to leave", () => {
    // onDismiss defaults to onSecondary, and this dialog's secondary is
    // "leave the attempt" — so without its own handler a backdrop tap would
    // abandon a live attempt silently.
    expect(runner).toContain("onDismiss={continueTest}");
  });
});

// ---------------------------------------------------------------------------
// The same defect class outside the test feature
// ---------------------------------------------------------------------------

describe("the shared SheetDialog shell", () => {
  const sheet = code("components/SheetDialog.tsx");

  it("INVARIANT: measures the safe area on every side it touches", () => {
    // A transparent Modal is its own native window and spans the system bars.
    expect(sheet).toContain("useSafeAreaInsets()");
    for (const side of ["top", "bottom", "left", "right"]) {
      expect(sheet).toContain("insets." + side);
    }
  });

  it("INVARIANT: clamps by flex, never by a percentage of the window", () => {
    expect(/maxHeight\s*:\s*"\d+%"/.test(sheet)).toBe(false);
    expect(sheet).toContain("flexShrink: 1");
  });

  it("gives the body a scroll and the actions none", () => {
    expect(sheet).toContain("<ScrollView");
    expect(sheet).toContain("<ActionArea edge={false}>");
  });
});

describe("the account-deletion sheet is on that shell", () => {
  const src = code("features/profile/sections.tsx");
  const actions = actionRegion(src);

  it("stops drawing its own window", () => {
    // It drew one: a bottom-anchored Modal with a flat 24pt bottom padding, no
    // inset anywhere in the file, no clamp and no scroll. On a three-button
    // Android phone the buttons sat behind the navigation bar.
    expect(src.includes("<Modal")).toBe(false);
    expect(src).toContain("SheetDialog");
  });

  it("pins Delete and Cancel, and lets the confirmation scroll", () => {
    // The confirmation paragraph is ~180 characters in az and longer in ru; at
    // 1.3x plus an error line it outgrew the card, and the card had nowhere to
    // put the overflow. Now the paragraph gives way and the buttons cannot.
    expect(actions).not.toBe("");
    expect(actions).toContain('t("profile.cancel")');
    expect(actions).toContain('variant="danger"');
    // The error travels with the buttons: it explains the one the user is about
    // to press again, so it must never be the thing that scrolled away.
    expect(actions).toContain("{error}");
    // ...and the paragraph is in the BODY, which is the half that scrolls.
    expect(actions).not.toContain('t("account.deleteConfirm")');
    expect(src).toContain('t("account.deleteConfirm")');
  });
});

describe("the check-your-inbox screen, whose only control is Resend", () => {
  const register = code("app/(public)/register.tsx");

  it("scrolls instead of centring a card it cannot fit", () => {
    // A CENTRED `flex: 1` column is the worst way to overflow: the excess is
    // split between the two ends, so the card was clipped at the TOP and the
    // BOTTOM at once and there was no scroll to reach either. At 320x568 with
    // the 1.3x font scale AppText allows, the ru strings already exceed the
    // column — before the user has done anything.
    expect(/<Screen\s+scroll\s+actions=/.test(register)).toBe(true);
    expect(/flex:\s*1,\s*justifyContent:\s*"center"/.test(register)).toBe(false);
  });

  it("pins Resend, and the outcome line rides with it", () => {
    // The account is unusable until this is pressed (unconfirmed accounts
    // cannot log in, and a password reset does not help one), so it is the one
    // control that must never need scrolling to. And the thing that GROWS the
    // screen is its own success message — verify.resent, ~99 ru characters,
    // rendered directly above the button by ResendConfirmation — which is why
    // the two travel together into the bar rather than the button alone.
    expect(propValue(register, "actions")).toContain("ResendConfirmation");
    // Exactly once in the file: left in the card as well, it would render twice.
    expect(register.split("<ResendConfirmation").length - 1).toBe(1);
  });
});

describe("the boot screens, whose CTA is the only control in the app", () => {
  const boot = code("features/boot/screens.tsx");

  it("scrolls an admin-authored message instead of pushing the CTA off", () => {
    // MaintenanceScreen and ForceUpdateScreen print a trilingual message typed
    // in the admin panel, with no length cap anywhere. The shell was a centred,
    // non-scrolling flex: 1 column with the CTA as its last child.
    const shell = section(boot, "CenteredShell");
    expect(shell).toContain("<ScrollView");
    // flexGrow + centred: unchanged on every screen that already fitted.
    expect(shell).toContain("flexGrow: 1");
    expect(shell).toContain("justifyContent: \"center\"");
    expect(shell).toContain("ActionAreaShell");
    expect(shell).toContain("scrollBodyBottomInset");
  });

  it("pins the force-update button, and the failure line with it", () => {
    // These states REPLACE the navigator: no back, no tabs, no gestures. That
    // button is the only way out of the app's front door, and "could not open
    // the store" is useless if it is off-screen under the message.
    const force = propValue(section(boot, "ForceUpdateScreen"), "actions");
    expect(force).toContain('t("mob.update.cta")');
    expect(force).toContain('t("mob.update.openFailed")');
  });

  it("pins retry and sign-out on the unknown-role escape", () => {
    const unknown = propValue(section(boot, "UnknownRoleScreen"), "actions");
    expect(unknown).toContain('t("mob.retry")');
    expect(unknown).toContain('t("drawer.logout")');
  });
});

// ---------------------------------------------------------------------------
// The rule the owner's report actually turns on
// ---------------------------------------------------------------------------

describe("the control that ENABLES the action travels with the action", () => {
  // A disabled Start with its consent tick on the far side of a scroll boundary
  // is a button that is visibly there and does nothing — "they can't touch it
  // somehow". Both rules surfaces are pinned, and the assertion is positional:
  // the tick must be INSIDE the `actions` prop and nowhere else in the file.
  const SURFACES = [
    "features/tests/TestsHomeScreen.tsx",
    "features/tests/TestSetupScreen.tsx",
  ];
  const CONSENT = 'accessibilityLabel={t("test.setup.consent")}';

  it.each(SURFACES)("%s keeps the consent tick in the action area", (file) => {
    const src = code(file);
    expect(src).toContain(CONSENT);
    const actions = actionRegion(src);
    expect(actions).not.toBe("");
    expect(actions).toContain(CONSENT);
    // Exactly once in the file, so it cannot ALSO be left in the body.
    expect(src.split(CONSENT).length - 1).toBe(1);
  });

  it("keeps the start button beside it, in the same non-scrolling row", () => {
    const gate = actionRegion(code("features/tests/TestsHomeScreen.tsx"));
    expect(gate).toContain('t("test.rounds.start")');
    const setup = actionRegion(code("features/tests/TestSetupScreen.tsx"));
    expect(setup).toContain('t("test.setup.start")');
  });

  it("and a press that changes nothing SAYS what is missing", () => {
    // THE OTHER HALF OF THE OWNER'S REPORT. Pinning the row answered "I cannot
    // reach the button"; it could not answer "I press it and nothing happens",
    // because that half was not geometry at all — start() returned in silence
    // whenever the consent box was unticked, at every screen size. The setup
    // CTA is press-through-disabled precisely so a press can explain itself,
    // and now both reasons do (features/tests/logic.ts → setupBlocker).
    const setup = code("features/tests/TestSetupScreen.tsx");
    expect(setup).toContain("setupBlocker(");
    // The silent return this replaced. If it comes back, so does the bug.
    expect(/if \(!consent[^)]*\) return;/.test(setup)).toBe(false);
    // Both sentences exist, and both are STATIC t() calls so the key sweep in
    // check-i18n-keys.mjs can see them.
    expect(setup).toContain('t("test.setup.selectWarn")');
    expect(setup).toContain('t("test.setup.consentWarn")');
    // ...and they are rendered in the action area, beside the tick and the
    // button they are about — a warning that scrolls away from its control
    // explains nothing.
    expect(actionRegion(setup)).toContain("warnText");
  });
});
