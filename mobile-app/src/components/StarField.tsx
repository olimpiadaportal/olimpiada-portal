// A DRIFTING, low-contrast particle field painted behind the DARK theme.
//
// WHAT THIS IS NOW, AND WHAT IT WAS (2026-09-22). The first version twinkled:
// three layers breathing between two opacities on 6-12s loops, with a "drift"
// of 4-8pt per half-breath that its own comment described as "far too little to
// notice as movement". That was accurate, and it is the thing the owner asked
// to change: the backdrop should read as alive and technological, with
// particles travelling at a clearly noticeable, moderate speed and with real
// DEPTH between the layers. A dot brightening in place expresses neither.
//
// So the breathing is gone. Each layer now TRAVELS at its own constant velocity
// (about 26, 16 and 9.5 points per second), at its own slight angle, and that
// spread of velocities IS the parallax — a near layer of few large particles
// crossing nearly three times faster than a deep layer of many small ones.
// Brightness is a fixed per-particle value instead of an animated one, and the
// values were RE-DERIVED on 2026-09-22, after this drift shipped and the owner
// could not see it AT ALL — not on an iPhone, not on a 13" iPad. Nothing was
// wrong with the machinery. The numbers were simply under the threshold of
// perception, because the first pass took the brief's "low-opacity, sparse"
// half literally and kept the average brightness of the twinkle it replaced,
// while the same brief also asked for motion that is "clearly noticeable" and
// "moderate and VISIBLE". Those halves are not independent: you cannot perceive
// the movement of a particle you cannot perceive. So the field is now brighter
// and denser, the arithmetic for how much is in CONTRAST BUDGET below, and the
// dot SIZES did not move at all — the brief says "tiny" twice, and size is the
// cheap lever that would have bought visibility by turning motes into dots.
//
// WHERE IT IS MOUNTED, AND WHY NOT ONCE AT THE ROOT. The obvious home for an
// app-wide backdrop is RootGate — one instance for the whole tree. It does not
// work in this app, and the reason is worth recording so it is not
// re-litigated: the screen background is painted in FIVE independent places
// (`Screen`'s static and scrolling branches, `ScreenScroll`, `ArenaScroll`, and
// the two navigator `contentStyle`s) plus roughly forty-seven raw screen-level
// Views, and every one of them is OPAQUE. A layer mounted at the root sits
// behind all of that and is never seen at all. Making it visible means taking
// ~50 sites transparent, and the keyboard-inset, ActionArea and tablet-gutter
// contracts are pinned to those exact containers by three separate test files.
//
// So the field is mounted in the three SHARED bodies instead — `Screen`,
// `ScreenScroll`, `ArenaScroll` — which is where the large majority of real
// screens render. The screens that paint their own root View (the news lists
// and article pages, the public marketing pages, the test-chain screens, the
// boot and app-lock overlays) keep a plain background; that is a coverage gap
// by design, not an oversight, and closing it is the ~50-site refactor above.
//
// WHY REANIMATED AND NOT THE Animated API. Reanimated is already an
// SDK-54-aligned dependency and is bundled inside Expo Go (the owner's test
// rig), so this adds no native code and no new package — the same argument
// Segmented.tsx makes, and it is what keeps this change shippable as an OTA
// update. What it buys is that the whole thing runs on the UI thread: ONE
// shared value per layer, three animated styles in total, no JS callback per
// frame and no React re-render for the lifetime of the screen. A backdrop that
// stutters a list while it scrolls is worse than no backdrop.
//
// WHY THE LOOP IS A FIXED 900pt TILE AND NOT THE SCREEN HEIGHT. The obvious
// implementation measures the body, stacks two copies of the particle set, and
// slides by exactly that height. It looks right until the keyboard opens: the
// body shrinks, the travel distance changes, and the whole sky JUMPS on a
// screen the user is in the middle of typing on. Rotation does it too. Pinning
// the loop to a constant tile instead means the animation never depends on the
// measurement at all — the height only decides HOW MANY copies of the tile are
// stacked, which is a mount, not a discontinuity. The animation is started once
// and is never restarted for a resize.
//
// The tile is also why the wrap is invisible: copy n+1 sits exactly one tile
// below copy n, so translating up by one tile lands the sky on a pixel-
// identical arrangement, and the reset at the end of each iteration has nothing
// to show. The sideways sway obeys the same rule — a whole number of sine
// cycles per loop, so it is back where it started at the moment the loop wraps.
//
// COST. `ceil(height / 900) + 1` copies, so a phone renders TWO copies of 44
// particles — 88 leaf Views with a background colour, no shadow and no clipping,
// under three animated parents; a 13" iPad stacks three copies, so 132. That is
// up from 50, and it is still cheap in the way that decides whether a backdrop
// costs a frame: the PER-FRAME work does not scale with the count at all.
// Reanimated writes THREE transforms on the UI thread however many children sit
// under them, the particles never re-render, never invalidate and never animate
// individually, and what the extra 38 buy is 38 more flat rounded rects in the
// GPU's draw list — fewer nodes than one row of a real list screen. The owner
// tests on low-end Android hardware, so this is comfortably inside the budget,
// and it is also where the count stops.
//
// CONTRAST BUDGET, AND THE PERCEPTIBILITY FLOOR UNDER IT (re-derived
// 2026-09-22). All three mount sites paint `bg`, and APP_DARK.bg and
// ARENA_DARK.bg are the same #100e0e, so the sum is the same everywhere: the
// ink is #f3f3f1, and a particle at alpha a composites to about 16 + 227a per
// channel. Two anchors bound the band the alphas live in.
//
//   FLOOR — what actually renders. The first drift's dimmest particle was alpha
//   0.035 -> #181616: eight code values above the ground, relative luminance
//   0.0083 against the ground's 0.0046. Doubling a luminance that small buys
//   nothing, and the WCAG ratio says why — its +0.05 term is the ambient light
//   the glass reflects back at you, and against that flare the step is 1.07:1.
//   A panel can encode eight code values; an eye in a lit room cannot resolve
//   them on a target four pixels across. The dimmest particle is now alpha 0.09
//   -> #242322, which is 1.23:1 against the ground and 46% of the way from the
//   background to a hairline in luminance — where a sub-2pt dot starts to
//   read. That floor is the effect's whole premise, not a nicety.
//
//   CEILING — what stays subordinate. The brightest is alpha 0.155 -> #333131,
//   1.49:1 against the ground where the `border` token (#323230) is 1.50:1 —
//   the same hairline, to within a code value. That is deliberate: `border` is
//   this app's own statement of "visible on this ground, and still not
//   something you look at". Matching it is the CONSERVATIVE end of the band
//   rather than the aggressive one, because a dot is far quieter than a line at
//   equal luminance — a 2.4pt particle covers ~4.5pt^2 where one card edge
//   covers ~340, so it delivers about 1% of the light. All 44 particles in a
//   tile together ink 112pt^2 of a 390x900 tile: 0.03% of the surface.
//
// Card surfaces are opaque, so a particle never shows THROUGH a card — but it
// is not true that text is never read against one, and an earlier version of
// this comment claimed exactly that while the ceiling leaned on it. Headings,
// section eyebrows and empty-state prose sit directly on `bg`, so a particle
// does pass behind them. The ceiling holds on the ink-per-area argument above
// and on that alone: at 2.40:1 a 2.4pt dot delivers roughly 1% of the light of
// a glyph stroke crossing the same area, and it is never stationary under one.
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type DimensionValue } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { APP_DARK, ARENA_DARK } from "@/theme/tokens";
import { useReduceMotion } from "@/lib/useReduceMotion";

