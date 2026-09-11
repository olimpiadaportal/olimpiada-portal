// The dark theme must read as neutral charcoal, never as dark blue.
//
// OWNER REPORT (2026-09-10): the dark theme "reads as dark-BLUE"; he asked for a
// deeper, neutral charcoal, with no component redesign, no layout change, no
// change to the visual hierarchy, brand accents kept, and contrast maintained.
//
// WHY A TEST AND NOT JUST NEW HEX VALUES. The values that were replaced are the
// web's, and `src/theme/tokens.ts` was documented top-to-bottom as MIRRORING the
// web palette. That instruction is load-bearing for the light theme and was, for
// dark, exactly the instruction that would tell the next session to "fix the
// drift" by pasting `#0a0e1a` back. The header, `markdowns/MOBILE_APP_MASTER_PLAN.md`
// and `CLAUDE.md` were all amended to record the override — this file is the part
// that fails loudly when someone re-syncs anyway.
//
// THE MEASUREMENT. A colour is blue-cast when its B channel materially exceeds
// both R and G. Every surface below used to: the old `#0a0e1a` is (10,14,26),
// B is 12 above G; `#26314f` is (38,49,79), B is 30 above G. The replacements
// invert that relationship — B is now the SMALLEST channel by 1–2 — so the
// invariant is `B <= min(R,G)`, which an exact grey also satisfies.
//
// WHAT IS DELIBERATELY EXEMPT. Brand accents. The dark accent IS blue
// (`#2f6bff`), the arena keeps lime/blue/red/gold, and `pillText` is the accent
// ink whose light-mode counterpart is the purple accent. The owner said keep
// the brand accents; "neutral" describes the surfaces and the neutral ink
// tiers, nothing else. Listing them explicitly is the point — an exemption you
// have to name is one you cannot widen by accident.
//
// AND A THIRD TIER, ADDED 2026-09-10 AFTER THE SWEEP GOT IT WRONG. The first
// pass had only two boxes — neutral or accent — so `pillBg` was filed as an
// accent and left at the web's ink-strength chroma (47/255, C*ab 24.7) while
// every surface touching it went to 1–2. That value was correct only while its
// neighbours were navy at C*ab 16–21; among neutral ones the accent pill read
// as a foreign navy block instead of as a tinted surface, and the relation that
// had held in BOTH themes (the pill is the chip surface, tinted) became false
// in mobile dark alone. `pillBg` is therefore its own tier: a TINTED SURFACE,
// accent HUE at SURFACE strength. Both directions are now failures — a neutral
// that regains chroma, and a tinted surface flattened to grey.
//
// CONTRAST IS PINNED SEPARATELY. Neutralising a hue is only safe if it does not
// move lightness, so the second block re-derives the ratios rather than trusting
// that it did.
//
// THE `dim` QUESTION IS CLOSED. OWNER DECISION, 2026-09-10: the token STAYS at
// #646463 and is asserted AS FAILING AA on purpose. This is no longer an open
// item, and the expectation below is not a placeholder waiting for a better
// value — it is the decision's record. The three tiers measure:
//
//     ink   #f3f3f1   bg 17.32  bg2 16.07  panel 15.10  panel2 13.63
//     muted #8f8d8d   bg  5.83  bg2  5.41  panel  5.08  panel2  4.59
//     dim   #646463   bg  3.25  bg2  3.01  panel  2.83  panel2  2.56
//
// The hue pass did not cause the miss: the blue #56638a measured the identical
// 2.83 on panel, because the swap was luminance-matched by construction. And
// the obvious remedy turns out not to exist. An AA `dim` must clear 4.5:1 on
// the LIGHTEST surface it can land on — `panel2` — which takes #8c8c8c, three
// code points from `muted`'s #8f8d8d and indistinguishable on a phone. A
// compliant `dim` IS `muted`; the third tier cannot exist at AA. So keeping it
// preserves a hierarchy that lightening would delete, and the accessibility
// debt is paid on the other side of the ledger instead: READ strings take
// `muted`, and `dim` carries icons, hairlines and decoration only. That usage
// rule is what makes the failing expectation defensible.
//
// IT WAS ALSO, FOR ONE DAY, UNTRUE HERE. This header and `ARENA_DARK`'s doc
// comment both said the move to `muted` had happened "in this same change" while
// SEVENTEEN readable strings were still painted in `dim` — two of them (a
// status-pill label at 2.51:1, a done-card monogram at 1.63:1) worse than the
// 2.56 the owner weighed. They were swept on 2026-09-10, and the claim is no
// longer made in prose: the last describe block in this file reads the SOURCE
// and fails on any `dim` that reaches text. Do not turn that back into a
// sentence — a sentence is what let seventeen sites through.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  APP_DARK,
  APP_LIGHT,
  ARENA_DARK,
  ARENA_LIGHT,
  BRAND_GRADIENT,
  type ArenaTokens,
} from "../src/theme/tokens";

type RGB = [number, number, number];

const rgb = (hex: string): RGB => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** How far the blue channel sits ABOVE the warmer of red/green. >0 = blue-cast. */
const blueCast = (hex: string): number => {
  const [r, g, b] = rgb(hex);
  return b - Math.max(r, g);
};

/**
 * Saturation as the 8-bit channel spread (max - min), 0…255. A hue-agnostic
 * stand-in for CIELAB C*ab: it needs no colour-science module, and it separates
 * the three tiers cleanly — neutrals score 1–2 (C*ab <= 1.4), the tinted pill
 * scores 15 (C*ab 9.2), and the weakest brand accent scores 96 (C*ab 34.8).
 */
