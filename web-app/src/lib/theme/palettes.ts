// THE palette catalogue — the ONLY file in the repository where a student-panel
// palette hex may be written by hand.
//
// Everything else is derived from here and asserted against it:
//   * web-app/src/app/palettes.generated.css   (scripts/gen-palettes.mjs)
//   * mobile-app/src/theme/palettes.generated.ts (mobile-app/scripts/sync-palettes.mjs)
//   * the students_palette_chk whitelist in supabase/sql/002_… (hand-written SQL,
//     but src/lib/__tests__/palettes.test.ts parses that line and fails if the two
//     lists disagree — a widened CHECK with un-generated CSS is exactly how a
//     child ends up holding a slug that renders as the default look)
//   * the server-side whitelist in lib/auth/childProfileActions.ts and the
//     SSR attribute guard in app/child/layout.tsx, which both import PALETTE_SLUGS.
//
// Deliberately dependency-free: no React, no "server-only", no "@/" imports, so a
// plain node script and vitest can both load it.
//
// A palette re-maps the SAME .arena local tokens the whole student panel is built
// on, scoped to [data-theme="light"] .arena[data-palette="<slug>"]. Dark mode is
// the owner's frozen reference and gets no palette variants at all — enabling dark
// simply stops these rules matching, which is what makes "turn dark off and the
// palette comes back" free of any restore logic.

export type PaletteGroup =
  | "bright"
  | "calm"
  | "nature"
  | "pastel"
  | "bold"
  | "neutral";

/**
 * One palette's complete token set. `accent` is emitted as the CSS `--lime` and
 * `accent2` as `--blue`: those variable names are load-bearing across ~200
 * `.arena-*` rules, so they keep their legacy names in CSS while the catalogue
 * uses the readable ones.
 */
export type ArenaPaletteTokens = {
  bg: string;
  bg2: string;
  panel: string;
  panel2: string;
  line: string;
  ink: string;
  muted: string;
  dim: string;
  accent: string;
  accent2: string;
  gold: string;
  red: string;
};

export type PaletteDef = {
  slug: string;
  group: PaletteGroup;
  t: ArenaPaletteTokens;
};

export const PALETTE_GROUPS = [
  "bright",
  "calm",
  "nature",
  "pastel",
  "bold",
  "neutral",
] as const;

/**
 * The 26 shipped palettes, in display order.
 *
 * Every entry was generated against WCAG gates and is re-verified on every test
 * run (src/lib/__tests__/palettes.test.ts): white-on-accent ≥ 4.5, ink ≥ 7 on
 * panel and page, muted/dim ≥ 4.5, a visible border and a card that lifts off the
 * page. The pre-Round-12 hand-picked palettes failed several of those badly
 * (white on the old mint accent measured 2.55), which is why the five legacy
 * slugs are RETUNED rather than replaced — keeping them valid means no
 * students.palette row has to be migrated.
 *
 * `red` is deliberately identical across all 26: danger is semantic, not
 * decorative, and must not become playful because a child picked a pink theme.
 */