/**
 * The particle ink, DERIVED from the dark palettes rather than added to them.
 *
 * `APP_DARK.text` and `ARENA_DARK.ink` are the same neutral `#f3f3f1`, so one
 * constant is correct on the parent surfaces and inside the student arena
 * alike — and because it is the owner's own neutral, the field cannot
 * reintroduce the blue cast the 2026-09-10 pass removed.
 *
 * It is a module constant ON PURPOSE and must not become a token:
 * `__tests__/dark-theme-neutrality.test.ts` classifies every key of `AppTokens`
 * and `ArenaTokens` exactly once, so a new key there fails that test by
 * construction — and decoration has no business in a palette a designer reads
 * as the app's contract.
 */
const STAR_INK = APP_DARK.text;

/**
 * Asserted rather than assumed. If the two dark inks ever diverge, the field
 * switches itself off instead of quietly matching only one of the two surfaces
 * it is painted on — and this is the line to revisit.
 */
const INKS_AGREE = STAR_INK === ARENA_DARK.ink;

/** `#rrggbb` -> `r, g, b`, so per-particle alpha can be baked into the colour. */
function channels(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
}

const STAR_RGB = channels(STAR_INK);

/**
 * The vertical period of the loop, in points. Everything about the motion is
 * expressed against this: a layer travelling at `speed` points per second takes
 * `TILE / speed` seconds per iteration, whatever device it is on, and copies of
 * the particle set are stacked every `TILE` points to fill the body.
 *
 * 900 is chosen so that an ordinary phone body needs exactly TWO copies
 * (`ceil(h / 900) + 1`), which is the cheapest arrangement that can cover the
 * screen for the whole of the travel, while still being long enough that the
 * repeat is not a pattern anyone can see.
 */