const spread = (hex: string): number => {
  const c = rgb(hex);
  return Math.max(...c) - Math.min(...c);
};

/** Repo file as text, newline-normalised (this is a Windows checkout). */
const read = (p: string): string =>
  readFileSync(resolve(__dirname, "..", p), "utf8").split("\r\n").join("\n");

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** WCAG 2.x relative luminance. */
const luminance = (hex: string): number => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG 2.x contrast ratio, 1…21. */
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * The tokens that must stay neutral: every dark background/surface/border plus
 * the neutral ink tiers that sit on them. Accents are NOT in this list — see the
 * exemption below, whose completeness is itself asserted so the sweep cannot
 * quietly shrink.
 */
const NEUTRAL_DARK: Record<string, string> = {
  "APP_DARK.bg": APP_DARK.bg,
  "APP_DARK.surface": APP_DARK.surface,
  "APP_DARK.chipBg": APP_DARK.chipBg,
  "APP_DARK.border": APP_DARK.border,
  "APP_DARK.text": APP_DARK.text,
  "APP_DARK.chipText": APP_DARK.chipText,
  "APP_DARK.muted": APP_DARK.muted,
  "ARENA_DARK.bg": ARENA_DARK.bg,
  "ARENA_DARK.bg2": ARENA_DARK.bg2,
  "ARENA_DARK.panel": ARENA_DARK.panel,
  "ARENA_DARK.panel2": ARENA_DARK.panel2,
  "ARENA_DARK.line": ARENA_DARK.line,
  "ARENA_DARK.ink": ARENA_DARK.ink,
  "ARENA_DARK.muted": ARENA_DARK.muted,
  "ARENA_DARK.dim": ARENA_DARK.dim,
};

/**
 * The middle tier: a SURFACE that carries the accent hue. Exactly one token is
 * allowed in here, and the tests below hold it between the other two — tinted
 * enough to read as accent, quiet enough to read as a surface.
 */
const TINTED_SURFACES: Record<string, string> = {
  "APP_DARK.pillBg": APP_DARK.pillBg,
};

/** Brand accents: hue is the whole point of these, so they are out of scope. */
const ACCENTS_EXEMPT: Record<string, string> = {
  "APP_DARK.accent": APP_DARK.accent,
  "APP_DARK.accent2": APP_DARK.accent2,
  "APP_DARK.ok": APP_DARK.ok,
  "APP_DARK.warn": APP_DARK.warn,
  "APP_DARK.danger": APP_DARK.danger,
  "APP_DARK.pillText": APP_DARK.pillText,
  "ARENA_DARK.lime": ARENA_DARK.lime,
  "ARENA_DARK.blue": ARENA_DARK.blue,
  "ARENA_DARK.red": ARENA_DARK.red,
  "ARENA_DARK.gold": ARENA_DARK.gold,
};

describe("dark surfaces are neutral, not blue", () => {
  it("gives no dark surface or ink a blue channel above red and green", () => {
    for (const [name, hex] of Object.entries(NEUTRAL_DARK)) {
      // A perfectly neutral grey scores 0. The shipped values score -1 or -2
      // (a whisper of warmth). Anything above 0 is a blue cast returning.
      expect(`${name} ${hex} cast=${blueCast(hex)}`).toBe(
        `${name} ${hex} cast=${Math.min(blueCast(hex), 0)}`,
      );
    }
  });

  it("keeps blue the smallest channel on every neutral token", () => {
    // Stronger than the cast check: blue must not exceed the SMALLER of red and
    // green either. `#0a0e1a` (10,14,26) fails both; `#1f1d1d` (31,29,29) passes.
    for (const [name, hex] of Object.entries(NEUTRAL_DARK)) {
      const [r, g, b] = rgb(hex);
      expect(`${name}:${b <= Math.min(r, g)}`).toBe(`${name}:true`);
    }
  });

  it("classifies every token in the two dark palettes exactly once", () => {
    // The invariant is only as good as the list. If a token is added to
    // AppTokens/ArenaTokens it must be classified deliberately — neutral,
    // tinted surface or accent — rather than silently escaping the sweep.
    // `shadow` is excluded because it is an rgba() string, not a hex, and is
    // already pure black.
    const keyed = (prefix: string, obj: Record<string, string>) =>
      Object.keys(obj)
        .filter((k) => k !== "shadow")
        .map((k) => `${prefix}.${k}`);
    const classified = [
      ...Object.keys(NEUTRAL_DARK),
      ...Object.keys(TINTED_SURFACES),
      ...Object.keys(ACCENTS_EXEMPT),
    ].sort();
    const expected = [
      ...keyed("APP_DARK", APP_DARK as unknown as Record<string, string>),
      ...keyed("ARENA_DARK", ARENA_DARK as unknown as Record<string, string>),
    ].sort();
    expect(classified).toEqual(expected);
  });

  it("leaves the brand accents alone, blue ones included", () => {
    // Asserted positively so that "neutralise everything" reads as a failure
    // too: the dark accent is SUPPOSED to be blue.
    expect(ACCENTS_EXEMPT["APP_DARK.accent"]).toBe("#2f6bff");
    expect(ACCENTS_EXEMPT["ARENA_DARK.lime"]).toBe("#c4ff00");
    expect(blueCast(ACCENTS_EXEMPT["APP_DARK.accent"])).toBeGreaterThan(100);
  });

  it("does not touch the light theme", () => {
    // The owner's request was scoped to dark. The light palette is the
    // investor-reviewed Energetic theme and its purple/cream cast is intended.
    expect(APP_LIGHT.bg).toBe("#fffbf5");
    expect(APP_LIGHT.surface).toBe("#ffffff");
    expect(APP_LIGHT.accent).toBe("#7c3aed");
  });
});

