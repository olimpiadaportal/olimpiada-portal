// THE STAR FIELD'S MOTION IS A SET OF NUMBERS THAT ONLY LOOK INDEPENDENT.
//
// `star-field-mounts.test.ts` guards where the field is mounted. This file
// guards what it DOES, because the 2026-09-22 rewrite turned a twinkle into a
// drift and the drift has invariants that no compiler and no render test can
// see. Every one of them is a number somebody will want to nudge:
//
//   * The loop translates by exactly ONE TILE and the particle copies are
//     stacked one tile apart. That identity is the only reason the wrap is
//     invisible. "Make it a bit faster" by changing the translate rather than
//     the duration and the sky lurches once per iteration, forever.
//   * The sideways sway completes a WHOLE NUMBER of sine cycles per loop, for
//     exactly the same reason. `swayCycles: 1.5` compiles, looks fine for
//     thirty seconds, and then snaps sideways at the wrap.
//   * The three layers are a single statement about depth: closer means FEWER,
//     BIGGER, BRIGHTER and FASTER, all four at once. Change one column and the
//     field stops reading as depth and starts reading as one field at two
//     speeds — which is the exact failure the rewrite existed to fix.
//   * Brightness is a BAND, and BOTH ends are derived. The ceiling is a
//     readability budget: the field is painted behind everything, and it never
//     interferes with text because the brightest particle is no brighter than
//     the `border` token on the same ground. The FLOOR is the 2026-09-22
//     lesson — the first drift honoured the brief's "low opacity, sparse" half,
//     lost its "clearly noticeable, moderate and VISIBLE" half, and the owner
//     could not see the field at all, on an iPhone or on a 13" iPad. You cannot
//     perceive the motion of a particle you cannot perceive, so a floor under
//     the dimmest alpha is not polish: it is the difference between the effect
//     existing and not.
//   * Density is the same lesson with a different number. 25 particles per tile
//     is one per ~14,000pt^2 on a phone; the web field tiles at roughly one per
//     9,000 and reads as a field.
//   * The sway must not be able to carry a particle onto the edge of the
//     NARROWEST supported screen (320pt, root mobile CLAUDE.md).
//   * The animation must not depend on the measured height. It did in the
//     obvious implementation, and the symptom was the whole sky jumping when
//     the keyboard opened.
//
// Source assertions, like the sibling file: the component is .tsx and this
// suite is .ts-only (package.json testMatch). The layer table is read by
// evaluating the literal rather than by regexing each field — it is pure data,
// and a per-field regex is the kind of test that passes after the field it was
// watching has been renamed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(
  resolve(__dirname, "..", "src/components/StarField.tsx"),
  "utf8",
).split("\r\n").join("\n");

/** Source with block, line and JSX comments blanked out. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

type Layer = {
  count: number;
  size: number;
  alphaMin: number;
  alphaMax: number;
  speed: number;
  sway: number;
  swayCycles: number;
  swayPhase: number;
  seed: number;
};

/** The `const LAYERS: Layer[] = [...]` table, evaluated. */
function layers(): Layer[] {
  const start = CODE.indexOf("const LAYERS: Layer[] = [");
  expect(start).toBeGreaterThan(-1);
  const open = CODE.indexOf("[", start);
  const close = CODE.indexOf("\n];", open);
  expect(close).toBeGreaterThan(open);
  const literal = CODE.slice(open, close + 2);
  // The literal is pure data — numbers and hex seeds, no identifiers — and it
  // comes from this repository's own CODE, not from input.
  return new Function(`return ${literal}`)() as Layer[];
}

/** A `const NAME = <number>;` module constant. */
function constant(name: string): number {
  const match = new RegExp(`const ${name} = (-?[\\d.]+);`).exec(CODE);
  // Thrown rather than expected: this runs at module scope, where there is no
  // test to attribute the failure to.
  if (!match) throw new Error(`no module constant ${name}`);
  return Number(match[1]);
}

const LAYERS = layers();
const TILE = constant("TILE");
const EDGE = constant("EDGE");

/** The narrowest body the app supports — root mobile CLAUDE.md. */
const NARROWEST = 320;

// THE BRIGHTNESS BAND, in alpha over the dark ground. Both dark surfaces the
// field is painted on share that ground — APP_DARK.bg and ARENA_DARK.bg are
// both #100e0e — and the ink is #f3f3f1, so a particle at alpha a composites to
// about 16 + 227a per channel. Both ends below are arithmetic, not taste.