const TILE = 900;

type Layer = {
  /** Particles per tile. */
  count: number;
  /** Dot size in points — intrinsically fixed art, the one case
   *  mobile-app/CLAUDE.md's "no hardcoded sizes" rule exempts. */
  size: number;
  /** Per-particle alpha is drawn from this range, so no two dots in a layer are
   *  quite the same brightness and the field does not read as a stencil. The
   *  floor of the lowest range and the ceiling of the highest are both derived
   *  numbers, not taste — read CONTRAST BUDGET in the header before moving one. */
  alphaMin: number;
  alphaMax: number;
  /** Points travelled UPWARD per second. This is the parallax: the near layer
   *  is ~2.7x the far one, which is what the eye reads as distance. */
  speed: number;
  /** Amplitude, in points, of the sideways sway laid over the rise. It is what
   *  keeps the motion from being three parallel columns; the whole-number
   *  `swayCycles` per loop is what keeps it seamless at the wrap. */
  sway: number;
  swayCycles: number;
  /** Fraction of a sine cycle the sway starts at, so the layers are not all
   *  leaning the same way at the same moment. */
  swayPhase: number;
  /** Seed for this layer's positions and alphas — see `layerStars`. */
  seed: number;
};

/**
 * Far to near, and rendered in that order so the large bright particles sit
 * over the small dim ones rather than under them.
 *
 * Read the three rows as one statement: as the particles get closer they get
 * FEWER, BIGGER, BRIGHTER and FASTER, all four together. Changing one without
 * the others is what turns a depth cue back into a flat field at two speeds.
 *
 * `count` IS PER TILE, NOT PER SCREEN: 44 here is 88 on a phone, because two
 * copies of the tile are stacked to cover the body. On a 390pt-wide phone that
 * is one particle per ~8,000pt^2, which is roughly what the web field tiles at;
 * the 25 this replaces was one per ~14,000 and the owner read it as an empty
 * background.
 *
 * Which also means DENSITY FALLS WITH WIDTH — the same 44 spread across a
 * 1024pt tablet is one per ~21,000pt^2, and that is part of why the 13" iPad
 * looked emptiest. It is a known gap and it is NOT closed here: closing it
 * means making the position table depend on a measurement, and that table being
 * a module constant is exactly what keeps two simultaneously-mounted screens
 * showing the same sky. On a tablet, brightness is doing the work.
 */
const LAYERS: Layer[] = [
  {
    count: 20,
    size: 1.4,
    alphaMin: 0.155,
    alphaMax: 0.195,
    speed: 9.5,
    sway: 6,
    swayCycles: 1,
    swayPhase: 0.68,
    seed: 0x5eed01,
  },
  {
    count: 14,
    size: 1.8,
    alphaMin: 0.19,
    alphaMax: 0.24,
    speed: 16,
    sway: 9,
    swayCycles: 2,
    swayPhase: 0.37,
    seed: 0x5eed02,
  },
  {
    count: 10,
    size: 2.4,
    alphaMin: 0.23,
    alphaMax: 0.289,
    speed: 26,
    sway: 11,
    swayCycles: 1,
    swayPhase: 0,
    seed: 0x5eed03,
  },
];

