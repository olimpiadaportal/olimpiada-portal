// THE STAR FIELD IS VISIBLE ONLY BECAUSE OF A TWO-NODE ARRANGEMENT, AND ONE
// ORDINARY-LOOKING EDIT UNDOES IT ON EVERY SCREEN AT ONCE.
//
// The field is not mounted at the root. components/StarField.tsx explains why
// at length: the screen background is painted opaquely in five independent
// places, so a layer behind all of them is never seen. It is mounted in the
// three SHARED bodies instead — `Screen` (both its static and its scrolling
// branch), `ScreenScroll` and `ArenaScroll` — which between them are the body
// of roughly seventeen real screens.
//
// The arrangement each of those bodies has to keep is exactly this:
//
//     <View style={{ flex: 1, backgroundColor: <the ground> }}>   <- paints
//       <StarField />                                             <- texture
//       <ScrollView ...>                                          <- MUST BE
//         {children}                                                TRANSPARENT
//
// The background lives on the WRAPPER and the scroll container carries none.
// Moving `backgroundColor` back down onto the ScrollView — where it sat before,
// where it looks like it belongs, and where a future edit will reach for it
// first — is a one-word change that compiles, renders, keeps every colour
// identical in light mode, passes every other test in this suite, and silently
// hides the field on all seventeen screens. Nothing else notices. Hence this
// file.
//
// Source assertions: the wrappers are .tsx, this suite is .ts-only
// (package.json testMatch), and the failure mode is a DELETION or a MOVE, not a
// behaviour a render test would catch — a hidden field renders perfectly.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

/** The three shared bodies, by the wrapper each one exports. */
const WRAPPERS = [
  ["Screen (static + scrolling)", "src/components/Screen.tsx", 2],
  ["ScreenScroll (parent surfaces)", "src/features/parent/ui.tsx", 1],
  ["ArenaScroll (student surfaces)", "src/features/arena/ui.tsx", 1],
] as const;

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8").split("\r\n").join("\n");
}

/** Source with block, line and JSX comments blanked out. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * The opening tag that starts at `from`, brace- and quote-aware.
 *
 * A JSX tag cannot be matched with a regex here: every one of these carries
 * `style={{ ... }}` objects holding `>` inside ternaries and nested braces, so
 * "up to the first `>`" truncates the tag in the middle of the very prop this
 * file is reading.
 */
function openingTag(text: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return text.slice(from, i + 1);
  }
  throw new Error("unterminated tag at " + from);
}

/** Index of the element opened immediately after `from`. */
function nextElement(text: string, from: number): number {
  const m = /<[A-Za-z]/.exec(text.slice(from));
  if (!m) throw new Error("no element after " + from);
  return from + (m.index ?? 0);
}

describe("the shared bodies keep mounting the star field", () => {
  it.each(WRAPPERS.map(([name, path, count]) => [name, path, count] as const))(
    "%s still mounts it",
    (_name, path, count) => {
      const text = code(source(path));
      expect(text).toContain('import { StarField }');
      // Counted, not merely present: `Screen` has TWO bodies (with and without
      // a scroll), and the static one losing its field would be invisible here
      // if a single occurrence were enough.
      expect(text.split("<StarField />").length - 1).toBe(count);
    },
  );

  it.each(WRAPPERS.map(([name, path]) => [name, path] as const))(
    "%s paints the ground on the wrapper and leaves the layer above it transparent",
    (_name, path) => {
      const text = code(source(path));
      let at = text.indexOf("<StarField />");
      expect(at).toBeGreaterThan(-1);

      while (at > -1) {
        // The node the field sits ON must be the one carrying the paint —
        // otherwise the field is drawn over a transparent parent and the
        // opaque colour is somewhere further out, above it.
        const ground = openingTag(text, text.lastIndexOf("<View", at));
        expect(ground).toContain("flex: 1");
        expect(ground).toMatch(/backgroundColor:/);

        // And the node the field sits UNDER must carry none. This is the
        // regression: a ScrollView (or the padded body View) with its own
        // background covers the field completely.
        const sibling = openingTag(text, nextElement(text, at + "<StarField />".length));
        expect(sibling).not.toMatch(/backgroundColor/);

        at = text.indexOf("<StarField />", at + 1);
      }
    },
  );

  // `Screen`'s static body receives its style as `[{ flex: 1 }, bodyPadding]`,
  // so the tag sweep above sees an IDENTIFIER rather than the object. Read the
  // object too: it is the one place in these three files where a background
  // could be reintroduced without appearing in any tag.
  it("keeps Screen's shared padding object free of a background", () => {
    const text = code(source("src/components/Screen.tsx"));
    const start = text.indexOf("const bodyPadding = {");
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf("} as const;", start);
    expect(end).toBeGreaterThan(start);
    expect(text.slice(start, end)).not.toMatch(/backgroundColor/);
  });

  // The field is texture, not content. If it ever starts taking touches it
  // breaks every screen it is mounted on at once, and a pressable that no
  // longer responds is a much harder bug to trace back to a backdrop.
  it("stays untouchable, unannounced and dark-mode only", () => {
    const text = code(source("src/components/StarField.tsx"));
    expect(text).toContain('pointerEvents="none"');
    expect(text).toContain("accessibilityElementsHidden");
    expect(text).toContain('theme !== "dark"');
    expect(text).toContain("StyleSheet.absoluteFillObject");
  });
});
