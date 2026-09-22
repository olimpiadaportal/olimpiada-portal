// THE NIGHT SKY IS A SET OF NUMBERS THAT ONLY LOOK INDEPENDENT.
//
// The dark-mode backdrop in globals.css was rewritten on 2026-09-22: it used to
// twinkle (two whole-layer opacity cycles, nothing moving) and it now DRIFTS,
// each layer translating at its own velocity and its own angle. That is a
// prettier effect held together by arithmetic, and there is no browser harness
// in this repo — vitest runs in node, and jsdom has no layout engine — so
// nothing can prove the sky looks right. What this file CAN prove is that the
// numbers still agree with each other, which is where every plausible
// regression lives:
//
//   * EACH LOOP TRAVELS EXACTLY ONE TILE IN EACH AXIS. That identity is the
//     only reason the animation has no seam: at 100% the repeating background
//     is pixel-identical to 0%. Somebody who wants it faster will reach for the
//     translate before the duration, and the field will then jump once per
//     iteration, forever, on every page in dark mode.
//   * THE LAYER IS BIGGER THAN THE VIEWPORT BY ITS OWN TRAVEL, on the two sides
//     it travels towards. Get the side wrong and a blank wedge crawls in from
//     one edge. This is invisible in a diff: `left: 0` and `left: -240px` look
//     equally plausible next to each other.
//   * THE TWO LAYERS MOVE AT DIFFERENT SPEEDS, and the nearer one is the faster
//     and the larger and the sparser. That spread IS the parallax; flatten any
//     column of it and the effect reverts to one field at two speeds, which is
//     the exact thing the rewrite replaced.
//   * IT IS COMPOSITOR-ONLY. `background-position` would be the obvious way to
//     scroll a tiled background and it repaints a viewport-sized gradient layer
//     on every frame, on phones, behind every page.
//   * BRIGHTNESS IS A READABILITY BUDGET. The field is painted behind all the
//     content there is; the low alphas are the whole reason it never competes
//     with a line of text.
//
// If one of these starts failing, read the block in globals.css before deleting
// the assertion: each check names the thing it is holding still.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../globals.css", import.meta.url)), "utf8");

/** The block, isolated — a match elsewhere in the 14.7k-line file cannot satisfy
 *  a check here. It ends where the next documented block begins. */
const RAW = (() => {
  const title = css.indexOf("   NIGHT SKY");
  const end = css.indexOf("/* --- P12: the parent area");
  if (title < 0 || end < 0 || end < title) throw new Error("night sky block not found");
  // From the comment's OPENER, not from the title inside it: slicing into the
  // middle of a comment leaves an unterminated `/*` that the stripper below
  // cannot match, and the block's own prose then answers every `toContain`.
  return css.slice(css.lastIndexOf("/*", title), end);
})();

const BLOCK = RAW.replace(/\/\*[\s\S]*?\*\//g, " ");

type Rule = { selector: string; body: string };

/** Every rule in `source`, at-rules included and also descended into. */
function rulesIn(source: string): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  let start = 0;
  while (i < source.length) {
    if (source[i] !== "{") {
      i++;
      continue;
    }
    let depth = 1;
    let j = i + 1;
    while (j < source.length && depth > 0) {
      if (source[j] === "{") depth++;
      else if (source[j] === "}") depth--;
      j++;
    }
    const selector = source.slice(start, i).trim();
    const body = source.slice(i + 1, j - 1);
    out.push({ selector, body });
    if (selector.startsWith("@")) out.push(...rulesIn(body));
    i = j;
    start = j;
  }
  return out;
}

const RULES = rulesIn(BLOCK);

