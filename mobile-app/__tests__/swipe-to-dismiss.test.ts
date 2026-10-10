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
  HANDLE_STRIP,
  SWIPE_DISTANCE,
  SWIPE_VELOCITY,
  shouldDismissOnRelease,
} from "@/components/swipeDismiss";

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

  it("cannot be dragged above its resting position", () => {
    expect(sheet).toMatch(/setValue\(Math\.max\(0, g\.dy\)\)/);
  });

  it("snaps back to rest when the sheet is shown again", () => {
    expect(sheet).toMatch(/if \(visible\)[\s\S]{0,80}translateY\.setValue\(0\)/);
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
