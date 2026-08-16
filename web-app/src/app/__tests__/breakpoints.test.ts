// BREAKPOINT DRIFT GUARD for globals.css.
//
// The stylesheet accumulated 23 distinct `max-width` values and 3 `min-width`
// values across ~13.7k lines. Clusters 20px apart (440/460/480, 680/700/720,
// 760/768/780) are why two adjacent components change layout at different
// widths and the app feels inconsistent between, say, 430px and 480px.
//
// The end state is FIVE breakpoints — 480 / 640 / 768 / 1024 / 1280 — but
// rewriting 26 media queries across a file with no browser coverage is a
// separate, riskier job than the responsive pass that added this test. So this
// guard does the half that is safe and durable TODAY:
//
//   1. Any width value that is neither an approved token nor an explicitly
//      frozen legacy value fails the build. A NEW off-scale breakpoint can no
//      longer be added quietly — which is the only thing that stops the sprawl
//      from growing back while the consolidation waits.
//   2. Every frozen legacy value must still be IN USE. The list can therefore
//      only ever shrink: consolidating 460px into 480px forces its removal
//      here, and the day the list is empty the five-token rule is real with no
//      further work.
//   3. The responsive-pass block at the end of the file — the only part written
//      against the five-token scale — is held to tokens only, with no legacy
//      escape hatch.
//
// Non-width media features (`prefers-reduced-motion`, `pointer`, `hover`) are
// deliberately ignored: they are capability queries, not layout breakpoints.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../globals.css", import.meta.url)), "utf8");

/** The target scale. New rules must use these and nothing else. */
const APPROVED = [480, 640, 768, 1024, 1280] as const;

/**
 * Pre-existing values, frozen. NOT an approval — a to-do list. Every entry here
 * is a breakpoint the consolidation still has to fold into the scale above.
 */
const LEGACY_MAX = [
  380, 420, 440, 460, 520, 560, 620, 680, 700, 720, 760, 780, 820, 860, 900, 940, 1020,
  1100, 1279,
] as const;
const LEGACY_MIN = [681, 720, 860] as const;

/** Marks the start of the responsive pass, which is token-only. */
const RESPONSIVE_BLOCK_MARKER = "RESPONSIVE PASS";

type Width = { kind: "max" | "min"; px: number };

function widthsIn(source: string): Width[] {
  const found: Width[] = [];
  for (const media of source.matchAll(/@media[^{]*/g)) {
    for (const feature of media[0].matchAll(/\(\s*(max|min)-width\s*:\s*([\d.]+)px\s*\)/g)) {
      found.push({ kind: feature[1] as "max" | "min", px: Number(feature[2]) });
    }
  }
  return found;
}

const all = widthsIn(css);
const uniq = (kind: "max" | "min") =>
  [...new Set(all.filter((w) => w.kind === kind).map((w) => w.px))].sort((a, b) => a - b);

describe("globals.css breakpoints", () => {
  it("finds the media queries at all (guards against a broken parser)", () => {
    // A regex that silently matched nothing would make every other check here
    // pass vacuously, which is the worst possible failure mode for a guard.
    expect(all.length).toBeGreaterThan(40);
  });

  it("uses no width outside the approved scale or the frozen legacy list", () => {
    const allowedMax = new Set<number>([...APPROVED, ...LEGACY_MAX]);
    const allowedMin = new Set<number>([...APPROVED, ...LEGACY_MIN]);
    expect(uniq("max").filter((px) => !allowedMax.has(px))).toEqual([]);
    expect(uniq("min").filter((px) => !allowedMin.has(px))).toEqual([]);
  });

  it("keeps the frozen legacy list free of dead entries", () => {
    const usedMax = new Set(uniq("max"));
    const usedMin = new Set(uniq("min"));
    expect(LEGACY_MAX.filter((px) => !usedMax.has(px))).toEqual([]);
    expect(LEGACY_MIN.filter((px) => !usedMin.has(px))).toEqual([]);
  });

  it("holds the responsive-pass block to the approved scale only", () => {
    const start = css.indexOf(RESPONSIVE_BLOCK_MARKER);
    expect(start).toBeGreaterThan(0);
    const approved = new Set<number>(APPROVED);
    const offScale = widthsIn(css.slice(start)).filter((w) => !approved.has(w.px));
    expect(offScale).toEqual([]);
  });
});