export const ARENA_PALETTES: readonly PaletteDef[] = [
  { slug: "sky", group: "bright", t: { bg: "#f4f9fd", bg2: "#e7f3fb", panel: "#ffffff", panel2: "#eef6fb", line: "#d4e6f2", ink: "#16354b", muted: "#436782", dim: "#517590", accent: "#0d78c5", accent2: "#5f23c7", gold: "#a26907", red: "#da1b24" } },
  { slug: "ocean", group: "calm", t: { bg: "#f4fafd", bg2: "#e7f4fb", panel: "#ffffff", panel2: "#eef7fb", line: "#d0e6f1", ink: "#153647", muted: "#40687d", dim: "#4e768b", accent: "#087bb5", accent2: "#087e96", gold: "#9d6b07", red: "#da1b24" } },
  { slug: "cyan", group: "bright", t: { bg: "#f4fcfd", bg2: "#e7f8fb", panel: "#ffffff", panel2: "#eef9fb", line: "#c8e8ef", ink: "#12383f", muted: "#3d6c76", dim: "#497983", accent: "#047f98", accent2: "#1174d7", gold: "#986c06", red: "#da1b24" } },
  { slug: "aqua", group: "calm", t: { bg: "#f4fdfd", bg2: "#e7fbfa", panel: "#ffffff", panel2: "#eefbfb", line: "#beeceb", ink: "#113938", muted: "#386d6c", dim: "#457a79", accent: "#0b827e", accent2: "#147cb1", gold: "#9d6b07", red: "#da1b24" } },
  { slug: "teal", group: "nature", t: { bg: "#f4fdfc", bg2: "#e7fbf8", panel: "#ffffff", panel2: "#eefbfa", line: "#beece6", ink: "#113934", muted: "#386d66", dim: "#467c75", accent: "#0f8373", accent2: "#177ea1", gold: "#a26907", red: "#da1b24" } },
  { slug: "arctic", group: "neutral", t: { bg: "#f6fafb", bg2: "#ebf3f7", panel: "#ffffff", panel2: "#f0f7f9", line: "#d3e6ee", ink: "#193643", muted: "#3f697b", dim: "#4d7789", accent: "#3a7b98", accent2: "#4164aa", gold: "#a96507", red: "#da1b24" } },
  { slug: "navy", group: "bold", t: { bg: "#f4f7fd", bg2: "#e7edfb", panel: "#ffffff", panel2: "#eef2fb", line: "#dbe3f5", ink: "#192c57", muted: "#4c6294", dim: "#5a6fa0", accent: "#2558d0", accent2: "#1b78bb", gold: "#9d6b07", red: "#da1b24" } },
  { slug: "indigo", group: "bold", t: { bg: "#f5f4fd", bg2: "#e8e7fb", panel: "#ffffff", panel2: "#efeefb", line: "#e2e1f6", ink: "#1c1957", muted: "#524e97", dim: "#6b67aa", accent: "#2b22d3", accent2: "#6026c5", gold: "#a26907", red: "#da1b24" } },
  { slug: "violet", group: "bold", t: { bg: "#f8f4fd", bg2: "#f0e7fb", panel: "#ffffff", panel2: "#f4eefb", line: "#eadff6", ink: "#361957", muted: "#704e97", dim: "#8161a6", accent: "#7522d3", accent2: "#ad29c2", gold: "#a66707", red: "#da1b24" } },
  { slug: "lavender", group: "pastel", t: { bg: "#f8f6fb", bg2: "#f0ebf7", panel: "#ffffff", panel2: "#f4f0f9", line: "#e8e0f3", ink: "#341f51", muted: "#6d4e97", dim: "#7f62a7", accent: "#7143b1", accent2: "#9041aa", gold: "#a66707", red: "#da1b24" } },
  { slug: "rainbow", group: "bright", t: { bg: "#f7f4fd", bg2: "#ede7fb", panel: "#ffffff", panel2: "#f2eefb", line: "#e6dff6", ink: "#2c1957", muted: "#644e97", dim: "#7864a8", accent: "#561fd6", accent2: "#ca2175", gold: "#a66707", red: "#da1b24" } },
  { slug: "aurora", group: "bright", t: { bg: "#fbf4fd", bg2: "#f6e8fa", panel: "#ffffff", panel2: "#f8eefb", line: "#efddf5", ink: "#481957", muted: "#824c94", dim: "#905ba2", accent: "#a22bca", accent2: "#158173", gold: "#a26907", red: "#da1b24" } },
  { slug: "bubblegum", group: "bright", t: { bg: "#fdf4f9", bg2: "#fbe7f3", panel: "#ffffff", panel2: "#fbeef6", line: "#f5dbea", ink: "#57193d", muted: "#914b73", dim: "#9e5981", accent: "#d32289", accent2: "#9026c5", gold: "#b06107", red: "#da1b24" } },
  { slug: "sakura", group: "pastel", t: { bg: "#fcf5f7", bg2: "#f9e9ee", panel: "#ffffff", panel2: "#fbeff3", line: "#f5dde5", ink: "#57192e", muted: "#944c64", dim: "#a05a71", accent: "#c13363", accent2: "#b23894", gold: "#ab6407", red: "#da1b24" } },
  { slug: "rose", group: "bright", t: { bg: "#fdf4f6", bg2: "#fbe7ec", panel: "#ffffff", panel2: "#fbeef1", line: "#f5dde3", ink: "#571929", muted: "#944c5e", dim: "#a05a6b", accent: "#d02550", accent2: "#be2d8e", gold: "#ab6407", red: "#da1b24" } },
  { slug: "berry", group: "bold", t: { bg: "#fdf4f9", bg2: "#fbe7f1", panel: "#ffffff", panel2: "#fbeef5", line: "#f5dde9", ink: "#571938", muted: "#924b6f", dim: "#9e597c", accent: "#ce277a", accent2: "#9a2dbe", gold: "#ab6407", red: "#da1b24" } },
  { slug: "coral", group: "bright", t: { bg: "#fdf6f4", bg2: "#fbebe7", panel: "#ffffff", panel2: "#fbf1ee", line: "#f4dfd9", ink: "#532418", muted: "#8a5447", dim: "#986355", accent: "#d33f1a", accent2: "#c2295c", gold: "#a66707", red: "#da1b24" } },
  { slug: "peach", group: "pastel", t: { bg: "#fdf7f4", bg2: "#fbeee7", panel: "#ffffff", panel2: "#fbf3ee", line: "#f3dfd5", ink: "#4d2916", muted: "#835944", dim: "#916752", accent: "#bf541f", accent2: "#b93153", gold: "#a26907", red: "#da1b24" } },
  { slug: "sunset", group: "bright", t: { bg: "#fdf7f4", bg2: "#fbeee7", panel: "#ffffff", panel2: "#fbf3ee", line: "#f2dfd4", ink: "#4b2916", muted: "#825a43", dim: "#906851", accent: "#c5500d", accent2: "#d33017", gold: "#a26907", red: "#da1b24" } },
  { slug: "amber", group: "bright", t: { bg: "#fdfaf4", bg2: "#fbf3e7", panel: "#ffffff", panel2: "#fbf6ee", line: "#f0e1cc", ink: "#433014", muted: "#77603e", dim: "#866e4b", accent: "#a66707", accent2: "#c84e10", gold: "#b35d07", red: "#da1b24" } },
  { slug: "sand", group: "neutral", t: { bg: "#fbf9f6", bg2: "#f7f3eb", panel: "#ffffff", panel2: "#f9f6f0", line: "#ede2cf", ink: "#3f3118", muted: "#76613d", dim: "#836e49", accent: "#906f37", accent2: "#a46537", gold: "#b06107", red: "#da1b24" } },
  { slug: "lime", group: "nature", t: { bg: "#fafdf4", bg2: "#f4fbe7", panel: "#ffffff", panel2: "#f7fbee", line: "#d8eab8", ink: "#2a3911", muted: "#596c37", dim: "#657944", accent: "#587f15", accent2: "#19853d", gold: "#9d6b07", red: "#da1b24" } },
  { slug: "mint", group: "calm", t: { bg: "#f4fdfa", bg2: "#e7fbf5", panel: "#ffffff", panel2: "#eefbf7", line: "#beecde", ink: "#11392d", muted: "#396f5f", dim: "#467c6c", accent: "#158463", accent2: "#17827e", gold: "#9d6b07", red: "#da1b24" } },
  { slug: "emerald", group: "nature", t: { bg: "#f4fdf9", bg2: "#e7fbf2", panel: "#ffffff", panel2: "#eefbf5", line: "#c0edd8", ink: "#113b28", muted: "#396f56", dim: "#467c63", accent: "#11864f", accent2: "#158173", gold: "#9d6b07", red: "#da1b24" } },
  { slug: "forest", group: "nature", t: { bg: "#f5fcf7", bg2: "#e9f9ee", panel: "#ffffff", panel2: "#effbf3", line: "#c2edd0", ink: "#113b1f", muted: "#396f4b", dim: "#467c58", accent: "#218542", accent2: "#458226", gold: "#986c06", red: "#da1b24" } },
  { slug: "graphite", group: "neutral", t: { bg: "#f8f8fa", bg2: "#eff0f3", panel: "#ffffff", panel2: "#f3f4f6", line: "#e0e3e8", ink: "#2d323c", muted: "#5a6477", dim: "#667187", accent: "#69758c", accent2: "#526f98", gold: "#a26907", red: "#da1b24" } },
];

