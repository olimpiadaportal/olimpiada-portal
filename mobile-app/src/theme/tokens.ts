// Design tokens for the mobile app.
//
// LIGHT is MIRRORED from web-app/src/app/globals.css — never invent light values
// here; when the web light palette changes, this file changes with it.
//
// DARK IS DELIBERATELY NO LONGER MIRRORED (owner override, 2026-09-10). The web
// dark palette is blue-black (#0a0e1a / #141d33 / #26314f …); the owner asked for
// a NEUTRAL charcoal on mobile, so APP_DARK and ARENA_DARK below carry near-grey
// surfaces that INTENTIONALLY DIVERGE from the web. That is not drift, and it is
// not a bug to be "fixed" by re-syncing the blue back:
//   * The divergence is MOBILE-ONLY and cannot leak to the web. The generator
//     (web-app/scripts/gen-palettes.mjs) emits ARENA_LIGHT_GENERATED only — it
//     never writes a dark token — and nothing under mobile-app/ reads globals.css.
//     Values flow web -> mobile, never back.
//   * Root CLAUDE.md's "dark mode is the owner's reference design — do not change
//     it" still governs the WEB tokens and the web .arena palette. Leave
//     web-app/src/lib/theme/palettes.ts and web-app/src/app/globals.css alone.
//   * Every replacement is LUMINANCE-MATCHED to the blue value it replaced, so no
//     contrast ratio moved by more than 0.03 and no WCAG grade changed. Re-tuning
//     one means re-matching its luminance, not eyeballing a new grey.
//   * Brand accents keep their hue, blue ones included: accent/accent2/ok/warn/
//     danger and arena lime/blue/red/gold. "Neutral" describes the SURFACES,
//     never the brand.
//   * CHROMA IS BUDGETED BY ROLE, and there are THREE roles, not two. Neutral
//     surfaces and neutral inks sit at C*ab <= 1.4; brand accents sit at
//     C*ab >= 30; and `pillBg` is the single TINTED SURFACE in between, at
//     C*ab 9.2. Skipping that middle tier is the mistake this pass fixed: the
//     2026-09-10 sweep flattened every surface and left pillBg at the web's
//     ink-strength C*ab 24.7, so the one tinted surface stopped reading as a
//     tint of its neighbours and started reading as a foreign navy block.
//   * __tests__/dark-theme-neutrality.test.ts pins the invariant and fails if a
//     dark surface or neutral ink regains a blue cast.
//
// The arena-light surfaces are no longer mirrored by hand: they are GENERATED
// from web-app/src/lib/theme/palettes.ts — run `npm run sync-palettes`. Hand
// mirroring is exactly what let ARENA_LIGHT.default drift onto a SUPERSEDED web
// block, so the student light default rendered green-on-grey instead of the
// owner's purple-on-cream. Generation makes that impossible.
//
// Four surfaces exist and all are covered:
//   * "light"  — the Energetic light theme (:root / [data-theme="light"])
//   * "dark"   — MOBILE-AUTHORED neutral charcoal (see the override above); the
//     web's own [data-theme="dark"] block stays blue and stays frozen
//   * "arena"  — the student shell's own dark palette, likewise neutralised
//   * "arena light" — [data-theme="light"] .arena remap, plus the 26 child
//     palettes ([data-palette="<slug>"]).
import {
  ARENA_LIGHT_GENERATED,
  ARENA_PALETTE_SLUGS,
} from "./palettes.generated";

export type ThemeName = "light" | "dark";
export type ArenaPalette = "default" | (typeof ARENA_PALETTE_SLUGS)[number];

export const ARENA_PALETTES: ArenaPalette[] = ["default", ...ARENA_PALETTE_SLUGS];

/** Parent/public tokens (web :root + [data-theme=dark]). */
export type AppTokens = {
  bg: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accent2: string;
  ok: string;
  warn: string;
  surface: string;
  chipBg: string;
  chipText: string;
  pillBg: string;
  pillText: string;
  danger: string;
  shadow: string;
};

export const APP_LIGHT: AppTokens = {
  bg: "#fffbf5",
  text: "#2a1a3e",
  muted: "#9a8aa8",
  border: "#f0e7f5",
  accent: "#7c3aed",
  accent2: "#ff8a00",
  ok: "#06b66b",
  warn: "#c2610a",
  surface: "#ffffff",
  chipBg: "#f7f0fe",
  chipText: "#2a1a3e",
  pillBg: "#f7f0fe",
  pillText: "#7c3aed",
  danger: "#ff4757",
  shadow: "rgba(124, 58, 237, 0.1)",
};