/**
 * Percent margin kept clear on the left and the right.
 *
 * It is sized against the sway and the NARROWEST screen the app supports: 5% of
 * a 320pt body is 16 points, and the widest sway is 11, so a particle can never
 * be carried onto an edge — where it would read as a rendering artefact rather
 * than as a star. Widen the sway and this has to widen with it;
 * `__tests__/star-field-drift.test.ts` is what says so out loud.
 *
 * There is deliberately no vertical margin: the whole point is that particles
 * travel through the top and bottom of the body continuously.
 */
const EDGE = 5;

type Star = { left: DimensionValue; top: number; color: string; size: number };

const pct = (v: number): DimensionValue => `${Math.round(v * 100) / 100}%` as DimensionValue;

/**
 * Positions, brightnesses and sizes are drawn ONCE at module load from a fixed
 * seed — never from `Math.random()` during render, which would reshuffle the
 * sky on every re-render and hand two simultaneously-mounted screens different
 * skies.
 *
 * `left` is a PERCENTAGE, so one table fills a 320pt phone and a 1024pt tablet
 * without measuring either. `top` is in POINTS within the tile, because the
 * tile is a fixed 900pt and the copies are stacked at multiples of it.
 *
 * The scatter is stratified into horizontal bands (one particle per band,
 * jittered inside it) because an independent draw clumps: twenty free points
 * look like twelve points and a cluster.
 */
function layerStars({ count, seed, alphaMin, alphaMax, size }: Layer): Star[] {
  let state = seed >>> 0;
  const next = (): number => {
    // Numerical Recipes LCG: deterministic, dependency-free, and entirely good
    // enough for scattering dots.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const span = 100 - 2 * EDGE;
  const band = TILE / count;
  return Array.from({ length: count }, (_, i) => {
    const left = pct(EDGE + next() * span);
    const top = Math.round(i * band + next() * band);
    const alpha = Math.round((alphaMin + next() * (alphaMax - alphaMin)) * 1000) / 1000;
    // A little size jitter on top of the layer's size, for the same reason the
    // alpha varies: identical dots read as a printed pattern.
    const jitter = Math.round((size * (0.85 + next() * 0.3)) * 100) / 100;
    return { left, top, color: `rgba(${STAR_RGB}, ${alpha})`, size: jitter };
  });
}

/**
 * The width the LAYERS counts are calibrated against — a 390pt phone, which is
 * the device the field was tuned on.
 */
const BASE_WIDTH = 390;

/**
 * The most the count may be multiplied by, and it is a PERFORMANCE bound rather
 * than an aesthetic one. Every particle is a leaf View. At 2.75 the widest
 * supported body carries 121 particles per tile copy and a 1366pt-tall iPad
 * needs 3 copies, so the worst case is ~363 flat rounded rects — static, never
 * re-rendered, never individually animated, sitting under three transforms that
 * Reanimated writes on the UI thread. That is the number to watch if a low-end
 * Android tablet ever drops frames on a dark screen.
 */
const MAX_DENSITY_SCALE = 2.75;

/**
 * Skies, keyed by density scale. `layerStars` is deterministic in its seed and
 * count, so a given scale always yields the same sky — two screens mounted at
 * the same width cannot disagree, and a rotation back returns the sky it left.
 */
const skies = new Map<number, Star[][]>();

function starsForScale(scale: number): Star[][] {
  const cached = skies.get(scale);
  if (cached) return cached;
  const built = LAYERS.map((layer) =>
    layerStars({ ...layer, count: Math.max(1, Math.round(layer.count * scale)) }),
  );
  skies.set(scale, built);
  return built;
}

/**
 * Quantised to quarter steps, and clamped so a NARROW body never thins the sky
 * below the calibrated count: dragging a split-view divider must not rebuild
 * three layers on every frame, and a 320pt phone should not get fewer stars
 * than the 390pt one it was tuned on.
 */
function densityScale(width: number): number {
  if (!(width > 0)) return 1;
  const raw = width / BASE_WIDTH;
  const quantised = Math.round(raw * 4) / 4;
  return Math.min(MAX_DENSITY_SCALE, Math.max(1, quantised));
}

/** Two pi. A plain number, so the worklet captures a value and not a reference
 *  it would have to reach across the bridge for. */
const TAU = Math.PI * 2;

function StarLayer({
  layer,
  stars,
  copies,
  animate,
}: {
  layer: Layer;
  stars: Star[];
  copies: number;
  animate: boolean;
}) {
  // 0 -> 1, then straight back to 0 and again, forever. One shared value and
  // one worklet for the whole layer. The reset is invisible because one full
  // cycle moves the layer by exactly one tile.
  const progress = useSharedValue(0);

  // Constant by construction: it depends on TILE and the layer's speed, never
  // on the measured height. That is what stops the keyboard opening — or the
  // device rotating — from restarting the animation mid-travel.
  const duration = Math.round((TILE / layer.speed) * 1000);

  useEffect(() => {
    if (!animate) {
      // Reduce motion: park the layer at its home position so the sky is still
      // THERE — it is part of the surface, and deleting it would change what
      // the screen looks like rather than only how it moves.
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.linear }),
      -1,
      // NOT reversed: a field that rises and then sinks back is a pendulum, not
      // a drift. Non-reversing repeat is only seamless because of the tiling.
      false,
    );
    return () => cancelAnimation(progress);
  }, [animate, duration, progress]);

  // Read the numbers off the layer HERE: the worklet then captures four plain
  // values instead of the whole object.
  const { sway, swayCycles, swayPhase } = layer;
  const layerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -TILE * progress.value },
      { translateX: sway * Math.sin(TAU * (swayCycles * progress.value + swayPhase)) },
    ],
  }));

  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, right: 0, top: 0, height: copies * TILE },
        layerStyle,
      ]}
    >
      {/* Flattened rather than nested, so every particle is a direct child with
          a key of its own instead of an array React has to key by position. */}
      {Array.from({ length: copies }).flatMap((_, copy) =>
        stars.map((star, i) => (
          <View
            key={`${copy}-${i}`}
            style={{
              position: "absolute",
              left: star.left,
              top: copy * TILE + star.top,
              width: star.size,
              height: star.size,
              borderRadius: star.size / 2,
              backgroundColor: star.color,
            }}
          />
        )),
      )}
    </Animated.View>
  );
}

