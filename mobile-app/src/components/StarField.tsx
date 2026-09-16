// A slow, low-contrast STAR FIELD painted behind the DARK theme.
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
// Segmented.tsx makes. What it buys is that the whole thing runs on the UI
// thread: ONE shared value per layer, three animated styles in total, no JS
// callback per frame and no React re-render for the lifetime of the screen. A
// backdrop that stutters a list while it scrolls is worse than no backdrop.
//
// WHY THREE LAYERS AND NOT TWENTY-ONE ANIMATIONS. Each star could breathe on
// its own driver, but that is twenty-one worklets evaluated every frame on
// every mounted screen to buy a difference nobody can perceive at these
// opacities. The stars are grouped into three layers with different sizes,
// brightnesses, periods and start delays; within a layer they are scattered, so
// "in unison" never reads as a block.
//
// CONTRAST BUDGET. The brightest star is the neutral ink at alpha 0.13 over
// #100e0e, which composites to about #2e2e2d — dimmer than the `border` token
// (#323230) that already draws hairlines on that ground. Card surfaces are
// opaque, so stars only ever show in the gutters BETWEEN content; no text is
// ever read against one, and nothing here moves a contrast ratio.
import React, { useEffect } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { APP_DARK, ARENA_DARK } from "@/theme/tokens";
import { useReduceMotion } from "@/lib/useReduceMotion";

/**
 * The star ink, DERIVED from the dark palettes rather than added to them.
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

type Layer = {
  /** Stars in this layer. */
  count: number;
  /** Dot size in points — intrinsically fixed art, the one case
   *  mobile-app/CLAUDE.md's "no hardcoded sizes" rule exempts. */
  size: number;
  /** Opacity at the bottom and at the top of the breath. */
  min: number;
  max: number;
  /** Points the layer rises across one breath. Tiny on purpose: about 1% of a
   *  phone screen — enough to read as depth, far too little to notice as
   *  movement. */
  drift: number;
  /** One half-breath, in ms. Mutually non-harmonic across the three layers, so
   *  the field never settles into a visible collective rhythm. */
  period: number;
  /** Start offset, so the three layers do not swell together on mount. */
  delay: number;
  /** Seed for this layer's positions — see `layerStars`. */
  seed: number;
};

const LAYERS: Layer[] = [
  { count: 7, size: 2.5, min: 0.05, max: 0.13, drift: 8, period: 6200, delay: 0, seed: 0x5eed01 },
  { count: 7, size: 2, min: 0.04, max: 0.1, drift: 6, period: 8900, delay: 2100, seed: 0x5eed02 },
  { count: 7, size: 1.5, min: 0.03, max: 0.08, drift: 4, period: 11700, delay: 4300, seed: 0x5eed03 },
];

/**
 * Percent margin kept clear on every side. It does two jobs: the drift can
 * never expose an edge, and no star lands under the notch, the navigator header
 * or the tab bar, where it would sit on chrome instead of on the background.
 */
const EDGE = 6;

type Star = { left: DimensionValue; top: DimensionValue };

const pct = (v: number): DimensionValue => `${Math.round(v * 100) / 100}%` as DimensionValue;

/**
 * Positions are drawn ONCE at module load from a fixed seed — never from
 * `Math.random()` during render, which would reshuffle the sky on every
 * re-render and hand two simultaneously-mounted screens different skies.
 *
 * They are PERCENTAGES, so one table fills a 320pt phone and a 1024pt tablet
 * without measuring either, and the scatter is stratified into horizontal bands
 * (one star per band, jittered inside it) because an independent draw clumps:
 * seven free points look like three points and a cluster.
 */
function layerStars({ count, seed }: Layer): Star[] {
  let state = seed >>> 0;
  const next = (): number => {
    // Numerical Recipes LCG: deterministic, dependency-free, and entirely good
    // enough for scattering dots.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const span = 100 - 2 * EDGE;
  const band = span / count;
  return Array.from({ length: count }, (_, i) => ({
    left: pct(EDGE + next() * span),
    top: pct(EDGE + i * band + next() * band),
  }));
}

const STARS: Star[][] = LAYERS.map(layerStars);

function StarLayer({
  layer,
  stars,
  animate,
}: {
  layer: Layer;
  stars: Star[];
  animate: boolean;
}) {
  // 0 -> 1 -> 0, forever. One shared value and one worklet for the whole layer.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      // Reduce motion: park the layer mid-breath so the sky is still THERE —
      // it is part of the surface, and deleting it would change what the screen
      // looks like rather than only how it moves.
      cancelAnimation(progress);
      progress.value = 0.5;
      return;
    }
    progress.value = withDelay(
      layer.delay,
      withRepeat(
        withTiming(1, { duration: layer.period, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(progress);
  }, [animate, layer.delay, layer.period, progress]);

  // Read off the layer here: the worklet then captures three numbers instead of
  // the whole object.
  const { min, max, drift } = layer;
  const layerStyle = useAnimatedStyle(() => ({
    opacity: min + (max - min) * progress.value,
    transform: [{ translateY: -drift * progress.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, layerStyle]}>
      {stars.map((star, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: star.left,
            top: star.top,
            width: layer.size,
            height: layer.size,
            borderRadius: layer.size / 2,
            backgroundColor: STAR_INK,
          }}
        />
      ))}
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

  if (theme !== "dark" || !INKS_AGREE) return null;

  return (
    <View
      // Never intercepts a touch, and never reaches a screen reader: this is
      // texture, not content.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // The drift moves the layers; clipping guarantees it can never paint
      // outside the body it belongs to, whatever that container does.
      style={[StyleSheet.absoluteFillObject, { overflow: "hidden" }]}
    >
      {LAYERS.map((layer, i) => (
        <StarLayer key={i} layer={layer} stars={STARS[i]} animate={!reduceMotion} />
      ))}
    </View>
  );
}