/** The saveable slugs. NULL / absent = the default look (DEFAULT_LIGHT_ARENA). */
export const PALETTE_SLUGS: ReadonlySet<string> = new Set(
  ARENA_PALETTES.map((p) => p.slug),
);

/**
 * The owner-approved "Energetic" light arena — the values the base
 * `[data-theme="light"] .arena` rule already declares in globals.css.
 *
 * Exported ONLY so the mobile app can mirror the real default instead of
 * re-typing it (its copy had drifted to a superseded block and painted the
 * student light default green-on-grey). It is NOT emitted as CSS, and the
 * contrast suite exempts its three legacy failures rather than restyling a
 * reference design CLAUDE.md pins to the landing page.
 */
export const DEFAULT_LIGHT_ARENA: ArenaPaletteTokens = {
  bg: "#fffbf5",
  bg2: "#fff7ec",
  panel: "#ffffff",
  panel2: "#f7f0fe",
  line: "#e9e0f7",
  ink: "#2a1a3e",
  muted: "#6f6486",
  dim: "#a195bb",
  accent: "#7c3aed",
  accent2: "#6d28d9",
  gold: "#ff8a00",
  red: "#ff4757",
};

/**
 * Turn a submitted palette value into the two independent columns it writes.
 *
 * Choosing a real palette also turns Dark Mode OFF (`themePref: "light"`),
 * because the palette CSS only matches under [data-theme="light"] — saving the
 * slug alone was the bug where the choice persisted but nothing changed.
 * "Default" is the ABSENCE of a palette and is theme-neutral (`themePref:
 * null`): forcing light there would yank a deliberate dark-mode user into light
 * for a no-op choice.
 *
 * Lives here rather than in the server action so it is testable and so the web
 * action and any future caller cannot drift apart.
 */
