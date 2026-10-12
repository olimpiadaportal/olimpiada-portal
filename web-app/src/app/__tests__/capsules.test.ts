// Capsules stay capsules (2026-10-12).
//
// A 999px radius is only correct while the element is one line tall. The child
// switcher on /subscription wrapped 13 children onto three rows inside a
// capsule-shaped rail, and the rail's curved ends cut through the corner
// children. These assertions pin the two halves of the fix.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const css = read("src/app/globals.css");
const segmented = read("src/components/Segmented.tsx");

describe("a segmented rail that wraps is a rounded rectangle, not a stadium", () => {
  it("Segmented detects wrapping and publishes a concentric radius", () => {
    expect(segmented).toContain('el.setAttribute("data-seg-wrap", "1")');
    expect(segmented).toContain("--seg-wrap-radius");
    // option radius + the rail's own padding and border
    expect(segmented).toMatch(/itemRadius \+ inset/);
  });

  it("the wrapped rail uses that radius, never the capsule one", () => {
    expect(css).toMatch(
      /\.seg-track\[data-seg\]\[data-seg-wrap="1"\]\s*\{\s*border-radius:\s*min\(var\(--seg-track-radius, 999px\), var\(--seg-wrap-radius, 20px\)\);/,
    );
  });
});

describe("no capsule both wraps and keeps a 999px radius", () => {
  it("every rule that sets a 999px radius and flex-wrap: wrap is overridden", () => {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const offenders: string[] = [];
    for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim().replace(/\s+/g, " ");
      if (/border-radius:\s*(999|9999)px/.test(m[2]) && /flex-wrap:\s*wrap/.test(m[2])) {
        offenders.push(sel);
      }
    }
    // .lbchip is the only one, and the capsule block turns its wrapping off.
    expect(offenders).toEqual([".lbchip"]);
    expect(flat).toMatch(/\.lbchip \{\s*flex-wrap: nowrap;/);
  });
});