describe("neutralising the hue did not move the contrast", () => {
  // Ratios measured against the palette as it stood BEFORE the neutral pass.
  // Each replacement was luminance-matched, so every pair below is within 0.03
  // of its blue predecessor and no WCAG grade changed.
  //
  // The 2026-09-10 pillBg re-tint is held to the same standard and beat it:
  // #182447 -> #232532 holds L*ab at 15.01 and moves Y by 1.3e-6, so pillText
  // on pillBg goes 8.2899:1 -> 8.2900:1 and NOTHING in either palette falls.
  // Two surface-vs-surface pairs (bg/pillBg, surface/pillBg) drift down by
  // 2e-5, four decimal places below the 0.0082 worst case of the hue pass.
  const CASES: [string, string, string, number][] = [
    ["APP text on bg", APP_DARK.text, APP_DARK.bg, 17.33],
    ["APP text on surface", APP_DARK.text, APP_DARK.surface, 15.08],
    ["APP text on chipBg", APP_DARK.text, APP_DARK.chipBg, 13.62],
    ["APP chipText on chipBg", APP_DARK.chipText, APP_DARK.chipBg, 11.51],
    ["APP muted on bg", APP_DARK.muted, APP_DARK.bg, 6.8],
    ["APP muted on surface", APP_DARK.muted, APP_DARK.surface, 5.92],
    ["APP pillText on pillBg", APP_DARK.pillText, APP_DARK.pillBg, 8.29],
    ["ARENA ink on bg", ARENA_DARK.ink, ARENA_DARK.bg, 17.33],
    ["ARENA ink on bg2", ARENA_DARK.ink, ARENA_DARK.bg2, 16.04],
    ["ARENA ink on panel", ARENA_DARK.ink, ARENA_DARK.panel, 15.08],
    ["ARENA ink on panel2", ARENA_DARK.ink, ARENA_DARK.panel2, 13.62],
    ["ARENA muted on panel", ARENA_DARK.muted, ARENA_DARK.panel, 5.08],
    ["ARENA muted on panel2", ARENA_DARK.muted, ARENA_DARK.panel2, 4.59],
    ["ARENA lime on panel", ARENA_DARK.lime, ARENA_DARK.panel, 14.08],
    ["ARENA red on panel", ARENA_DARK.red, ARENA_DARK.panel, 5.21],
    ["ARENA gold on panel", ARENA_DARK.gold, ARENA_DARK.panel, 10.94],
  ];

  it.each(CASES)("%s holds its pre-neutral ratio", (_label, fg, bg, before) => {
    expect(contrast(fg, bg)).toBeCloseTo(before, 1);
  });

  it("still clears WCAG AA for body text on every neutral surface", () => {
    for (const s of [APP_DARK.bg, APP_DARK.surface, APP_DARK.chipBg]) {
      expect(`${s}:${contrast(APP_DARK.text, s) >= 4.5}`).toBe(`${s}:true`);
      expect(`${s}:${contrast(APP_DARK.muted, s) >= 4.5}`).toBe(`${s}:true`);
    }
    for (const s of [
      ARENA_DARK.bg,
      ARENA_DARK.bg2,
      ARENA_DARK.panel,
      ARENA_DARK.panel2,
    ]) {
      expect(`${s}:${contrast(ARENA_DARK.ink, s) >= 4.5}`).toBe(`${s}:true`);
      expect(`${s}:${contrast(ARENA_DARK.muted, s) >= 4.5}`).toBe(`${s}:true`);
    }
  });

  it("keeps ARENA_DARK.dim below AA — accepted by the owner on 2026-09-10", () => {
    // ACCEPTED, not outstanding. The numbers, so the decision travels with its
    // evidence: dim misses AA on all four arena surfaces, worst on panel2.
    expect(contrast(ARENA_DARK.dim, ARENA_DARK.bg)).toBeCloseTo(3.25, 2);
    expect(contrast(ARENA_DARK.dim, ARENA_DARK.bg2)).toBeCloseTo(3.01, 2);
    expect(contrast(ARENA_DARK.dim, ARENA_DARK.panel)).toBeCloseTo(2.83, 2);
    expect(contrast(ARENA_DARK.dim, ARENA_DARK.panel2)).toBeCloseTo(2.56, 2);
    expect(contrast(ARENA_DARK.dim, ARENA_DARK.panel) >= 4.5).toBe(false);
  });

  it("shows WHY lightening dim was refused: an AA dim collapses into muted", () => {
    // The remedy that gets proposed every time is "just lighten it to ~#858585".
    // That value is quoted off `panel` and does not survive `panel2`, which is
    // the lightest surface dim can land on and therefore the one that sets the
    // floor.
    expect(contrast("#858585", ARENA_DARK.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#858585", ARENA_DARK.panel2)).toBeLessThan(4.5);

    // Walk the greys to the real floor: the first one that clears AA on EVERY
    // arena surface. It is #8c8c8c — and muted is #8f8d8d, three code points
    // away. The third tier cannot exist at AA, so keeping dim as-is preserves a
    // hierarchy that "fixing" it would delete.
    const surfaces = [ARENA_DARK.bg, ARENA_DARK.bg2, ARENA_DARK.panel, ARENA_DARK.panel2];
    let floor = "";
    for (let v = 0x64; v <= 0xff && !floor; v++) {
      const hex = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      if (surfaces.every((s) => contrast(hex, s) >= 4.5)) floor = hex;
    }
    expect(floor).toBe("#8c8c8c");
    expect(rgb(ARENA_DARK.muted)[0] - rgb(floor)[0]).toBeLessThanOrEqual(3);
  });

  it("pays the debt on the other side: muted clears AA on every arena surface", () => {
    // This is the half of the decision that makes the failing expectation above
    // defensible: READ strings take muted, and dim carries icons, hairlines and
    // decoration, which WCAG 1.4.3 does not govern. If this ever stops holding,
    // the trade collapses and dim has to be revisited.
    //
    // This test proves only the TOKEN half — that muted is a place to move text
    // TO. The other half, that text actually moved there, is not provable from
    // a palette and was asserted in prose here until seventeen live violations
    // showed what prose is worth; it is swept out of the source at the bottom of
    // this file instead.
    for (const s of [ARENA_DARK.bg, ARENA_DARK.bg2, ARENA_DARK.panel, ARENA_DARK.panel2]) {
      expect(`${s}:${contrast(ARENA_DARK.muted, s) >= 4.5}`).toBe(`${s}:true`);
    }
    // …and the rule is recorded where the next call site will read it, not only
    // here: a token comment is what a developer sees on hover.
    const src = read("src/theme/tokens.ts");
    expect(src).toContain("ICONS/DECORATION ONLY; text takes muted");
    expect(src).toContain("It is NOT a text colour.");
  });
});

describe("chroma is budgeted by ROLE, so a missed neutral fails either way", () => {
  // The sweep that produced this palette had two boxes and needed three. These
  // are the walls between the tiers; the shipped numbers are quoted in each
  // comment, so drift shows up as a distance rather than as a bare boolean.

  it("keeps every neutral surface and neutral ink at a spread of 2 or less", () => {
    // Shipped: 1 (dim) to 2 (border/line). A neutral that regains a blue CAST
    // fails the hue tests above; a neutral that regains SATURATION in any other
    // direction — a warm charcoal, a green-grey — fails here instead.
    for (const [name, hex] of Object.entries(NEUTRAL_DARK)) {
      expect(`${name} spread=${spread(hex)}`).toBe(
        `${name} spread=${Math.min(spread(hex), 2)}`,
      );
    }
  });

  it("keeps every brand accent at a spread of 90 or more", () => {
    // Shipped: 96 (pillText) to 255 (accent2/lime). This is the "flatten
    // everything" guard: the owner asked for neutral SURFACES, so a future pass
    // that runs the desaturation over the brand fails right here.
    for (const [name, hex] of Object.entries(ACCENTS_EXEMPT)) {
      expect(`${name} spread=${spread(hex)}`).toBe(
        `${name} spread=${Math.max(spread(hex), 90)}`,
      );
    }
  });

  it("holds the tinted surface strictly between the two tiers", () => {
    // pillBg ships at 15 (C*ab 9.2). The window is closed at BOTH ends because
    // both ends are the bug: 47 is the web value this round removed (ink
    // strength among neutral neighbours, reading as a foreign navy block) and
    // 1 would be the over-correction (a pill with no accent left in it).
    for (const [name, hex] of Object.entries(TINTED_SURFACES)) {
      const v = spread(hex);
      expect(`${name} spread=${v} tinted=${v >= 6} quiet=${v <= 24}`).toBe(
        `${name} spread=${v} tinted=true quiet=true`,
      );
    }
  });

  it("never lets a tinted surface out-saturate its own ink", () => {
    // A pill whose BACKGROUND is more saturated than its LABEL is the shape of
    // the reported bug, and it is a shape light mode never had: there the pill
    // ground is a 7.6-chroma tint sitting under the full-strength accent.
    expect(spread(APP_DARK.pillBg)).toBeLessThan(spread(APP_DARK.pillText));
    expect(spread(APP_LIGHT.pillBg)).toBeLessThan(spread(APP_LIGHT.pillText));
  });

  it("points the tinted surface at the accent, not at some other hue", () => {
    // Tinted means tinted WITH THE BRAND. The dark accent is blue, so the pill
    // ground leans blue (cast +13; the accent itself is +204) while every
    // neutral leans the other way — which is what the tests above assert.
    expect(blueCast(APP_DARK.pillBg)).toBeGreaterThan(5);
    expect(blueCast(APP_DARK.accent)).toBeGreaterThan(100);
  });

  it("keeps the tinted surface at chip lightness, told apart by hue alone", () => {
    // 1.003:1 — the pill and the chip are the same tier of surface and the ONLY
    // thing separating them is the tint. That is precisely why the tint has to
    // survive the neutral pass: remove it and the two collapse into one surface.
    expect(contrast(APP_DARK.pillBg, APP_DARK.chipBg)).toBeLessThan(1.1);
    expect(contrast(APP_DARK.pillText, APP_DARK.pillBg)).toBeCloseTo(8.29, 1);
    // The tab bar paints its active pill as accent ink on this same ground.
    expect(contrast(APP_DARK.accent, APP_DARK.pillBg)).toBeGreaterThanOrEqual(3);
  });
});

describe("surface-vs-surface separation survives without a hue component", () => {
  // Neutralising the palette removed the chroma half of every surface pair. In
  // most places a second signal carries the separation anyway — a border, a
  // shadow, an accent ink. The ProgressRing track has none of those: it is a
  // bare arc on a panel, so the luminance step is its entire read.

  it("gives the home rank ring a track with a real luminance step", () => {
    // bg2 on panel is 1.064:1 (3.02 L*ab, dE00 1.88) — the weakest pair in the
    // palette, at the discrimination threshold for a 9px arc. bg on panel is
    // 1.147:1 (6.87 L*ab, dE00 4.22): the same inset groove, one tier deeper.
    expect(contrast(ARENA_DARK.bg2, ARENA_DARK.panel)).toBeCloseTo(1.064, 2);
    expect(contrast(ARENA_DARK.bg, ARENA_DARK.panel)).toBeCloseTo(1.147, 2);
    expect(contrast(ARENA_DARK.bg, ARENA_DARK.panel)).toBeGreaterThan(
      contrast(ARENA_DARK.bg2, ARENA_DARK.panel),
    );
  });

  it("buys that step DOWNWARD, because the sweep is painted on the track", () => {
    // The obvious alternative is to go lighter: `line` on panel is 1.306:1,
    // twice the step. It is the wrong trade — the brand gradient's purple stop
    // sits ON the track and measures 3.38:1 over bg but only 2.26:1 over line,
    // so a future "make the track more visible" pass that reaches for a lighter
    // neutral fails here instead of in review.
    expect(contrast(BRAND_GRADIENT[0], ARENA_DARK.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(BRAND_GRADIENT[0], ARENA_DARK.line)).toBeLessThan(3);
    expect(contrast(BRAND_GRADIENT[1], ARENA_DARK.bg)).toBeGreaterThanOrEqual(3);
  });

  it("wires the home ring to a THEME-AWARE track in the screen itself", () => {
    const src = read("src/app/(student)/(tabs)/home.tsx");
    expect(src).toMatch(/trackColor=\{theme === "dark" \? arena\.bg : arena\.line\}/);
    // A BARE token is the 2026-09-10 regression in either direction: `arena.bg`
    // is right in dark and is the lightest surface light owns; `arena.line` is
    // right in light and costs the dark ring its purple read.
    expect(src).not.toMatch(/trackColor=\{arena\.\w+\}/);
    // …and the screen has to actually hold `theme`, or the expression above is
    // a typecheck error rather than a rendered track.
    expect(src).toMatch(/const \{ arena, theme \} = useArena\(\);/);
  });
});

describe("the LIGHT arena needs the other end of that same step", () => {
  // THE REGRESSION THIS BLOCK EXISTS FOR (2026-09-10). The dark fix above was
  // justified and measured against the dark palette ALONE, and `trackColor` is
  // not a theme-aware value: it is one token, used by both. In the light arena
  // the panel is pure WHITE and `bg` is the lightest surface the palette owns,
  // so the very edit that deepened the dark groove flattened the light one.
  //
  // Light can only buy its step DOWNWARD — there is nothing above white — and
  // the cost that made `line` wrong for dark is not charged here: the purple
  // stop clears 3:1 over every light `line`. The two themes therefore take
  // OPPOSITE tokens, and the assertions below are what make that necessary
  // rather than decorative.

  /** The step a track must buy against its own panel: what dark's `bg` ships
   *  (1.147:1). Below it lie the pairs this project has already looked at and
   *  walked away from — `bg2`'s 1.064:1 in dark, `bg`'s 1.031:1 in light. */
  const TRACK_STEP_MIN = 1.14;
  /** WCAG's non-text minimum, applied to the gradient's purple stop where it is
   *  painted ON the track. */
  const SWEEP_MIN = 3;

  const lightPalettes = Object.entries(ARENA_LIGHT) as [string, ArenaTokens][];

  it("covers every palette a child can actually choose", () => {
    // 27 = the base light look plus the 26 selectable palettes. If the picker
    // grows, the loops below grow with it instead of quietly testing a subset.
    expect(lightPalettes.length).toBe(27);
    expect(lightPalettes.map(([n]) => n)).toContain("default");
  });

  it("records what the dark-only edit cost the light ring", () => {
    // The three numbers, on the palette a child has before choosing one: bg2 is
    // what the ring had, bg is what the dark-only edit gave it, line is what it
    // has now.
    const d = ARENA_LIGHT.default;
    expect(contrast(d.bg2, d.panel)).toBeCloseTo(1.062, 3);
    expect(contrast(d.bg, d.panel)).toBeCloseTo(1.031, 3);
    expect(contrast(d.line, d.panel)).toBeCloseTo(1.275, 3);
  });

  it("gives the light track a real luminance step on every palette", () => {
    // Shipped range: 1.275 (default) … 1.296 (bubblegum) — 9.5–10.1 L*ab.
    for (const [name, p] of lightPalettes) {
      expect(`${name} ${contrast(p.line, p.panel) >= TRACK_STEP_MIN}`).toBe(`${name} true`);
    }
  });

  it("keeps the sweep's purple stop readable over that track", () => {
    // 4.397 … 4.469 across the palettes. The dark trap (2.26:1 over `line`) has
    // no counterpart in light, which is the whole reason the two themes are
    // allowed to take opposite tokens.
    for (const [name, p] of lightPalettes) {
      expect(`${name} ${contrast(BRAND_GRADIENT[0], p.line) >= SWEEP_MIN}`).toBe(`${name} true`);
    }
  });

  it("records the orange stop as light's weak half, asserted AS failing", () => {
    // It reaches 3:1 against NO light surface — not the track (1.82–1.85), not
    // even the white panel the ring is drawn on (2.363). So it cannot be the
    // criterion the track is chosen by, and saying so here is what stops a later
    // "make the ring pop" pass from chasing a number the light theme cannot
    // deliver without changing the brand gradient.
    expect(contrast(BRAND_GRADIENT[1], "#ffffff")).toBeCloseTo(2.363, 2);
    for (const [name, p] of lightPalettes) {
      expect(`${name} ${contrast(BRAND_GRADIENT[1], p.line) >= SWEEP_MIN}`).toBe(`${name} false`);
    }
  });

  it("fails every SINGLE token used as the track in both themes", () => {
    // The shape of the bug, as a test. A track has to clear two bars at once — a
    // step against its panel, and a purple stop that survives being painted on
    // it — and no one token clears both in both themes:
    //
    //   bg      dark 1.147 / purple 3.38  ·  light 1.028–1.091  -> no step
    //   bg2     dark 1.064                ·  light 1.061–1.217  -> no step
    //   panel2  dark 1.108                ·  light 1.051–1.148  -> no step
    //   line    dark 1.306 / purple 2.26  ·  light 1.275–1.296  -> dark sweep
    //
    // So the conditional in home.tsx is forced, not stylistic, and a future
    // single-theme edit to it lands here rather than in a screenshot.
    const reads = (track: string, panel: string) =>
      contrast(track, panel) >= TRACK_STEP_MIN && contrast(BRAND_GRADIENT[0], track) >= SWEEP_MIN;
    for (const key of ["bg", "bg2", "panel2", "line"] as const) {
      const inDark = reads(ARENA_DARK[key], ARENA_DARK.panel);
      const inLight = lightPalettes.every(([, p]) => reads(p[key], p.panel));
      expect(`${key} both=${inDark && inLight}`).toBe(`${key} both=false`);
    }
    // Positively: each theme's chosen token does read in ITS OWN theme.
    expect(reads(ARENA_DARK.bg, ARENA_DARK.panel)).toBe(true);
    expect(lightPalettes.every(([, p]) => reads(p.line, p.panel))).toBe(true);
  });

  it("leaves the light palette values themselves untouched", () => {
    // The fix is a token CHOICE in one screen. Nothing here re-tunes a palette:
    // ARENA_LIGHT is generated from the web (npm run sync-palettes), and hand
    // edits are how it drifted before.
    expect(ARENA_LIGHT.default.panel).toBe("#ffffff");
    expect(ARENA_LIGHT.default.line).toBe("#e9e0f7");
    expect(ARENA_LIGHT.default.bg).toBe("#fffbf5");
  });
});

describe("the override is documented where a future session will look", () => {
  // Three files told the next agent to re-sync dark from the web. Each was
  // amended in the same change; if any amendment is reverted the blue comes back
  // on the next "fix the drift" pass, so all three are pinned here.
  it.each([
    ["src/theme/tokens.ts"],
    ["markdowns/MOBILE_APP_MASTER_PLAN.md"],
    ["CLAUDE.md"],
  ])("%s records that dark is mobile-authored, not mirrored", (path) => {
    const src = read(path);
    expect(src).toMatch(/2026-09-10/);
    expect(src).toMatch(/neutral charcoal|no longer mirrored|mobile-authored/i);
  });

  it("keeps the mirroring instruction alive for LIGHT only", () => {
    // The header still has to command mirroring — the light theme genuinely is
    // the web's, and hand-invented light values are how ARENA_LIGHT drifted
    // before. Narrowing the rule is the fix; deleting it is not.
    const src = read("src/theme/tokens.ts");
    expect(src).toMatch(/LIGHT is MIRRORED from web-app/);
  });

  it("sends nobody to a web-app palette file to make this change", () => {
    const src = read("src/theme/tokens.ts");
    expect(src).toMatch(/Leave\s*\n?\s*\/\/\s*web-app\/src\/lib\/theme\/palettes\.ts/);
  });
});
/**
 * THE CONFINEMENT, ENFORCED — added 2026-09-10, in the round after the token
 * decision was taken.
 *
 * That decision is defensible ONLY while `dim` stays off text, and for a round
 * the clause was prose: `tokens.ts` said the sweep was done, this file said it
 * twice, and SEVENTEEN readable strings were still painted in `dim` behind the
 * claim — including a status-pill label at 2.51:1 and a subject monogram at
 * 1.63:1, both WORSE than the 2.56 worst case the owner actually weighed. A
 * false claim standing next to a token is worse than no claim: it tells the
 * next reader the audit already happened.
 *
 * So the rule is CHECKED, not asserted. This sweep reads the source and fails
 * on any `dim` that reaches a text sink:
 *
 *   * a `color` prop on anything that is not an icon,
 *   * `placeholderTextColor` / `selectionColor` / friends anywhere,
 *   * a `color:` style property — in React Native that property paints text and
 *     nothing else,
 *   * …reached DIRECTLY (`arena.dim`) or THROUGH A LOCAL ALIAS, because the two
 *     worst sites were both aliases (`const accent = done ? arena.dim : …` and
 *     the pill's `const color = … : arena.dim`). A regex hunting for
 *     `arena.dim` next to `<AppText` would have missed the pair of them.
 *
 * ICONS ARE ALLOWED BY NAME, never by guesswork: the allowlist is whatever the
 * file imports from `lucide-react-native`, plus the local aliases a lucide
 * component is held in when the glyph is chosen at runtime. A non-icon that is
 * genuinely decorative and takes a `color` prop goes in `DECORATIVE_TAGS` with
 * a reason — an exemption you have to name is one you cannot widen by accident.
 */
describe("`dim` is confined to decoration — swept out of the SOURCE, not just declared", () => {
  /** Local aliases for a lucide component picked at runtime (`const Glyph = warn ? … : …`). */
  const ICON_ALIASES = ["Glyph", "Icon"];
  /** Non-icon components whose `color` prop paints decoration. Empty on purpose. */
  const DECORATIVE_TAGS: string[] = [];
  /** Props that paint TEXT. `color` is one of them, and only on a non-icon. */
  const TEXT_PROPS = [
    "color",
    "placeholderTextColor",
    "selectionColor",
    "cursorColor",
    "textColor",
    "titleColor",
  ];

  /** Index of the closing quote of the string starting at `i` (escape-aware). */
  const endOfString = (s: string, i: number): number => {
    const q = s[i];
    for (let j = i + 1; j < s.length; j++) {
      if (s[j] === "\\") j++;
      else if (s[j] === q) return j;
    }
    return s.length - 1;
  };

  /**
   * Comments BLANKED — string/template/regex aware, and LENGTH-PRESERVING, so
   * every offset below is still a real offset in the real file: a reported line
   * number nobody can open is worse than no line number. A rule WRITTEN IN PROSE
   * must never register as a USE of the thing it forbids, and this file and the
   * token doc it guards are both full of the word.
   */
  const maskComments = (src: string): string => {
    let out = "";
    let i = 0;
    const prevCode = (): string => {
      for (let k = out.length - 1; k >= 0; k--) if (!/\s/.test(out[k])) return out[k];
      return "";
    };
    while (i < src.length) {
      const c = src[i];
      const d = src[i + 1];
      if (c === "/" && d === "/") {
        while (i < src.length && src[i] !== "\n") {
          out += " ";
          i++;
        }
        continue;
      }
      if (c === "/" && d === "*") {
        const close = src.indexOf("*/", i + 2);
        const end = close < 0 ? src.length : close + 2;
        for (; i < end; i++) out += src[i] === "\n" ? "\n" : " ";
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        const end = endOfString(src, i);
        out += src.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      if (c === "/" && /[(,=:[!&|?{};+\-*%<>~^]/.test(prevCode())) {
        let j = i + 1;
        for (; j < src.length; j++) {
          if (src[j] === "\\") j++;
          else if (src[j] === "/") break;
        }
        out += src.slice(i, j + 1);
        i = j + 1;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  };

  type Attr = { name: string; value: string; at: number };
  type Tag = { name: string; attrs: Attr[] };

  /**
   * Attributes of ONE opening tag. A nested element inside an attribute value
   * (`icon={<CircleMinus color={arena.dim} />}`) is brace-skipped here and
   * visited as its own tag, so the icon is judged as an icon.
   */
  const attributes = (attrs: string, base: number): Attr[] => {
    const out: Attr[] = [];
    const re = /(^|\s)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(attrs))) {
      const start = m.index + m[0].length;
      let end = start;
      if (attrs[start] === "{") {
        let depth = 0;
        for (end = start; end < attrs.length; end++) {
          const ch = attrs[end];
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              end++;
              break;
            }
          } else if (ch === '"' || ch === "'" || ch === "`") end = endOfString(attrs, end);
        }
      } else if (attrs[start] === '"' || attrs[start] === "'") {
        end = endOfString(attrs, start) + 1;
      } else {
        while (end < attrs.length && !/\s/.test(attrs[end])) end++;
      }
      out.push({ name: m[2], value: attrs.slice(start, end), at: base + start });
      re.lastIndex = end;
    }
    return out;
  };

  /** Every opening JSX tag in a file, each with its own attributes. */
  const openingTags = (src: string): Tag[] => {
    const tags: Tag[] = [];
    for (let i = 0; i < src.length; i++) {
      if (src[i] !== "<") continue;
      // `Record<string, …>` and `a < b` are not tags: a tag never follows an
      // identifier character.
      if (/[A-Za-z0-9_$)\]]/.test(src[i - 1] ?? " ")) continue;
      const m = /^<([A-Z][A-Za-z0-9_.]*)/.exec(src.slice(i, i + 64));
      if (!m) continue;
      let j = i + m[0].length;
      let depth = 0;
      for (; j < src.length; j++) {
        const c = src[j];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === '"' || c === "'" || c === "`") j = endOfString(src, j);
        else if (c === ">" && depth === 0) break;
      }
      tags.push({ name: m[1], attrs: attributes(src.slice(i + m[0].length, j), i + m[0].length) });
    }
    return tags;
  };

  type Decl = { name: string; at: number; dim: boolean };

  /** `const`/`let` bindings, flagged when their initialiser reaches `dim`. */
  const declarations = (src: string): Decl[] => {
    const out: Decl[] = [];
    const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // The initialiser only — capped at the statement end or four lines, so a
      // function BODY cannot make its enclosing binding look like a colour.
      const from = m.index + m[0].length;
      const semi = src.indexOf(";", from);
      let end = semi < 0 ? src.length : semi;
      let lines = 0;
      for (let k = from; k < end; k++) {
        if (src[k] === "\n" && ++lines === 4) {
          end = k;
          break;
        }
      }
      out.push({ name: m[1], at: m.index, dim: /\.dim\b/.test(src.slice(from, end)) });
    }
    // `const { dim } = arena` — the alias with no dot left in it.
    const de = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g;
    while ((m = de.exec(src))) {
      for (const part of m[1].split(",")) {
        const [from, to] = part.split(":").map((s) => s.trim());
        if (from === "dim") out.push({ name: (to || from).trim(), at: m.index, dim: true });
      }
    }
    return out;
  };

  /** Does this expression resolve to `dim` at position `at`? */
  const reachesDim = (value: string, at: number, decls: Decl[]): boolean => {
    if (/\.dim\b/.test(value)) return true;
    for (const name of new Set(decls.map((d) => d.name))) {
      if (!new RegExp(`\\b${name}\\b`).test(value)) continue;
      // Nearest PRECEDING binding of the name wins: two components in one file
      // routinely each hold a `const color`, and only one of them may be dim.
      const seen = decls.filter((d) => d.name === name && d.at < at).sort((x, y) => x.at - y.at);
      if (seen.length && seen[seen.length - 1].dim) return true;
    }
    return false;
  };

  /** Tags allowed to take `dim`: whatever THIS file imports from lucide. */
  const iconTags = (src: string): Set<string> => {
    const set = new Set([...ICON_ALIASES, ...DECORATIVE_TAGS]);
    const re = /import\s*\{([^}]*)\}\s*from\s*["']lucide-react-native["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      for (const part of m[1].split(",")) {
        const name = part.split(" as ").pop()?.trim();
        if (name) set.add(name);
      }
    }
    return set;
  };

  type Hit = { prop: string; tag: string; line: number };

  /** Every place `dim` reaches text in one file. */
  const textUses = (src: string): Hit[] => {
    const code = maskComments(src);
    const decls = declarations(code);
    const icons = iconTags(code);
    const lineAt = (at: number): number => code.slice(0, at).split("\n").length;
    const hits: Hit[] = [];
    for (const tag of openingTags(code)) {
      for (const attr of tag.attrs) {
        if (!TEXT_PROPS.includes(attr.name)) continue;
        if (attr.name === "color" && icons.has(tag.name)) continue;
        if (reachesDim(attr.value, attr.at, decls)) {
          hits.push({ prop: attr.name, tag: `<${tag.name}>`, line: lineAt(attr.at) });
        }
      }
    }
    // `color:` in a style object needs no tag context — in React Native it
    // paints text and nothing else. `backgroundColor:`, `borderColor:` and
    // `tintColor:` deliberately do not match.
    const styleRe = /([A-Za-z0-9_$]?)color\s*:\s*([^,\n}]+)/g;
    let m: RegExpExecArray | null;
    while ((m = styleRe.exec(code))) {
      if (m[1] && /[A-Za-z0-9_$]/.test(m[1])) continue;
      if (reachesDim(m[2], m.index, decls)) hits.push({ prop: "color:", tag: "style", line: lineAt(m.index) });
    }
    return hits;
  };

  const ROOT = resolve(__dirname, "..");

  /** Hand-written sources only — the generated palettes are data, not call sites. */
  const sources = (): string[] => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return walk(p);
        if (!/\.tsx?$/.test(e.name) || /\.generated\./.test(e.name)) return [];
        return [p];
      });
    return walk(join(ROOT, "src"));
  };

  it("reports every shape the seventeen used — aliases included", () => {
    // The sweep below passes by finding nothing, which is also what a broken
    // parser does. This is the difference: a fixture carrying one of every shape
    // the seventeen real sites wore, all of which MUST come back.
    const fixture = [
      'import { ChevronDown } from "lucide-react-native";',
      "export function F({ arena, done, tone }) {",
      "  const accent = done ? arena.dim : arena.blue;",
      '  const color = tone === "ok" ? arena.lime : arena.dim;',
      "  return (",
      "    <View>",
      "      <ChevronDown size={16} color={arena.dim} strokeWidth={2} />",
      "      <AppText color={arena.dim}>read me</AppText>",
      '      <AppText variant="title" color={accent}>A</AppText>',
      "      <AppText color={color}>label</AppText>",
      "      <View style={{ backgroundColor: tint(accent, 0.14), borderColor: arena.dim }}>",
      "        <Text style={{ color: arena.dim }}>styled</Text>",
      "      </View>",
      "      <TextInput placeholderTextColor={arena.dim} />",
      "    </View>",
      "  );",
      "}",
    ].join("\n");

    expect(textUses(fixture).map((h) => `${h.prop} ${h.tag}`).sort()).toEqual([
      "color <AppText>",
      "color <AppText>",
      "color <AppText>",
      "color: style",
      "placeholderTextColor <TextInput>",
    ]);
    // Five hits and not seven: the lucide icon, the tinted ground and the border
    // are NOT reported. That half IS the decision — `dim` keeps its job.
    expect(textUses(fixture).length).toBe(5);
  });

  it("finds no `dim` on any text in src/", () => {
    const offenders: string[] = [];
    for (const file of sources()) {
      const src = readFileSync(file, "utf8").split("\r\n").join("\n");
      if (!/\bdim\b/.test(src)) continue; // a file that never names it cannot use it
      const where = relative(ROOT, file).split("\\").join("/");
      for (const h of textUses(src)) offenders.push(`${where}:${h.line} ${h.prop} on ${h.tag}`);
    }
    // If this fails the fix is `arena.muted`, never a lighter `dim` — the tests
    // above show a lightened one collapses the third tier into the second.
    expect(offenders).toEqual([]);
  });

  it("still lets icons and decoration keep it, and proves some do", () => {
    // This is a CONFINEMENT, not a removal. If it ever reaches zero the token
    // has no job left and the three-tier argument above is moot.
    let decoration = 0;
    for (const file of sources()) {
      const src = readFileSync(file, "utf8").split("\r\n").join("\n");
      decoration += (maskComments(src).match(/\.dim\b/g) ?? []).length;
    }
    expect(decoration).toBeGreaterThan(0);
  });
});
