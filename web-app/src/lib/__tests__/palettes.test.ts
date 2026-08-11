// Guards for the palette catalogue. The slug list used to exist in six places
// that could drift — the DB CHECK, the server-action whitelist, the CSS blocks,
// the SSR attribute guard, the picker previews and the mobile tokens. These
// specs are what keep the one remaining source honest:
//
//   1. CONTRAST  — every shipped palette is actually readable.
//   2. FRESHNESS — the generated CSS matches the catalogue (no hand-edit, no
//                  forgotten `npm run gen:palettes`).
//   3. WHITELIST — all THREE hand-written SQL slug lists (the CHECK in
//                  canonical 002, the same CHECK in migration 110, and the
//                  cat(slug) array validation check 94 compares against) are
//                  exactly the catalogue.
//   4. CHOICE    — picking a palette turns Dark Mode off; "Default" does not.
//   5. COPY      — the palette count quoted in the az/en/ru hint is the real
//                  catalogue size, so a 27th palette cannot leave three lying
//                  strings behind.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARENA_PALETTES,
  DEFAULT_LIGHT_ARENA,
  PALETTE_GROUPS,
  PALETTE_SLUGS,
  paletteCss,
  resolvePaletteChoice,
  type ArenaPaletteTokens,
} from "@/lib/theme/palettes";
import { messages } from "@/i18n/messages";

const CSS_PATH = fileURLToPath(new URL("../../app/palettes.generated.css", import.meta.url));
const SQL_PATH = fileURLToPath(
  new URL("../../../../supabase/sql/002_core_profiles_roles_permissions.sql", import.meta.url),
);
// The other TWO hand-written slug lists. Neither is generated, so each is one
// forgotten edit away from disagreeing with the catalogue — which is exactly
// how the CHECK constraint would start rejecting a palette the picker offers.
const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../../supabase/sql/migrations/2026_08_11_110_palette_catalogue.sql",
    import.meta.url,
  ),
);
const VALIDATION_PATH = fileURLToPath(
  new URL("../../../../supabase/sql/013_validation_queries.sql", import.meta.url),
);

/** Every `'slug'` inside the first parenthesised list after `marker`. */
function slugsAfter(sql: string, marker: RegExp): Set<string> {
  const hit = marker.exec(sql);
  if (!hit) return new Set();
  return new Set((hit[1].match(/'([^']+)'/g) ?? []).map((q) => q.slice(1, -1)));
}

// ---- WCAG 2.1 relative luminance + contrast ratio (no dependency) ----------
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}
function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const WHITE = "#ffffff";

// name -> [foreground, background, minimum ratio]
function gates(t: ArenaPaletteTokens): [string, string, string, number][] {
  return [
    // White is --on-accent in light mode: what .arena-btn, .arena-tab.active,
    // .arena-opt.selected .arena-opt-key, .info-slide-num, .prof2-btn-primary,
    // .stk-check and ::selection all paint on the accent fill.
    ["accent/white", t.accent, WHITE, 4.5],
    // These three are used as `color:` on panel surfaces.
    ["accent2/white", t.accent2, WHITE, 4.5],
    ["gold/white", t.gold, WHITE, 4.5],
    ["red/white", t.red, WHITE, 4.5],
    ["ink/panel", t.ink, t.panel, 7],
    ["ink/bg", t.ink, t.bg, 7],
    ["muted/panel", t.muted, t.panel, 4.5],
    ["muted/bg", t.muted, t.bg, 4.5],
    // --dim renders .arena-eyebrow text, so it is body copy, not decoration.
    ["dim/panel", t.dim, t.panel, 4.5],
    ["dim/bg", t.dim, t.bg, 4.5],
    // Structure, not text: the border must be visible and the card must lift
    // off the page.
    ["line/panel", t.line, t.panel, 1.18],
    ["panel/bg", t.panel, t.bg, 1.015],
  ];
}

describe("palette contrast", () => {
  for (const p of ARENA_PALETTES) {
    it(`${p.slug} is readable`, () => {
      for (const [name, fg, bg, min] of gates(p.t)) {
        expect(
          contrast(fg, bg),
          `${p.slug} ${name} = ${contrast(fg, bg).toFixed(2)} (min ${min})`,
        ).toBeGreaterThanOrEqual(min);
      }
    });
  }

  // The DEFAULT light arena is the owner-approved "Energetic" reference that
  // CLAUDE.md pins to the landing page, so it was deliberately NOT restyled.
  // Its three sub-AA ratios are listed here rather than excluded, so they stay
  // visible AND any NEW regression on the default still breaks the build.
  const LEGACY_EXCEPTIONS: Record<string, number> = {
    "gold/white": 2.36, // --gold = #ff8a00, the streak chip
    "dim/panel": 2.79, // --dim = #a195bb, .arena-eyebrow labels
    "dim/bg": 2.7,
    "red/white": 3.34, // --red = #ff4757
  };

  it("the default light arena has only its known legacy failures", () => {
    const failing: string[] = [];
    for (const [name, fg, bg, min] of gates(DEFAULT_LIGHT_ARENA)) {
      const ratio = contrast(fg, bg);
      if (ratio >= min) continue;
      failing.push(name);
      expect(
        LEGACY_EXCEPTIONS[name],
        `default palette ${name} = ${ratio.toFixed(2)} is a NEW failure`,
      ).toBeDefined();
      // Pin the measured value: a drift in either direction is a change the
      // owner should see rather than a silently widened exception.
      expect(ratio).toBeCloseTo(LEGACY_EXCEPTIONS[name], 1);
    }
    expect(failing.sort()).toEqual(Object.keys(LEGACY_EXCEPTIONS).sort());
  });
});

