// Every modal option list must end ABOVE the system bars, and its last row must
// be able to scroll into the clear.
//
// REPORTED BY THE OWNER, on the Ranking tab: the Subject/District picker's
// bottom sheet put its final options under the Android navigation area, where
// they could be neither scrolled to nor tapped.
//
// THE MECHANISM. The app has FOUR modal option lists and they were written
// three times over. A transparent Modal is its own native window and, under the
// edge-to-edge windows Android now enforces, that window spans the whole screen
// INCLUDING the strip behind the gesture pill / three-button bar. A sheet
// anchored to the bottom edge therefore ends behind that bar, and only its own
// paddingBottom can hold the content out of it. features/profile/SelectField
// padded a flat spacing.xl (24pt): enough for a 24pt gesture pill, 24pt short
// of a 48pt three-button bar. Rows in that strip render, but the touches belong
// to the system, and the list is already at its content end so there is nothing
// left to scroll — exactly the reported symptom.
//
// It is NOT a scroll-conflict bug: a FlatList inherits ScrollView's base
// flexShrink, so it does shrink inside a maxHeight box and it does scroll.
// Padding the CONTAINER alone would not have been enough either — that moves
// the list's frame up while its content still ends flush against that frame, so
// the last row stops at the edge. Both halves are pinned below.
//
// These are source assertions on purpose: the sheets are .tsx and this suite is
// .ts-only, and the point is to catch a FIFTH copy — or an edit to one of the
// four — that quietly drops the insets, which is how three of these drifted
// apart in the first place.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spacing } from "@/theme/tokens";
import { COLLAPSED_FRACTION, HANDLE_STRIP, sheetDetents } from "@/components/swipeDismiss";

const SRC = resolve(__dirname, "..", "src");

/** The four that exist today. Listed so a rename fails loudly instead of
 *  shrinking the scan to nothing; every assertion below runs against whatever
 *  the walk finds, so a fifth copy is covered without editing this list. */
const KNOWN = [
  "components/PhoneField.tsx",
  "features/parent/SelectField.tsx",
  "features/profile/SelectField.tsx",
  "features/tests/SelectField.tsx",
];

const PROFILE_SHEET = "features/profile/SelectField.tsx";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Source with comments blanked: prose ABOUT insets must never satisfy a test
 *  that the code applies them. */