/**
 * Decorative backdrop for the shared screen bodies. Renders NOTHING in light
 * mode — the Energetic light theme is the investor-reviewed reference and this
 * pass does not touch it.
 *
 * Mount it as the FIRST child of a container that already paints the opaque
 * background, with the content rendered after it: it fills that container
 * absolutely and takes no part in layout.
 */
export function StarField() {
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();
  // How many copies of the tile it takes to cover the body. This is the ONLY
  // thing the measurement decides — never how fast or how far anything moves —
  // so a change to it costs a mount and never a visible jump.
  const [copies, setCopies] = useState(0);
  // The density multiplier for the measured WIDTH. Separate state from
  // `copies` on purpose: height and width change independently (a keyboard
  // inset moves one, a rotation moves both) and neither should rebuild the
  // other's work.
  const [scale, setScale] = useState(1);

  const onLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    // Quantised to whole tiles before it reaches state: a body that grows by a
    // few points — a keyboard inset settling, a banner appearing — must not
    // re-render fifty Views for a copy count that did not change.
    const nextCopies = height > 0 ? Math.ceil(height / TILE) + 1 : 0;
    setCopies((current) => (current === nextCopies ? current : nextCopies));
    const nextScale = densityScale(width);
    setScale((current) => (current === nextScale ? current : nextScale));
  };

  // Cheap by construction — `starsForScale` memoises across every mount, so a
  // second screen at the same width reuses the first one's sky rather than
  // running the LCG again.
  const stars = useMemo(() => starsForScale(scale), [scale]);

  if (theme !== "dark" || !INKS_AGREE) return null;

  return (
    <View
      // Never intercepts a touch, and never reaches a screen reader: this is
      // texture, not content.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      // The layers are taller than the body by design; clipping guarantees the
      // travel can never paint outside the body it belongs to, whatever that
      // container does.
      style={[StyleSheet.absoluteFillObject, { overflow: "hidden" }]}
    >
      {copies > 0
        ? LAYERS.map((layer, i) => (
            <StarLayer
              key={i}
              layer={layer}
              stars={stars[i]}
              copies={copies}
              animate={!reduceMotion}
            />
          ))
        : null}
    </View>
  );
}