describe("generated CSS", () => {
  it("matches the catalogue (run `npm run gen:palettes` if this fails)", () => {
    expect(readFileSync(CSS_PATH, "utf8")).toBe(paletteCss());
  });

  it("emits custom properties only", () => {
    // A `background` here would override the token-derived page gradient in
    // globals.css and quietly undo the whole refactor; a `color:` would
    // reintroduce the per-component light-mode flips --on-accent replaced.
    const withoutComments = paletteCss().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toMatch(/(^|[;{\s])(background|box-shadow|color)\s*:/);
    // 26 rules, 12 declarations each, all custom properties.
    const decls = withoutComments.match(/--[a-z0-9-]+\s*:/g) ?? [];
    expect(decls).toHaveLength(ARENA_PALETTES.length * 12);
  });
});

describe("catalogue integrity", () => {
  it("has 24+ palettes with unique slugs and known groups", () => {
    expect(ARENA_PALETTES.length).toBeGreaterThanOrEqual(24);
    expect(PALETTE_SLUGS.size).toBe(ARENA_PALETTES.length);
    for (const p of ARENA_PALETTES) {
      expect(PALETTE_GROUPS).toContain(p.group);
      for (const [key, value] of Object.entries(p.t)) {
        expect(value, `${p.slug}.${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("keeps the five legacy slugs valid so no students.palette row needs migrating", () => {
    for (const slug of ["sky", "bubblegum", "mint", "sunset", "rainbow"]) {
      expect(PALETTE_SLUGS.has(slug)).toBe(true);
    }
  });

  it("agrees with the students_palette_chk whitelist in canonical 002", () => {
    const sql = readFileSync(SQL_PATH, "utf8");
    const line = /students_palette_chk[\s\S]{0,200}?palette in \(([^)]*)\)/.exec(sql);
    expect(line, "students_palette_chk not found in canonical 002").not.toBeNull();
    const inDb = new Set((line![1].match(/'([^']+)'/g) ?? []).map((q) => q.slice(1, -1)));
    expect([...inDb].sort()).toEqual([...PALETTE_SLUGS].sort());
  });

  it("agrees with the whitelist in migration 110", () => {
    const inMigration = slugsAfter(
      readFileSync(MIGRATION_PATH, "utf8"),
      /students_palette_chk[\s\S]{0,200}?palette in \(([^)]*)\)/,
    );
    expect(inMigration.size, "palette whitelist not found in migration 110").toBeGreaterThan(0);
    expect([...inMigration].sort()).toEqual([...PALETTE_SLUGS].sort());
  });

  it("agrees with the catalogue check 94 asserts in canonical 013", () => {
    const inValidation = slugsAfter(
      readFileSync(VALIDATION_PATH, "utf8"),
      /with cat\(slug\) as \(\s*select unnest\(array\[([\s\S]*?)\]\)/,
    );
    expect(inValidation.size, "the cat(slug) list was not found in 013").toBeGreaterThan(0);
    expect([...inValidation].sort()).toEqual([...PALETTE_SLUGS].sort());
  });

  it("does not let the trilingual copy quote a stale palette count", () => {
    // `pal.hint` states the number of palettes in all three languages. Nothing
    // binds that number to the catalogue, so a 27th palette would leave three
    // lying strings — this is that binding.
    const count = String(ARENA_PALETTES.length);
    for (const locale of ["az", "en", "ru"] as const) {
      const hint = messages[locale]["pal.hint"];
      expect(hint, `pal.hint missing for ${locale}`).toBeTruthy();
      expect(hint, `pal.hint (${locale}) must quote ${count}`).toContain(count);
    }
  });
});

describe("palette choice", () => {
  it("turns Dark Mode off when a real palette is chosen", () => {
    expect(resolvePaletteChoice("forest")).toEqual({
      palette: "forest",
      themePref: "light",
    });
  });

  it("leaves the theme alone for Default", () => {
    // The investor's rule is "selecting ANY custom palette" — Default is the
    // absence of one and must not drag a deliberate dark-mode user into light.
    expect(resolvePaletteChoice("")).toEqual({ palette: null, themePref: null });
  });

  it("falls back to Default for anything not in the catalogue", () => {
    for (const bad of ["neon", "SKY", " ", null, undefined, 42, {}]) {
      expect(resolvePaletteChoice(bad)).toEqual({ palette: null, themePref: null });
    }
  });

  it("accepts a padded slug (form values arrive trimmed)", () => {
    expect(resolvePaletteChoice("  mint  ").palette).toBe("mint");
  });
});
