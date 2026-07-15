// Design tokens MIRRORED from web-app/src/app/globals.css — never invent values
// here; when the web palette changes, this file changes with it.
//
// Four surfaces exist on the web and all are replicated:
//   * "light"  — the Energetic light theme (:root / [data-theme="light"])
//   * "dark"   — the owner's frozen dark reference ([data-theme="dark"])
//   * "arena"  — the student shell's own dark palette (.arena)
//   * "arena light" — [data-theme="light"] .arena remap, plus the five child
//     palettes ([data-palette="sky|bubblegum|mint|sunset|rainbow"]).

export type ThemeName = "light" | "dark";
export type ArenaPalette =
  | "default"
  | "sky"
  | "bubblegum"
  | "mint"
  | "sunset"
  | "rainbow";

export const ARENA_PALETTES: ArenaPalette[] = [
  "default",
  "sky",
  "bubblegum",
  "mint",
  "sunset",
  "rainbow",
];

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

export const APP_DARK: AppTokens = {
  bg: "#0a0e1a",
  text: "#eef3ff",
  muted: "#8b99c0",
  border: "#26314f",
  accent: "#2f6bff",
  accent2: "#ff8a00",
  ok: "#9be15d",
  warn: "#ffc94d",
  surface: "#141d33",
  chipBg: "#1a2542",
  chipText: "#d6e0ff",
  pillBg: "#182447",
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

export const ARENA_DARK: ArenaTokens = {
  bg: "#0a0e1a",
  bg2: "#10172a",
  panel: "#141d33",
  panel2: "#1a2542",
  line: "#26314f",
  ink: "#eef3ff",
  muted: "#7e8db5",
  dim: "#56638a",
  lime: "#c4ff00",
  blue: "#2f6bff",
  red: "#ff4d6d",
  gold: "#ffc94d",
};

/** [data-theme="light"] .arena remap + the five child palettes. */
export const ARENA_LIGHT: Record<ArenaPalette, ArenaTokens> = {
  default: {
    bg: "#f6f8fc",
    bg2: "#eef2fa",
    panel: "#ffffff",
    panel2: "#f3f6fc",
    line: "#d8e0f0",
    ink: "#16203a",
    muted: "#586187",
    dim: "#8a93b2",
    lime: "#5b8c00",
    blue: "#2f6bff",
    red: "#d12f4d",
    gold: "#b8860b",
  },
  sky: {
    bg: "#f2f8ff",
    bg2: "#e9f3ff",
    panel: "#ffffff",
    panel2: "#eaf4ff",
    line: "#d7e8fb",
    ink: "#16324a",
    muted: "#5f7a93",
    dim: "#9fb4c9",
    lime: "#1e88e5",
    blue: "#0f6fd6",
    red: "#ff5a5f",
    gold: "#f6b93b",
  },
  bubblegum: {
    bg: "#fff2fb",
    bg2: "#fce9f8",
    panel: "#ffffff",
    panel2: "#fbeaf9",
    line: "#f4d6ec",
    ink: "#3a1436",
    muted: "#8a5f83",
    dim: "#c09bb8",
    lime: "#e0399e",
    blue: "#9b34e0",
    red: "#ff5a7a",
    gold: "#ff9f43",
  },
  mint: {
    bg: "#f0fbf6",
    bg2: "#e6f8ef",
    panel: "#ffffff",
    panel2: "#e8f9f1",
    line: "#cdeede",
    ink: "#123a2c",
    muted: "#5a8073",
    dim: "#9dc4b5",
    lime: "#12b886",
    blue: "#0ca678",
    red: "#ff5a5f",
    gold: "#f6b93b",
  },
  sunset: {
    bg: "#fff8f0",
    bg2: "#fff1e2",
    panel: "#ffffff",
    panel2: "#fff0df",
    line: "#f6e0c8",
    ink: "#43260f",
    muted: "#8a6c50",
    dim: "#c7a888",
    lime: "#f5731f",
    blue: "#e0561a",
    red: "#ff5a5f",
    gold: "#ffb23e",
  },
  rainbow: {
    bg: "#fbf6ff",
    bg2: "#f3f0ff",
    panel: "#ffffff",
    panel2: "#f2ecff",
    line: "#e6def7",
    ink: "#2b1f45",
    muted: "#6f6690",
    dim: "#b3a9cf",
    lime: "#7c5cff",
    blue: "#ff6bad",
    red: "#ff5d73",
    gold: "#ffb03a",
  },
};

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

export const SHADOW_FALLBACK_COLOR = "rgba(10, 14, 26, 0.16)";

export function shadow(level: ShadowLevel, color: string = SHADOW_FALLBACK_COLOR): ShadowStyle {
  return { shadowColor: color, shadowOpacity: 1, ...SHADOW_PRESETS[level] };
}