export function resolvePaletteChoice(raw: unknown): {
  palette: string | null;
  themePref: "light" | null;
} {
  const slug = typeof raw === "string" ? raw.trim() : "";
  const palette = PALETTE_SLUGS.has(slug) ? slug : null;
  return { palette, themePref: palette === null ? null : "light" };
}

/**
 * Render the whole generated stylesheet. Pure and deterministic — the generator
 * writes its output and the test compares the file on disk to a fresh call, so a
 * hand-edit of the CSS or a forgotten `npm run gen:palettes` fails the build.
 *
 * A palette emits CUSTOM PROPERTIES ONLY. That is the whole point of the
 * globals.css refactor that preceded this catalogue: the page gradient, the five
 * accent tints and the on-accent ink are all token-derived now, so a palette
 * never restates them and a newly added component can never be one the palettes
 * forgot to override. Emitting a `background` here would silently kill the
 * derived gradient, which is why the test asserts the output carries no
 * non-custom declaration.
 *
 * Kept plain-JS inside (no type annotations in the body): gen-palettes.mjs lifts
 * this exact source into a vm so the generator and the test can never diverge.
 */
export function paletteCss(): string {
  const header = [
    "/* GENERATED FILE — do not hand-edit.",
    " * Source: src/lib/theme/palettes.ts · Generator: scripts/gen-palettes.mjs",
    " * Refresh with `npm run gen:palettes`; src/lib/__tests__/palettes.test.ts",
    " * fails if this file and the catalogue disagree.",
    " */",
    "",
  ].join("\n");

  const rules = ARENA_PALETTES.map((p) => {
    const t = p.t;
    return [
      // The MODAL selector is not a duplicate: every dialog renders through a
      // portal into <body>, i.e. OUTSIDE .arena, so the arena's tokens never
      // reached it and the daily-round start, the submit/cancel confirms, the
      // image zoom and the notification detail all stayed purple/cream under
      // every one of the 26 palettes. Modal.tsx mirrors .arena's data-palette
      // onto the overlay; globals.css maps these names onto the root token
      // names the modal chrome paints from.
      `[data-theme="light"] .arena[data-palette="${p.slug}"],`,
      `[data-theme="light"] .modal-overlay[data-palette="${p.slug}"] {`,
      `  --bg: ${t.bg}; --bg2: ${t.bg2}; --panel: ${t.panel}; --panel2: ${t.panel2};`,
      `  --line: ${t.line}; --ink: ${t.ink}; --muted: ${t.muted}; --dim: ${t.dim};`,
      `  --lime: ${t.accent}; --blue: ${t.accent2}; --gold: ${t.gold}; --red: ${t.red};`,
      "}",
    ].join("\n");
  }).join("\n\n");

  return `${header}\n${rules}\n`;
}