/**
 * CEILING. alpha 0.289 composites to #3f3d3d: 2.40:1 against the ground. Two
 * things bound it there. `muted` (#9b9999) is the dimmest TEXT colour in the
 * palette at 7.4:1, so the brightest particle is nowhere near reading as type;
 * and 3:1 is where WCAG treats a graphical object as reliably perceivable,
 * which is the line a backdrop should stay under. 2.40:1 sits clear of both.
 *
 * The web field is pinned to the SAME two ratios on its own palette
 * (web-app/src/app/__tests__/nightSky.test.ts), which is the only reason the
 * two platforms show one sky rather than two. Move this and move that.
 */
const CEILING = 0.289;

/**
 * FLOOR, and it is now the HAIRLINE — the inversion described above.
 * alpha 0.155 composites to #333131: 1.497:1 against the ground, where the
 * `border` token (#323230) is 1.498:1. The same hairline to within a code
 * value.
 *
 * WHY THIS IS THE FLOOR AND NOT THE CEILING, WHICH IS WHAT IT USED TO BE. Two
 * successive passes shipped a field the owner could not see at all — not on an
 * iPhone, not on a 13" iPad. The first topped out at 1.36:1, the second at
 * 1.50:1. Both bands lay at or below the dimmest thing this design already
 * draws and expects people to notice. A particle that has to be SEEN must
 * start where a hairline starts; anything under that is a decision to switch
 * the effect off while leaving the code that draws it in place.
 *
 * The +0.05 in the WCAG formula is what makes this the right anchor rather
 * than a raw code-value step: it stands in for the ambient light the glass
 * reflects back in a lit room, which is precisely what ate the earlier bands
 * on a phone in daylight while they looked fine on a monitor in a dim one.
 */
const PERCEPTIBLE = 0.155;

describe("the loop is seamless", () => {
  it("translates by exactly one tile and stacks the copies one tile apart", () => {
    // These two lines are the wrap. If the multiplier on either ever stops
    // being TILE, copy n+1 no longer lands where copy n was.
    expect(CODE).toContain("translateY: -TILE * progress.value");
    expect(CODE).toContain("top: copy * TILE + star.top");
  });

  it("never reverses: the third argument to withRepeat is false", () => {
    // `true` would make the field rise and then sink back — a pendulum, not a
    // drift — and it is the default people reach for.
    const repeat = /withRepeat\(([\s\S]*?)\n {4}\);/.exec(CODE);
    if (!repeat) throw new Error("withRepeat call not found in the expected shape");
    expect(repeat[1]).toContain("false");
    expect(repeat[1]).not.toContain("true");
  });

  it("moves at a constant rate — a particle on a visible easing curve is a particle on a timer", () => {
    expect(CODE).toContain("Easing.linear");
    expect(CODE).not.toMatch(/Easing\.(inOut|in|out|bezier)/);
  });

  it("sways a whole number of cycles per loop, starting inside one cycle", () => {
    for (const layer of LAYERS) {
      // Compared against its own rounding so a failure prints the offending
      // value rather than a bare `false`.
      expect(layer.swayCycles).toBe(Math.round(layer.swayCycles));
      expect(layer.swayCycles).toBeGreaterThan(0);
      expect(layer.swayPhase).toBeGreaterThanOrEqual(0);
      expect(layer.swayPhase).toBeLessThan(1);
    }
  });

  it("keeps the tile long enough that a phone needs only two copies", () => {
    // `ceil(h / TILE) + 1` copies. A tile shorter than a tall phone body turns
    // 50 leaf Views into 75 on the hardware least able to afford them.
    expect(TILE).toBeGreaterThanOrEqual(900);
  });
});