function declaration(body: string, property: string): string | null {
  const match = new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+);`).exec(body);
  return match ? match[1].trim().replace(/\s+/g, " ") : null;
}

/** The rule that drives `name`, and the keyframes it drives. */
function layer(name: string) {
  const rule = RULES.find((r) => declaration(r.body, "animation-name") === name);
  if (!rule) throw new Error(`no rule sets animation-name: ${name}`);
  const frames = RULES.find((r) => r.selector === `@keyframes ${name}`);
  if (!frames) throw new Error(`no @keyframes ${name}`);

  const size = declaration(rule.body, "background-size");
  const tile = /^(\d+)px (\d+)px$/.exec(size ?? "");
  if (!tile) throw new Error(`${name}: background-size must be two px values, got ${size}`);

  const duration = /^([\d.]+)s$/.exec(declaration(rule.body, "animation-duration") ?? "");
  if (!duration) throw new Error(`${name}: animation-duration must be in seconds`);

  const travel = /to\s*\{[^}]*translate3d\(\s*(-?\d+)px,\s*(-?\d+)px,\s*0\s*\)/.exec(frames.body);
  if (!travel) throw new Error(`${name}: no translate3d endpoint in its 'to' frame`);
  const home = /from\s*\{[^}]*transform:\s*translate3d\(0, 0, 0\)/.test(frames.body);

  const dx = Number(travel[1]);
  const dy = Number(travel[2]);
  const seconds = Number(duration[1]);

  return {
    name,
    rule,
    frames,
    home,
    tileW: Number(tile[1]),
    tileH: Number(tile[2]),
    dx,
    dy,
    seconds,
    speed: Math.hypot(dx, dy) / seconds,
    /** The `0 <r>px` stop of every radial-gradient in the layer. */
    radii: [...rule.body.matchAll(/\s0\s([\d.]+)px,/g)].map((m) => Number(m[1])),
  };
}

const FAR = layer("sky-drift-far");
const NEAR = layer("sky-drift-near");

describe("the drift loop is seamless", () => {
  it.each([
    ["far", FAR],
    ["near", NEAR],
  ])("%s layer travels exactly one tile in each axis", (_name, l) => {
    // The whole seamlessness argument in two assertions: the background repeats
    // every tile, so a translation of one tile lands on an identical sky.
    expect(Math.abs(l.dx)).toBe(l.tileW);
    expect(Math.abs(l.dy)).toBe(l.tileH);
  });

  it.each([
    ["far", FAR],
    ["near", NEAR],
  ])("%s layer starts at its home position and rises", (_name, l) => {
    expect(l.home).toBe(true);
    // Negative Y is upward. A field that falls is a different design decision,
    // not a typo, and should arrive with its comment rewritten.
    expect(l.dy).toBeLessThan(0);
  });

  it.each([
    ["far", FAR],
    ["near", NEAR],
  ])("%s layer is oversized on exactly the sides it travels towards", (_name, l) => {
    // Up, always — so the slack is at the bottom.
    expect(declaration(l.rule.body, "height")).toBe(`calc(100% + ${l.tileH}px)`);
    expect(declaration(l.rule.body, "width")).toBe(`calc(100% + ${l.tileW}px)`);
    // And sideways, whichever way it goes: travelling RIGHT exposes the LEFT
    // edge, so the box has to start one tile to the left of the viewport.
    expect(declaration(l.rule.body, "left")).toBe(l.dx > 0 ? `-${l.tileW}px` : "0");
  });

  it("runs both layers at a constant rate, forever", () => {
    const shared = RULES.find((r) => declaration(r.body, "content") === '""');
    expect(shared).toBeDefined();
    // Anything eased is a particle visibly on a timer; anything finite ends
    // mid-page with no way to notice in review.
    expect(declaration(shared!.body, "animation-timing-function")).toBe("linear");
    expect(declaration(shared!.body, "animation-iteration-count")).toBe("infinite");
  });
});

describe("the two layers are a statement about depth", () => {
  it("moves the near layer markedly faster than the far one", () => {
    expect(NEAR.speed).toBeGreaterThan(FAR.speed);
    // Under about 2x the pair reads as one field with sloppy timing rather than
    // as two distances.
    expect(NEAR.speed / FAR.speed).toBeGreaterThanOrEqual(2);
  });

  it("keeps the near layer at a clearly noticeable but unhurried speed", () => {
    // The owner's brief, in one assertion: "a clearly noticeable, moderate
    // speed — not extremely slowly". Below ~15px/s it reads as static, which
    // was the complaint about the version this replaced; above ~40 it starts
    // competing with the content for attention.
    expect(NEAR.speed).toBeGreaterThanOrEqual(15);
    expect(NEAR.speed).toBeLessThanOrEqual(40);
  });

  it("gives the two layers different angles, not just different speeds", () => {
    // Same direction at two speeds still reads as one field. Opposite lateral
    // components are what make the parallax legible.
    expect(Math.sign(FAR.dx)).not.toBe(Math.sign(NEAR.dx));
  });

  it("makes the near layer sparser and its particles larger", () => {
    // Density is per tile area, so compare the rate rather than the count.
    const farDensity = FAR.radii.length / (FAR.tileW * FAR.tileH);
    const nearDensity = NEAR.radii.length / (NEAR.tileW * NEAR.tileH);
    expect(nearDensity).toBeLessThan(farDensity);
    expect(Math.min(...NEAR.radii)).toBeGreaterThan(Math.max(...FAR.radii));
  });
});

describe("the field costs nothing to run and nothing to read", () => {
  it("animates transform and nothing else", () => {
    // `background-position` is the obvious way to scroll a tiled background and
    // it repaints a viewport-sized gradient layer every frame. `opacity` is the
    // twinkle this rewrite removed; it must not come back as a quick fix.
    for (const frames of [FAR.frames, NEAR.frames]) {
      expect(frames.body).toContain("transform:");
      expect(frames.body).not.toContain("background-position");
      expect(frames.body).not.toContain("opacity");
    }
    expect(BLOCK).not.toContain("will-change");
  });

  it("stays behind everything and swallows no clicks", () => {
    const shared = RULES.find((r) => declaration(r.body, "content") === '""')!;
    expect(declaration(shared.body, "position")).toBe("fixed");
    expect(declaration(shared.body, "z-index")).toBe("-1");
    expect(declaration(shared.body, "pointer-events")).toBe("none");
  });

  it("keeps every particle faint enough to read text over", () => {
    const alphas = [...BLOCK.matchAll(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/g)];
    expect(alphas.length).toBeGreaterThan(20);
    for (const [, raw] of alphas) {
      // 0.15 of #d6e0ff over the #0a0e1a canvas composites to about #242c44,
      // which is dimmer than --border (#26314f) — the hairline already drawn on
      // that same ground. A particle brighter than a border reads as content.
      expect(Number(raw)).toBeLessThanOrEqual(0.15);
    }
  });

  it("paints in ONE ink, taken from a dark token rather than invented", () => {
    // --chip-text. If the token moves, this fails on purpose: globals.css says
    // in as many words that the field is derived from the palette, and a silent
    // divergence would make that comment a lie. The previous version of the
    // block carried two extra hex values that were tokens nowhere and were
    // described as the arena blue and gold, which they also were not — exactly
    // the drift this assertion exists to prevent.
    const dark = /\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css);
    expect(dark).not.toBeNull();
    const chip = /--chip-text:\s*#([0-9a-f]{6})/i.exec(dark![1]);
    expect(chip).not.toBeNull();
    const hex = chip![1];
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");

    const inks = new Set([...BLOCK.matchAll(/rgba\((\d+, \d+, \d+),/g)].map((m) => m[1]));
    expect([...inks]).toEqual([rgb]);
  });
});

describe("the field respects the platform and the page", () => {
  it("stops dead for prefers-reduced-motion but stays on screen", () => {
    const query = RULES.find((r) => r.selector.includes("prefers-reduced-motion: reduce"));
    expect(query).toBeDefined();
    const inner = rulesIn(query!.body)[0];
    expect(inner).toBeDefined();
    expect(declaration(inner.body, "animation")).toBe("none");
    // Without this the layer keeps whatever transform the animation last
    // committed, which parks it one tile off its home position.
    expect(declaration(inner.body, "transform")).toBe("none");
    // The sky itself is NOT removed: it is part of what the surface looks like,
    // and deleting it would change the design rather than only the motion.
    expect(inner.body).not.toContain("content: none");
    expect(inner.body).not.toContain("display: none");
    for (const pseudo of [
      'body::before',
      'body::after',
      '.app-shell > .arena::before',
      '.app-shell > .arena::after',
    ]) {
      expect(inner.selector).toContain(pseudo);
    }
  });

  it("cannot reach light mode", () => {
    for (const rule of RULES) {
      if (rule.selector.startsWith("@")) continue;
      // The one documented exception: the arena's stacking context is created
      // in BOTH themes on purpose, so the app does not layer differently in
      // light than in dark. Its own comment in globals.css says why.
      if (rule.selector === ".app-shell > .arena") continue;
      // Keyframe stops are selectors too, and carry no theme.
      if (/^(from|to|\d+%)/.test(rule.selector)) continue;
      for (const part of rule.selector.split(",")) {
        expect(part.trim().startsWith('[data-theme="dark"]')).toBe(true);
      }
    }
  });

  it("keeps the arena a stacking context, unconditionally", () => {
    // z-index:-1 only resolves inside one. Without this the arena's layers
    // escape to the root context and the arena background paints over them.
    const arena = RULES.find((r) => r.selector === ".app-shell > .arena");
    expect(arena).toBeDefined();
    expect(declaration(arena!.body, "isolation")).toBe("isolate");
  });

  it("drops the body layers under the student shell rather than paying twice", () => {
    const suppressed = RULES.find((r) => declaration(r.body, "content") === "none");
    expect(suppressed).toBeDefined();
    expect(suppressed!.selector).toContain(":has(.app-shell > .arena)");
  });
});