/**
 * Parent/public DARK — neutral charcoal, mobile-authored (2026-09-10). Each
 * surface/ink below is the luminance-matched neutral of the web blue it
 * replaced; the accents are untouched. See the file header before editing.
 */
export const APP_DARK: AppTokens = {
  bg: "#100e0e", // was #0a0e1a
  text: "#f3f3f1", // was #eef3ff
  muted: "#9b9999", // was #8b99c0
  border: "#323230", // was #26314f
  accent: "#2f6bff",
  accent2: "#ff8a00",
  ok: "#9be15d",
  warn: "#ffc94d",
  surface: "#1f1d1d", // was #141d33
  chipBg: "#262625", // was #1a2542
  chipText: "#e2e0e0", // was #d6e0ff
  // The ACCENT-TINTED PAIR (light mode tints it purple; dark keeps the accent
  // hue). The two halves carry DIFFERENT strengths because they play different
  // roles, and collapsing that distinction is what broke here once:
  //   * pillBg is a SURFACE. It sits at chip lightness by design (L*ab 15.01 vs
  //     chipBg's 15.13 — 1.003:1, i.e. the same tier), so HUE is the only thing
  //     that tells the two apart and its chroma is the whole signal. The web's
  //     C*ab 24.7 was right while every neighbouring surface was navy at C*ab
  //     16–21; against the neutral surfaces above (C*ab <= 1.4) that same value
  //     reads as a foreign block, not as a tint. Cut to C*ab 9.2 — the whisper
  //     the LIGHT pill already carries over its own ground (#f7f0fe is C*ab
  //     7.6) — at MATCHED luminance: Y 0.0191088 -> 0.0191075 (-0.007%), so
  //     pillText on pillBg moves 8.2899:1 -> 8.2900:1 and accent on pillBg
  //     (the tab bar's active pill) moves 3.3772:1 -> 3.3773:1.
  //   * pillText is an INK and keeps full accent strength (C*ab 34.8).
  pillBg: "#232532", // was #182447 — L*ab held at 15.01, C*ab 24.7 -> 9.2
  pillText: "#9fc0ff",
  danger: "#ff6b85",
  shadow: "rgba(0, 0, 0, 0.5)",
};

/** Student arena tokens (web .arena variable block). */
export type ArenaTokens = {
  bg: string;
  bg2: string;
  panel: string;
  panel2: string;
  line: string;
  ink: string;
  muted: string;
  dim: string;
  lime: string;
  blue: string;
  red: string;
  gold: string;
};

/**
 * Student arena DARK — neutralised in the same 2026-09-10 pass as APP_DARK, on
 * the same luminance-matched basis.
 *
 * `dim` KEEPS ITS LIGHTNESS — OWNER DECISION, 2026-09-10, SETTLED. It is the
 * quietest of three ink tiers and it does not reach WCAG AA for text:
 *
 *     ink   #f3f3f1   bg 17.32  bg2 16.07  panel 15.10  panel2 13.63
 *     muted #8f8d8d   bg  5.83  bg2  5.41  panel  5.08  panel2  4.59
 *     dim   #646463   bg  3.25  bg2  3.01  panel  2.83  panel2  2.56
 *
 * The hue pass did not cause that — the blue it replaced (#56638a) measured the
 * identical 2.83 on panel, because the swap was luminance-matched by
 * construction. And the fix everyone reaches for does not exist: an AA `dim`
 * has to clear 4.5:1 on the LIGHTEST surface it lands on, `panel2`, which takes
 * #8c8c8c. `muted` is #8f8d8d. The two are three code points apart and
 * indistinguishable on a phone, so a compliant `dim` IS `muted` — the third
 * tier cannot exist at AA at all. Keeping the token is therefore not a
 * concession, it is the only way to keep three tiers.
 *
 * WHAT THAT COSTS, AND WHERE THE COST IS PAID. The decision is defensible only
 * while `dim` is confined to what it is for: ICONS, hairlines, disabled and
 * decorative marks — things that are seen, not read. It is NOT a text colour.
 * Readable strings take `muted`, which clears AA on all four surfaces
 * (4.59–5.83). If you are about to type `arena.dim` on an <AppText> or a
 * placeholderTextColor, the answer is `arena.muted`.
 *
 * AND THE CONFINEMENT IS CHECKED, NOT CLAIMED — which is the correction this
 * paragraph needed. It used to say every readable string had already moved "in
 * this same change". SEVENTEEN had not: they were still painted in `dim` behind
 * the claim, two of them worse than the 2.56 worst case weighed above — a
 * status-pill label at 2.51:1 on the tint it grounds itself in, and a done-card
 * monogram at 1.63:1 under a 0.55 opacity. They were swept on 2026-09-10, and
 * the rule now FAILS rather than asks to be believed: `dim` reaching a `color`
 * prop on a non-icon, a `placeholderTextColor`, or a `color:` style property —
 * directly or through a local alias — is a failure in
 * `__tests__/dark-theme-neutrality.test.ts`, named by file, line and prop. If
 * you are tempted to replace that sweep with a sentence again: a sentence is
 * what let seventeen sites through.
 */