describe("the three layers say one thing about depth", () => {
  it("has three of them, ordered far to near", () => {
    expect(LAYERS).toHaveLength(3);
  });

  it.each([
    ["count", (l: Layer) => l.count, "down"],
    ["size", (l: Layer) => l.size, "up"],
    ["speed", (l: Layer) => l.speed, "up"],
    ["alphaMax", (l: Layer) => l.alphaMax, "up"],
    ["alphaMin", (l: Layer) => l.alphaMin, "up"],
  ] as const)("moves %s monotonically %s as the layers come closer", (_name, read, direction) => {
    const values = LAYERS.map(read);
    for (let i = 1; i < values.length; i++) {
      if (direction === "up") expect(values[i]).toBeGreaterThan(values[i - 1]);
      else expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it("separates the near and far velocities enough to be read as distance", () => {
    const slowest = LAYERS[0].speed;
    const fastest = LAYERS[LAYERS.length - 1].speed;
    // Under about 2x the two layers read as one field with sloppy timing.
    expect(fastest / slowest).toBeGreaterThanOrEqual(2);
  });

  it("travels at a clearly noticeable but unhurried speed", () => {
    // The owner's brief in one assertion: "clearly noticeable, moderate speed —
    // not extremely slowly". Below ~15pt/s the nearest layer reads as static
    // (that was the complaint about the version this replaced); above ~40 it
    // starts competing with the content for attention.
    const fastest = LAYERS[LAYERS.length - 1].speed;
    expect(fastest).toBeGreaterThanOrEqual(15);
    expect(fastest).toBeLessThanOrEqual(40);
  });
});

// THE 2026-09-22 RE-TUNE, AND WHY IT HAS ASSERTIONS OF ITS OWN.
//
// Every invariant above was already true of the drift that shipped first, and
// the owner still could not see it — on an iPhone or on a 13" iPad. The
// machinery was right and the perceptual numbers were under threshold. This
// block is the mirror of the budget below it: together the two say a particle
// must be visible ENOUGH that its movement reads, and never bright enough to
// pull the eye off a card. Relaxing something here does not make the field more
// tasteful, it makes it invisible again.
describe("the field is bright and dense enough to be seen at all", () => {
  it("clears the brightness the invisible version shipped, by a real margin", () => {
    // The first drift's floors, layer by layer: 1.07:1, 1.10:1 and 1.16:1
    // against the ground. Nothing subtle was wrong with them — they were simply
    // not there. Requiring half again as much moved the dimmest particle from
    // 14% of the way between the ground and a hairline to 46%.
    const WAS = [0.035, 0.05, 0.07];
    LAYERS.forEach((layer, i) => {
      expect(layer.alphaMin).toBeGreaterThanOrEqual(WAS[i] * 1.5);
    });
  });

  it("scatters enough particles per tile to read as a field", () => {
    // COUNT IS PER TILE, and a phone stacks two copies of the 900pt tile, so
    // this total is half of what is on screen. 44 across a 390pt-wide phone is
    // one particle per ~8,000pt^2, about what the web field tiles at; the 25
    // this replaces was one per ~14,000 and read as an empty backdrop.
    const perTile = LAYERS.reduce((sum, layer) => sum + layer.count, 0);
    expect(perTile).toBeGreaterThanOrEqual(40);
    // The upper bound is performance, not taste. Every particle is a leaf View:
    // 44 per tile is 88 on a phone and 132 on a 13" iPad, which is affordable
    // because the PER-FRAME cost is three transforms whatever sits under them.
    // 60 per tile would be 180 Views on the low-end Android hardware the owner
    // tests on, and that is further than a backdrop has any business going.
    expect(perTile).toBeLessThanOrEqual(60);
  });

  it("scales the count with the measured width, not just the height", () => {
    // THE TABLET BUG, PINNED. Every particle's `left` is a PERCENTAGE, so a
    // fixed count spreads over whatever width it is handed: the counts here are
    // calibrated on a 390pt phone and were landing ~2.6x sparser on a 1024pt
    // iPad. The owner reported seeing nothing on exactly that device, twice,
    // and brightness alone was never going to reach it.
    //
    // Pinned as SOURCE STRUCTURE rather than behaviour because the component
    // needs a layout event to have a width at all, and there is no layout
    // engine under jest here. What must stay true: the width reaches state, it
    // is quantised before it does, and the count that reaches layerStars is
    // scaled by it.
    expect(CODE).toContain("const BASE_WIDTH = 390");
    expect(CODE).toContain("function densityScale(");
    // Quantised, or a split-view drag rebuilds three layers every frame.
    expect(CODE).toMatch(/Math\.round\(raw \* 4\) \/ 4/);
    // Clamped at BOTH ends: a 320pt phone must not get FEWER stars than the
    // 390pt one the field was tuned on, and the top end is a View-count bound.
    expect(CODE).toMatch(/Math\.min\(MAX_DENSITY_SCALE, Math\.max\(1, quantised\)\)/);
    // The scale must reach the generator. Slicing a prefix of the existing
    // table would NOT work and is the obvious wrong fix: the scatter is
    // stratified by `top` band, so a prefix covers only the top of the tile.
    expect(CODE).toMatch(/count: Math\.max\(1, Math\.round\(layer\.count \* scale\)\)/);
    // And it must be memoised, or every re-render re-runs the LCG.
    expect(CODE).toContain("skies.set(scale, built)");
  });

  it("keeps the worst-case particle count defensible on a low-end device", () => {
    const perTile = LAYERS.reduce((sum, layer) => sum + layer.count, 0);
    const cap = Number(/const MAX_DENSITY_SCALE = ([0-9.]+)/.exec(CODE)?.[1]);
    expect(Number.isFinite(cap)).toBe(true);
    // Widest supported body x tallest copy count. Every particle is a leaf View
    // with no children that never re-renders and never animates individually —
    // three transforms move all of them — but this is still the number to watch
    // if a dark screen ever drops frames on a low-end Android tablet.
    const worstCase = Math.round(perTile * cap) * 3;
    expect(worstCase).toBeLessThanOrEqual(400);
  });

  it("buys that visibility with brightness and count, never with size", () => {
    // The brief says "tiny" twice. Growing the dots is the cheap way to make a
    // field visible and the wrong one — it turns motes into decoration people
    // look at, which is the opposite of the ask. These are the sizes the
    // INVISIBLE version shipped, unchanged on purpose: the re-tune moved alpha
    // and count and deliberately left this column alone. That is the statement
    // being pinned, so changing these numbers should be a decision, not a nudge.
    expect(LAYERS.map((layer) => layer.size)).toEqual([1.4, 1.8, 2.4]);
  });
});

describe("the field stays behind the content", () => {
  it("keeps every particle inside the band between perceptible and hairline", () => {
    for (const layer of LAYERS) {
      expect(layer.alphaMax).toBeLessThanOrEqual(CEILING);
      expect(layer.alphaMin).toBeGreaterThanOrEqual(PERCEPTIBLE);
      expect(layer.alphaMin).toBeLessThan(layer.alphaMax);
    }
  });

  it("keeps the particles small enough to be texture", () => {
    for (const layer of LAYERS) expect(layer.size).toBeLessThanOrEqual(3);
  });

  it("cannot sway a particle onto the edge of the narrowest supported screen", () => {
    const margin = (EDGE / 100) * NARROWEST;
    const widestSway = Math.max(...LAYERS.map((l) => l.sway));
    expect(widestSway).toBeLessThan(margin);
  });

  it("derives the ink from the dark palette instead of introducing a colour", () => {
    expect(CODE).toContain("const STAR_INK = APP_DARK.text");
    expect(CODE).toContain("INKS_AGREE = STAR_INK === ARENA_DARK.ink");
    // No literal colour anywhere: the moment one appears, the neutral-charcoal
    // guarantee of dark-theme-neutrality.test.ts stops covering this file.
    expect(CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("the motion is independent of the measurement, and of the user's wishes", () => {
  it("derives the duration from the tile and the layer's speed, never from a height", () => {
    expect(CODE).toContain("(TILE / layer.speed)");
  });

  it("does not restart the animation when the body is measured again", () => {
    // The measured value reaches the layer as `copies` — a MOUNT input. If it
    // ever reaches this dependency array, opening the keyboard restarts the
    // travel mid-flight and the whole sky jumps on a screen someone is typing
    // on. That is the bug the fixed tile exists to prevent.
    const deps = /\}, \[([^\]]*)\]\);/.exec(CODE);
    if (!deps) throw new Error("no useEffect dependency array found");
    const listed = deps[1].split(",").map((d) => d.trim()).filter(Boolean);
    expect(listed).toEqual(["animate", "duration", "progress"]);
  });

  it("honours the OS reduce-motion switch, live", () => {
    // The hook subscribes as well as reads, so flipping the switch while the
    // app is open takes effect without a restart.
    expect(CODE).toContain("useReduceMotion");
    expect(CODE).toContain("animate={!reduceMotion}");
    // And it PARKS rather than unmounts: the field is part of what the surface
    // looks like, so removing it would change the design, not only the motion.
    expect(CODE).toContain("cancelAnimation(progress)");
    expect(CODE).toContain("progress.value = 0;");
  });
});
