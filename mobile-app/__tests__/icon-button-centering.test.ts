import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HEADER_BACK_GLYPH_SIZE,
  HEADER_BUTTON_HIT_SLOP,
  HEADER_BUTTON_SIZE,
  HEADER_GLYPH_SIZE,
  MIN_TOUCH_TARGET,
  headerButtonBox,
  iconButtonBox,
  touchSpan,
} from "@/components/iconButtonLayout";

// AN ICON IN A BUTTON IS CENTRED BY THE BUTTON.
//
// The owner reported from a TestFlight build (2026-09-17) that the glyphs in
// the header buttons sit off-centre on both iPad and iPhone. Two causes, and
// each is a one-line edit away from coming back:
//
//   1. The back chevron was pinned to the LEFT of its box (`alignItems:
//      "flex-start"`), carrying a comment that justified it. Since iOS 26 the
//      SYSTEM draws a rounded container behind a navigation-bar button, and it
//      centres nothing inside — so the glyph sat visibly left of the middle of
//      a circle this repository does not draw.
//   2. The home button drew a 34pt chip of its own, which then nested inside
//      that system container: a chip in a chip on the right of the bar against
//      a plain container on the left.
//
// So this file pins both the SHAPE (a fixed square that centres its content)
// and the SIZE (one box for all four header buttons, because the container the
// platform draws is sized to the view we hand it).
const SRC = resolve(__dirname, "..", "src");

function read(...parts: string[]): string {
  return readFileSync(resolve(SRC, ...parts), "utf8");
}

/** Source with comments blanked: prose ABOUT a style must not satisfy a test
 *  that the style is set — this file's own history is written in comments. */