export const ARENA_DARK: ArenaTokens = {
  bg: "#100e0e", // was #0a0e1a
  bg2: "#191717", // was #10172a
  panel: "#1f1d1d", // was #141d33
  panel2: "#262625", // was #1a2542
  line: "#323230", // was #26314f
  ink: "#f3f3f1", // was #eef3ff
  muted: "#8f8d8d", // was #7e8db5
  dim: "#646463", // was #56638a — ICONS/DECORATION ONLY; text takes muted
  lime: "#c4ff00",
  blue: "#2f6bff",
  red: "#ff4d6d",
  gold: "#ffc94d",
};

/** [data-theme="light"] .arena remap + the 26 child palettes (generated). */
export const ARENA_LIGHT: Record<string, ArenaTokens> = ARENA_LIGHT_GENERATED;

export function arenaTokens(theme: ThemeName, palette: ArenaPalette): ArenaTokens {
  return theme === "dark" ? ARENA_DARK : ARENA_LIGHT[palette] ?? ARENA_LIGHT.default;
}

/** Brand gradient (logo mark, hero accents): 135° purple → orange. */
export const BRAND_GRADIENT = ["#7c3aed", "#ff8a00"] as const;

/**
 * Token-level gradient exposure (redesign §2). The web ships ONE brand
 * gradient for both themes (globals.css linear-gradient(135deg, #7c3aed,
 * #ff8a00)) — mirrored here; do not invent per-theme variants.
 */
export const gradients = {
  brand: BRAND_GRADIENT,
} as const;

/**
 * Translucent fill derived from a #rrggbb token — the web's
 * color-mix(in srgb, var(--accent-2) 13%, transparent) equivalent. The palette
 * only ships a purple tinted surface (chipBg/pillBg), so anything that needs an
 * orange-tinted surface has to mix it here. Non-hex input passes through.
 */
export function tint(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Radii + spacing + type scale (web: 14–22px radii; scale 12…28). */
export const radius = { sm: 10, md: 14, lg: 18, xl: 22 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

/** Display tier (hero numbers/titles): 32/40 tight, weight 800 (redesign §1). */
export const display = { size: 32, lineHeight: 40 } as const;

/**
 * Reading line heights for prose, mirroring the web's 1.25–1.65 ratios
 * (globals.css .about2-* copy). RN's default leading is both tighter than the
 * web's and platform-dependent, which shows up as soon as a paragraph wraps
 * past two lines — so text blocks opt into these instead of hardcoding a
 * number per screen. "compact" is the same 14px copy inside dense surfaces,
 * where the airy 1.65 ratio costs more height than it buys.
 */
export const lineHeight = {
  compact: 20,
  body: 23,
  subtitle: 24,
  heading: 34,
} as const;

/** Named font weights (RN wants string literals). */
export const weight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  heavy: "800",
} as const;

/** JetBrains-Mono-style numeric accents: platform monospace, tabular digits. */
export const MONO_FONT = { fontVariant: ["tabular-nums" as const] };

// ---- shadows (redesign §2) -------------------------------------------------
// The ONLY sanctioned way to cast a shadow: emits Android elevation and the
// iOS shadow* quartet together so both platforms stay in visual lockstep.
// Pass the theme's shadow color (AppTokens.shadow — it carries its own alpha,
// so shadowOpacity stays 1); arena surfaces pass nothing and get the neutral
// dark-ink default.

export type ShadowLevel = "card" | "float";

export type ShadowStyle = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};

const SHADOW_PRESETS: Record<ShadowLevel, Omit<ShadowStyle, "shadowColor" | "shadowOpacity">> = {
  /** Resting cards (web .card soft shadow). */
  card: { shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  /** Floating chrome: sheets, tab bar, hero cards. */
  float: { shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
};

export const SHADOW_FALLBACK_COLOR = "rgba(16, 14, 14, 0.16)";

export function shadow(level: ShadowLevel, color: string = SHADOW_FALLBACK_COLOR): ShadowStyle {
  return { shadowColor: color, shadowOpacity: 1, ...SHADOW_PRESETS[level] };
}