function code(abs: string): string {
  return readFileSync(abs, "utf8")
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

type Sheet = { file: string; code: string };

const SHEETS: Sheet[] = walk(SRC)
  .map((abs) => ({ file: relative(SRC, abs).split("\\").join("/"), code: code(abs) }))
  .filter((s) => s.code.includes("<Modal") && s.code.includes("<FlatList"));

function sheet(file: string): string {
  const found = SHEETS.find((s) => s.file === file);
  return found ? found.code : "";
}

/** Each FlatList's PROP list — everything up to `renderItem`, which is always
 *  last and would drag the row styling in with it. */
function flatLists(source: string): string[] {
  const out: string[] = [];
  let i = source.indexOf("<FlatList");
  while (i !== -1) {
    const end = source.indexOf("renderItem", i);
    out.push(source.slice(i, end > i ? end : i + 900));
    i = source.indexOf("<FlatList", i + 1);
  }
  return out;
}

/** The percentage a sheet clamps itself to, or null for a full-screen modal. */
function maxHeightPercent(source: string): number | null {
  const m = /maxHeight\s*:\s*"(\d+)%"/.exec(source);
  return m ? Number(m[1]) : null;
}

/** A bottom sheet on SwipeDownSheet is clamped by the component's detents
 *  (COLLAPSED_FRACTION of the window, draggable up to the top inset) instead of
 *  a percentage of its own. */
function usesSheetDetents(source: string): boolean {
  return source.includes("<SwipeDownSheet");
}

const CLAMPED = SHEETS.filter(
  (s) => maxHeightPercent(s.code) !== null || usesSheetDetents(s.code),
);

describe("every modal option list", () => {
  it("is found by the scan at all", () => {
    expect(SHEETS.map((s) => s.file).sort()).toEqual(expect.arrayContaining(KNOWN));
    expect(SHEETS.length).toBeGreaterThanOrEqual(KNOWN.length);
  });

  it("INVARIANT: measures the bottom inset instead of guessing at a constant", () => {
    const offenders = SHEETS.filter(
      (s) => !/useSafeAreaInsets\(\)/.test(s.code) || !/insets\.bottom/.test(s.code),
    ).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("still picks an option in ONE tap with a keyboard up", () => {
    // These sheets host a search box and Android keeps the keyboard over a
    // Modal; without this the first tap only dismisses it.
    const offenders = SHEETS.filter((s) =>
      flatLists(s.code).some((l) => !/keyboardShouldPersistTaps="handled"/.test(l)),
    ).map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});

describe("a sheet clamped by a height cap", () => {
  it("is the bottom sheet and the centred dialog — the two that sit off the window edge", () => {
    expect(CLAMPED.map((s) => s.file).sort()).toEqual([
      PROFILE_SHEET,
      "features/tests/SelectField.tsx",
    ]);
  });

  it("INVARIANT: pads the list CONTENT, so the LAST row scrolls clear of the edge", () => {
    // Container padding moves the list's frame; only content padding moves the
    // end of the scrollable content. The full-screen modals (PhoneField, the
    // parent picker) are exempt on purpose: their list ends above a Close row
    // that already sits inside the inset padding.
    const offenders = CLAMPED.filter((s) =>
      flatLists(s.code).some((l) => !/contentContainerStyle=\{\{[^}]*paddingBottom/.test(l)),
    ).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("keeps the list elastic — never a hardcoded height", () => {
    // A pixel height fits one device and clips or floats on every other, and is
    // the one thing that would stop the shrink-and-scroll behaviour.
    const offenders = CLAMPED.filter((s) =>
      flatLists(s.code).some((l) => /\bheight\s*:\s*\d/.test(l)),
    ).map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("leaves the list a usable share of the screen", () => {
    // 70% was the old value in both files and it is too tight — see the
    // geometry below. 85% is the arena dialogs' number. A bottom sheet on
    // SwipeDownSheet opens at the owner's 80% detent (2026-10-10: a sheet must
    // not open up into the camera cutout) and drags up to the full window,
    // which is what buys back the rows the lower cap costs.
    for (const s of CLAMPED) {
      if (usesSheetDetents(s.code)) {
        // One cap, the component's: a percentage here as well would fight it.
        expect(maxHeightPercent(s.code)).toBeNull();
        expect(COLLAPSED_FRACTION).toBeGreaterThanOrEqual(0.8);
      } else {
        expect(maxHeightPercent(s.code)).toBeGreaterThanOrEqual(85);
      }
    }
  });
});

describe("geometry on a 320x568 phone with a three-button navigation bar", () => {
  // The worst realistic case for the reported sheet: the District picker in
  // Baku lists 12 rayons, which is exactly SEARCH_MIN_ITEMS, so the search box
  // is on screen above the list as well.
  const WINDOW_H = 568;
  const NAV_BAR = 48; // three-button bar; the gesture pill is ~24
  const STATUS = 24; // the top inset the expanded detent stops under
  const LINE = 20;
  /** One option row: paddingVertical spacing.md top and bottom + one line. */
  const ROW = 2 * spacing.md + LINE;
  /** Everything above the list inside the sheet, in real tokens. */
  // The card's top padding is now the SwipeDownSheet handle strip (it replaces
  // paddingTop), so the chrome starts with the strip, not padding + a 4pt bar.
  const CHROME =
    HANDLE_STRIP +
    spacing.md + // swipe-to-dismiss handle strip + gap
    LINE +
    spacing.md + // title + gap
    48 +
    spacing.md; // search box + gap

  function rowsFullyVisible(pct: number): number {
    return rowsInCard((WINDOW_H * pct) / 100);
  }

  function rowsInCard(height: number): number {
    // The sheet's bottom padding is insets.bottom + spacing.xl, and
    // insets.bottom IS the navigation bar — that is what the fix buys.
    const list = height - CHROME - (NAV_BAR + spacing.xl);
    return Math.floor((list - spacing.md) / ROW); // less the content padding
  }

  const detents = sheetDetents(WINDOW_H, STATUS);

  it("is on the detent sheet, so both detents below apply to it", () => {
    expect(usesSheetDetents(sheet(PROFILE_SHEET))).toBe(true);
  });

  it("opens showing five options, with the rest reachable by scrolling", () => {
    // Was six at the old 88% cap. The owner's 80% opening cap costs one row on
    // this, the smallest phone we ship to — no chrome trim recovers it (even the
    // pre-handle chrome needs a 472pt card for six rows; 80% is 454) — and the
    // expanded detent below is what pays it back.
    expect(rowsInCard(detents.collapsed)).toBeGreaterThanOrEqual(5);
  });

  it("shows at least seven once the handle drags it up to the top inset", () => {
    expect(detents.full).toBe(WINDOW_H - STATUS);
    expect(rowsInCard(detents.full)).toBeGreaterThanOrEqual(7);
  });

  it("shows why 70% moved: it left barely four rows once the bar was cleared", () => {
    expect(rowsFullyVisible(70)).toBeLessThan(6);
  });
});

describe("the surface the bug was reported on", () => {
  it("Ranking's picker is one of the sheets these rules cover", () => {
    // If Ranking is ever repointed at a different picker, this fails and the
    // new one has to earn its place in the scan above.
    const ranking = code(resolve(SRC, "features/ranking/RankingScreen.tsx"));
    const m = /import \{ SelectField \} from "@\/(.+?)"/.exec(ranking);
    expect(m).not.toBeNull();
    const file = (m as RegExpExecArray)[1] + ".tsx";
    expect(SHEETS.map((s) => s.file)).toContain(file);
    expect(CLAMPED.map((s) => s.file)).toContain(file);
  });

  it("pins the sheet container's padding to SheetShell's rule", () => {
    // The single line the whole bug report comes down to.
    expect(sheet(PROFILE_SHEET)).toMatch(/paddingBottom:\s*insets\.bottom \+ spacing\.xl/);
  });
});