function code(source: string): string {
  return source
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

/**
 * The props of the FIRST <Pressable> in a file — everything from the tag name
 * to the `>` that ends the opening tag, counting `{…}` so a style callback or
 * an arrow body cannot end the scan early. Each of these components opens with
 * the button itself, and what sits INSIDE it (a badge, a ring) may size itself;
 * the button may not.
 */
function pressableProps(source: string): string {
  const at = source.indexOf("<Pressable");
  if (at < 0) throw new Error("no <Pressable> in this component");
  let depth = 0;
  for (let i = at; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return source.slice(at, i);
  }
  throw new Error("unterminated <Pressable>");
}

/** The four header controls, as the user meets them: left, then right. */
const HEADER_BUTTONS = [
  ["back chevron", "BackButton.tsx"],
  ["home glyph", "HeaderHomeButton.tsx"],
  ["notification bell", "HeaderBell.tsx"],
  ["account avatar", "HeaderAvatarButton.tsx"],
] as const;

describe("iconButtonBox", () => {
  it("is a fixed square that centres whatever is put in it", () => {
    expect(iconButtonBox(34)).toEqual({
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
    });
  });

  it("centres on BOTH axes — a row-centred glyph can still be left of middle", () => {
    // `alignItems` alone is what the back button had, and it is exactly half
    // the fix: the glyph was vertically centred and horizontally pinned.
    const box = iconButtonBox(44);
    expect(box.alignItems).toBe("center");
    expect(box.justifyContent).toBe("center");
  });

  it("gives the header its box", () => {
    expect(headerButtonBox).toEqual(iconButtonBox(HEADER_BUTTON_SIZE));
  });
});

describe("every header button is the same box", () => {
  it.each(HEADER_BUTTONS)("the %s draws itself into the shared box", (_name, file) => {
    const props = pressableProps(code(read("components", file)));
    expect(props).toContain("headerButtonBox");
    // A size of its OWN on the button is how the four drifted apart before.
    expect(props).not.toMatch(/\bwidth:/);
    expect(props).not.toMatch(/\bheight:/);
  });

  it.each(HEADER_BUTTONS)("the %s centres its glyph, never pins it", (_name, file) => {
    const src = code(read("components", file));
    expect(src).not.toContain('alignItems: "flex-start"');
    expect(src).not.toContain('alignItems: "flex-end"');
  });

  it("the home button draws no container of its own", () => {
    // The platform draws one on iOS 26; a second one nested inside it is the
    // chip-in-a-chip from the report. The bell beside it has always been bare.
    const src = code(read("components", "HeaderHomeButton.tsx"));
    expect(src).not.toContain("backgroundColor");
    expect(src).not.toContain("borderWidth");
    expect(src).not.toContain("borderRadius");
  });

  it("the avatar keeps its ring, because that ring CLIPS a photograph", () => {
    // The one exception, and it is not decoration: a child's photo has to be
    // masked to a circle. It is 32 + two 1pt edges = the shared 34pt box.
    const src = code(read("components", "HeaderAvatarButton.tsx"));
    expect(src).toContain("borderRadius");
    expect(src).toContain("AVATAR_SIZE = 32");
  });

  it("the back glyph is not nudged off centre by anything", () => {
    // Lucide's ChevronLeft ("m15 18-6-6 6-6") and ArrowLeft ("M19 12H5") are
    // both symmetric about x=12 of the 24 grid, so there is nothing to correct
    // — and a nudge would restore a slice of the offset being fixed here.
    const src = code(read("components", "BackButton.tsx"));
    expect(src).not.toContain("marginLeft");
    expect(src).not.toContain("translateX");
    expect(src).not.toContain("paddingLeft");
  });
});

describe("touch targets survive the smaller box", () => {
  /** The `hitSlop={…}` each button declares, resolved to a number. */
  function hitSlop(file: string): number {
    const m = code(read("components", file)).match(/hitSlop=\{(\d+|HEADER_BUTTON_HIT_SLOP)\}/);
    if (!m) throw new Error(`${file} declares no hitSlop`);
    return m[1] === "HEADER_BUTTON_HIT_SLOP" ? HEADER_BUTTON_HIT_SLOP : Number(m[1]);
  }

  it.each(HEADER_BUTTONS)("the %s stays tappable", (_name, file) => {
    // 34pt is a deliberately small box — it keeps the centred title its width
    // on a 320pt screen — so the minimum is met with INVISIBLE slop instead.
    expect(touchSpan(HEADER_BUTTON_SIZE, hitSlop(file))).toBeGreaterThanOrEqual(
      MIN_TOUCH_TARGET,
    );
  });

  it("meets the LARGER of the two platform minimums", () => {
    // iOS HIG asks 44pt, Material 48dp. One number has to clear both.
    expect(MIN_TOUCH_TARGET).toBe(48);
  });
});

describe("glyph sizes read as one family", () => {
  it("gives the chevron more nominal size than the house and the bell", () => {
    // Optical WEIGHT, not position: lucide draws a chevron as 6 units of ink
    // across the 24 grid where a house covers 18, so an equal number would
    // make the back arrow the faintest thing in the bar.
    expect(HEADER_BACK_GLYPH_SIZE).toBeGreaterThan(HEADER_GLYPH_SIZE);
    // But not so much more that it breaks out of the 34pt box.
    expect(HEADER_BACK_GLYPH_SIZE).toBeLessThan(HEADER_BUTTON_SIZE);
  });

  it("sizes the bell and the home glyph identically — they share one slot", () => {
    const bell = code(read("components", "HeaderBell.tsx"));
    const home = code(read("components", "HeaderHomeButton.tsx"));
    expect(bell).toContain("size={HEADER_GLYPH_SIZE}");
    expect(home).toContain("size={HEADER_GLYPH_SIZE}");
  });
});

describe("in-content icon buttons follow the same rule", () => {
  it("the password reveal is a centred square, not padding around a glyph", () => {
    const src = code(read("components", "TextField.tsx"));
    expect(src).toContain("iconButtonBox(44)");
    expect(src).not.toContain("paddingHorizontal: spacing.md, paddingVertical: spacing.sm");
    // 44 + 4 + 4 = 52, past Material's 48dp as well as the iOS 44pt.
    expect(touchSpan(44, 4)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});
