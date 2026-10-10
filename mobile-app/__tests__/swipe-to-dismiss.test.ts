// SWIPE-DOWN TO CLOSE, on every bottom sheet.
//
// Owner bug (Android): a bottom sheet whose content filled the screen could not
// be closed — the backdrop above the card was the only way out and a tall card
// leaves it zero pixels high, while the grab line looked draggable and did
// nothing. components/SwipeDownSheet makes the line a real drag handle.
//
// Source assertions on purpose (the sheets are .tsx; this suite is .ts-only):
// the point is to catch a NEW slide-up sheet written with a plain View card and
// a decorative handle — which is how every one of the six got here.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  COLLAPSED_FRACTION,
  HANDLE_STRIP,
  HANDLE_THICKNESS,
  HANDLE_WIDTH,
  SWIPE_DISTANCE,
  SWIPE_VELOCITY,
  dragPosition,
  releaseOutcome,
  sheetDetents,
  sheetHandleColor,
  shouldDismissOnRelease,
} from "@/components/swipeDismiss";
import { APP_DARK, APP_LIGHT } from "@/theme/tokens";

const SRC = resolve(__dirname, "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Source with comments blanked, so prose never satisfies an assertion. */
function code(abs: string): string {
  return readFileSync(abs, "utf8")
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

const FILES = walk(SRC).map((abs) => ({
  file: relative(SRC, abs).split("\\").join("/"),
  code: code(abs),
}));

/** A bottom sheet = a TRANSPARENT Modal that slides up (a full-screen slide
 *  modal is a page with its own Close/Back row, not a sheet). */
function isBottomSheet(src: string): boolean {
  // A window after each tag, not `[^>]*` — an arrow-function prop contains ">".
  const modals = src.split("<Modal").slice(1).map((rest) => rest.slice(0, 300));
  return modals.some((m) => /\btransparent\b/.test(m) && /animationType="slide"/.test(m));
}

const SHEETS = FILES.filter((f) => isBottomSheet(f.code));

const KNOWN = [
  "components/AccountSheet.tsx",
  "components/LocaleSwitcher.tsx",
  "components/SheetDialog.tsx",
  "features/notifications/components.tsx",
  "features/parent/ui.tsx",
  "features/profile/SelectField.tsx",
];

/** The old decorative grab line: a 44×4 View painted with tokens.border. */
const DECORATIVE_HANDLE = /width:\s*44,\s*height:\s*4,\s*borderRadius:\s*2/;

describe("every bottom sheet", () => {
  it("is found by the scan", () => {
    expect(SHEETS.map((s) => s.file).sort()).toEqual(expect.arrayContaining(KNOWN));
  });

  it("INVARIANT: renders its card through SwipeDownSheet", () => {
    const offenders = SHEETS.filter((s) => !s.code.includes("<SwipeDownSheet")).map(
      (s) => s.file,
    );
    expect(offenders).toEqual([]);
  });

  it("no longer paints its own decorative grab line", () => {
    const offenders = SHEETS.filter((s) => DECORATIVE_HANDLE.test(s.code)).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("keeps the backdrop tap and Android back as ways out", () => {
    for (const s of SHEETS) {
      expect(s.code).toMatch(/onRequestClose=\{/);
      expect(s.code).toMatch(/<Pressable[\s\S]*?onPress=\{/);
    }
  });

  it("passes a close label for the handle (screen readers get a button)", () => {
    for (const s of SHEETS) {
      const at = s.code.indexOf("<SwipeDownSheet");
      expect(s.code.slice(at, at + 300)).toMatch(/closeLabel=\{/);
    }
  });
});

describe("SheetDialog keeps its strictly-modal mode", () => {
  const dialog = code(resolve(SRC, "components/SheetDialog.tsx"));

  it("hands the swipe the RAW onDismiss — undefined stays undefined", () => {
    // `onDismiss ?? noop` here would make an in-flight destructive sheet
    // swipeable, which is exactly what `undefined` exists to forbid.
    expect(dialog).toMatch(/<SwipeDownSheet[\s\S]{0,120}onDismiss=\{onDismiss\}/);
  });
});

describe("the SwipeDownSheet component", () => {
  const sheet = code(resolve(SRC, "components/SwipeDownSheet.tsx"));

  it("uses only built-in RN gesture/animation APIs (Expo Go, OTA-safe)", () => {
    expect(sheet).toContain("PanResponder.create");
    expect(sheet).not.toMatch(/react-native-gesture-handler|react-native-reanimated/);
  });

  it("attaches the pan to the handle strip only when dismissable", () => {
    expect(sheet).toMatch(/dismissable \? pan\.panHandlers : null/);
  });

  it("is a screen-reader close button with an activate action", () => {
    expect(sheet).toMatch(/accessibilityRole=\{dismissable \? "button"/);
    expect(sheet).toMatch(/name: "activate"/);
    expect(sheet).toMatch(/actionName === "activate"/);
  });

  it("moves only through the pure detent rules", () => {
    // The clamps (never above the full detent, never up at all when short)
    // live in dragPosition/releaseOutcome, which the describes below pin.
    expect(sheet).toContain("dragPosition(");
    expect(sheet).toContain("releaseOutcome(");
    expect(sheet).toContain("sheetDetents(");
  });

  it("caps its height in points from the window and the TOP inset", () => {
    expect(sheet).toContain("useWindowDimensions()");
    expect(sheet).toMatch(/Math\.max\(callerTop, insets\.top\)/);
    expect(sheet).toMatch(/maxHeight,/);
    expect(sheet).toContain("flexShrink: 1");
  });

  it("sets no top margin of its own (it would be an undimmed stripe)", () => {
    // The whole override block the component lays over the caller's style.
    expect(sheet).toMatch(
      /\{\s*paddingTop: 0,\s*flexShrink: 1,\s*maxHeight,\s*transform: \[\{ translateY: drop \}\],\s*\}/,
    );
  });

  it("returns to the collapsed detent when the sheet is shown again", () => {
    expect(sheet).toMatch(
      /if \(!visible\) return;[\s\S]{0,160}extra\.setValue\(0\);\s*drop\.setValue\(0\);/,
    );
  });

  it("gives the handle a full-size touch target", () => {
    expect(HANDLE_STRIP).toBeGreaterThanOrEqual(44);
  });
});

describe("the release rule", () => {
  it("never dismisses an upward or zero drag, however fast", () => {
    expect(shouldDismissOnRelease(0, 5, 600)).toBe(false);
    expect(shouldDismissOnRelease(-200, 5, 600)).toBe(false);
  });

  it("dismisses a fast downward flick even when short", () => {
    expect(shouldDismissOnRelease(20, SWIPE_VELOCITY + 0.2, 800)).toBe(true);
  });

  it("caps the distance a tall sheet needs", () => {
    // A full-screen sheet must not demand a 30%-of-screen pull.
    expect(shouldDismissOnRelease(SWIPE_DISTANCE + 1, 0, 900)).toBe(true);
    expect(shouldDismissOnRelease(SWIPE_DISTANCE - 1, 0, 900)).toBe(false);
  });

  it("scales the distance down for a short sheet", () => {
    // 30% of a 200pt sheet is 60pt.
    expect(shouldDismissOnRelease(61, 0, 200)).toBe(true);
    expect(shouldDismissOnRelease(59, 0, 200)).toBe(false);
  });

  it("falls back to the fixed distance before the sheet is measured", () => {
    expect(shouldDismissOnRelease(SWIPE_DISTANCE + 1, 0, 0)).toBe(true);
    expect(shouldDismissOnRelease(SWIPE_DISTANCE - 1, 0, 0)).toBe(false);
  });
});

describe("the detents", () => {
  it("open a sheet at 80% of the window", () => {
    expect(COLLAPSED_FRACTION).toBe(0.8);
    expect(sheetDetents(800, 40)).toEqual({ collapsed: 640, full: 760 });
  });

  it("put the full detent's top edge at the top inset, never above it", () => {
    // 800pt window, 48pt camera cutout: the card may reach y=48 and no higher.
    expect(sheetDetents(800, 48).full).toBe(752);
  });

  it("never let the collapsed cap exceed the full one", () => {
    // A short landscape window with a deep inset: nothing to expand into.
    const d = sheetDetents(360, 100);
    expect(d.collapsed).toBe(d.full);
    expect(d.full).toBe(260);
  });
});

describe("dragging", () => {
  const MAX = 120; // a tall sheet's full detent, 120pt above collapsed

  it("follows the finger up to the full detent and no further", () => {
    expect(dragPosition(0, -60, MAX)).toEqual({ extra: 60, drop: 0 });
    expect(dragPosition(0, -500, MAX)).toEqual({ extra: MAX, drop: 0 });
  });

  it("does not move a short sheet up at all", () => {
    expect(dragPosition(0, -80, 0)).toEqual({ extra: 0, drop: 0 });
  });

  it("from full, shrinks to collapsed first and only then drops", () => {
    expect(dragPosition(MAX, 50, MAX)).toEqual({ extra: 70, drop: 0 });
    expect(dragPosition(MAX, 200, MAX)).toEqual({ extra: 0, drop: 80 });
  });

  it("drops a collapsed sheet one point per point dragged", () => {
    expect(dragPosition(0, 90, MAX)).toEqual({ extra: 0, drop: 90 });
  });
});

describe("releasing", () => {
  const MAX = 160;
  const REST = 640; // a tall sheet's collapsed height
  const release = (start: number, dy: number, vy = 0, maxExtra = MAX, restHeight = REST) =>
    releaseOutcome({ start, dy, vy, maxExtra, restHeight });

  it("snaps UP to full past the halfway point", () => {
    expect(release(0, -(MAX / 2 + 1))).toBe("expanded");
  });

  it("snaps back DOWN to collapsed short of the halfway point", () => {
    expect(release(0, -(MAX / 2 - 1))).toBe("collapsed");
  });

  it("from full, a short pull down returns to full, a longer one to collapsed", () => {
    expect(release(MAX, 30)).toBe("expanded");
    expect(release(MAX, MAX - 10)).toBe("collapsed");
  });

  it("from full, a pull past collapsed by the dismiss distance closes", () => {
    expect(release(MAX, MAX + SWIPE_DISTANCE + 1)).toBe("dismiss");
    expect(release(MAX, MAX + SWIPE_DISTANCE - 1)).toBe("collapsed");
  });

  it("from collapsed, the dismiss distance rule still decides", () => {
    expect(release(0, SWIPE_DISTANCE + 1)).toBe("dismiss");
    expect(release(0, SWIPE_DISTANCE - 1)).toBe("collapsed");
    // A short sheet needs only 30% of itself.
    expect(release(0, 61, 0, 0, 200)).toBe("dismiss");
    expect(release(0, 59, 0, 0, 200)).toBe("collapsed");
  });

  it("a downward FLICK drops one detent: full -> collapsed, collapsed -> closed", () => {
    const fast = SWIPE_VELOCITY + 0.5;
    expect(release(MAX, 20, fast)).toBe("collapsed");
    expect(release(0, 20, fast)).toBe("dismiss");
    // ...unless it was already dragged below collapsed: then it closes.
    expect(release(MAX, MAX + 20, fast)).toBe("dismiss");
  });

  it("an upward FLICK expands a tall sheet and leaves a short one alone", () => {
    const fast = -(SWIPE_VELOCITY + 0.5);
    expect(release(0, -10, fast)).toBe("expanded");
    expect(release(0, -10, fast, 0)).toBe("collapsed");
  });

  it("never expands a sheet that has nowhere to grow", () => {
    expect(release(0, -400, 0, 0)).toBe("collapsed");
  });
});

describe("the grab line", () => {
  const sheet = code(resolve(SRC, "components/SwipeDownSheet.tsx"));

  /** WCAG relative luminance contrast of two #rrggbb colours. */
  function contrast(a: string, b: string): number {
    const lum = (hex: string) => {
      const [r, g, bl] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  it("is painted by the theme-driven helper, never the faint border token", () => {
    expect(sheet).toContain("backgroundColor: sheetHandleColor(tokens)");
    expect(sheet).not.toMatch(/tokens\.border/);
    for (const t of [APP_LIGHT, APP_DARK]) {
      expect(sheetHandleColor(t)).not.toBe(t.border);
    }
  });

  it("clears 3:1 against the sheet surface in BOTH themes", () => {
    // The border token it replaced measured 1.2:1 (light) and 1.31:1 (dark).
    expect(contrast(APP_LIGHT.border, APP_LIGHT.surface)).toBeLessThan(1.5);
    for (const t of [APP_LIGHT, APP_DARK]) {
      expect(contrast(sheetHandleColor(t), t.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("is big enough to read as a control: >= 44 wide, >= 5 thick, fully rounded", () => {
    expect(HANDLE_WIDTH).toBeGreaterThanOrEqual(44);
    expect(HANDLE_THICKNESS).toBeGreaterThanOrEqual(5);
    expect(sheet).toContain("borderRadius: HANDLE_THICKNESS / 2");
  });
});

describe("one height cap per sheet", () => {
  it("no bottom sheet clamps itself with a percentage on top of the detents", () => {
    const offenders = SHEETS.filter((s) => /maxHeight\s*:\s*"\d+%"/.test(s.code)).map(
      (s) => s.file,
    );
    expect(offenders).toEqual([]);
  });

  it("the one sheet that hosts an input keeps its top below the inset with the keyboard up", () => {
    // Inside a KeyboardAvoidingView the window can shrink below the computed
    // detents; the card flex-shrinks, and the backdrop's minHeight is what
    // stops it rising into the status bar.
    const profile = SHEETS.find((s) => s.file === "features/profile/SelectField.tsx");
    expect(profile?.code).toContain("KeyboardAvoidingView");
    expect(profile?.code).toContain("KeyboardFocusBoundary");
    expect(profile?.code).toMatch(/minHeight: insets\.top/);
  });
});
