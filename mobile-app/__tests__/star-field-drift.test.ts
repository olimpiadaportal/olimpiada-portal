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
//   * Brightness is a READABILITY budget, not taste. The field is painted
//     behind everything, and the reason it never interferes with text is that
//     the brightest particle is dimmer than the `border` token on the same
//     ground.
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
  // comes from this repository's own source, not from input.
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

describe("the field stays behind the content", () => {
  it("keeps every particle dimmer than the hairline it shares the ground with", () => {
    // #f3f3f1 at 0.13 over #100e0e composites to ~#2e2e2d; `border` is #323230.
    // A particle brighter than a border is a particle that reads as content.
    for (const layer of LAYERS) {
      expect(layer.alphaMax).toBeLessThanOrEqual(0.13);
      expect(layer.alphaMin).toBeGreaterThan(0);
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
