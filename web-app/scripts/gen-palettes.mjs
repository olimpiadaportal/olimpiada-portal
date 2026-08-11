// Generate every derived artifact of the student-panel palette catalogue from
// the ONE hand-authored source, src/lib/theme/palettes.ts.
//
// Same convention as mobile-app/scripts/sync-i18n.mjs: one hand-authored source,
// generated artifacts, never hand-edit the output.
//
// Node cannot import the .ts source, so the literals are lifted out as text and
// evaluated in a vm — including the BODY of paletteCss() itself, so the CSS this
// script writes and the CSS the test re-derives are produced by the exact same
// code. Re-implementing the emit here would reintroduce the drift the catalogue
// exists to remove.
//
// Usage:  npm run gen:palettes            (from web-app/)
//         npm run gen:palettes -- --check (verify; exit 1 when stale)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const sourcePath = join(here, "..", "src", "lib", "theme", "palettes.ts");
const cssOutPath = join(here, "..", "src", "app", "palettes.generated.css");
const mobileOutPath = join(repoRoot, "mobile-app", "src", "theme", "palettes.generated.ts");

const checkOnly = process.argv.includes("--check");
const source = readFileSync(sourcePath, "utf8");

function fail(msg) {
  console.error(`gen-palettes: ${msg}`);
  process.exit(1);
}

// String-aware balanced-delimiter walk (the sync-i18n technique). Comments and
// braces inside string/template literals cannot derail the scan.
function walkBalanced(text, startIdx, open, close) {
  let depth = 0;
  let inString = null;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    const prev = text[i - 1];
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i);
      if (i === -1) break;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i);
      if (i === -1) break;
      i += 1;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The literal assigned to `export const <name>`, as source text. */
function extractLiteral(name, open, close) {
  const marker = source.indexOf(`export const ${name}`);
  if (marker === -1) fail(`could not find \`export const ${name}\` in palettes.ts`);
  const eq = source.indexOf("=", marker);
  const start = source.indexOf(open, eq);
  if (eq === -1 || start === -1) fail(`could not find the literal for ${name}`);
  const end = walkBalanced(source, start, open, close);
  if (end === -1) fail(`could not find the end of ${name}`);
  return source.slice(start, end + 1);
}

/** The BODY of `export function <name>(...)`, as source text (braces excluded). */
function extractFunctionBody(name) {
  const marker = source.indexOf(`export function ${name}(`);
  if (marker === -1) fail(`could not find \`export function ${name}\` in palettes.ts`);
  const start = source.indexOf("{", marker);
  const end = walkBalanced(source, start, "{", "}");
  if (start === -1 || end === -1) fail(`could not find the body of ${name}()`);
  return source.slice(start + 1, end);
}

const sandbox = Object.create(null);
vm.createContext(sandbox);
function evaluate(expr, what) {
  try {
    return vm.runInContext(expr, sandbox, { timeout: 5000 });
  } catch (err) {
    fail(`failed to evaluate ${what}: ${err.message}`);
  }
}

const palettes = evaluate(`(${extractLiteral("ARENA_PALETTES", "[", "]")})`, "ARENA_PALETTES");
const groupOrder = evaluate(`(${extractLiteral("PALETTE_GROUPS", "[", "]")})`, "PALETTE_GROUPS");
const defaultTokens = evaluate(
  `(${extractLiteral("DEFAULT_LIGHT_ARENA", "{", "}")})`,
  "DEFAULT_LIGHT_ARENA",
);
if (!Array.isArray(palettes) || palettes.length === 0) fail("ARENA_PALETTES is empty");
sandbox.ARENA_PALETTES = palettes;
const css = evaluate(`(function(){${extractFunctionBody("paletteCss")}})()`, "paletteCss()");
if (typeof css !== "string" || css.length === 0) fail("paletteCss() returned nothing");

// ---- mobile artifact ------------------------------------------------------
// Mobile's ArenaTokens keeps the legacy CSS variable names (lime/blue), so the
// catalogue's readable accent/accent2 are mapped back here rather than renaming
// ~40 call sites in the app.
function toArenaTokens(t) {
  return {
    bg: t.bg,
    bg2: t.bg2,
    panel: t.panel,
    panel2: t.panel2,
    line: t.line,
    ink: t.ink,
    muted: t.muted,
    dim: t.dim,
    lime: t.accent,
    blue: t.accent2,
    red: t.red,
    gold: t.gold,
  };
}

const mobileTokens = { default: toArenaTokens(defaultTokens) };
for (const p of palettes) mobileTokens[p.slug] = toArenaTokens(p.t);

const grouped = groupOrder
  .map((g) => ({ group: g, slugs: palettes.filter((p) => p.group === g).map((p) => p.slug) }))
  .filter((row) => row.slugs.length > 0);

const mobileTs = `// AUTO-GENERATED by web-app/scripts/gen-palettes.mjs from
// web-app/src/lib/theme/palettes.ts. DO NOT EDIT — run \`npm run sync-palettes\`.
//
// \`default\` is the base [data-theme="light"] .arena look; every other key is one
// of the selectable palettes and matches the slug stored in students.palette.
// ARENA_PALETTE_GROUPS carries the picker's section order; each group label is
// the i18n key \`pal.group.<group>\`.
import type { ArenaTokens } from "./tokens";

export const ARENA_PALETTE_SLUGS = ${JSON.stringify(palettes.map((p) => p.slug))} as const;

export const ARENA_PALETTE_GROUPS: readonly {
  group: string;
  slugs: readonly string[];
}[] = ${JSON.stringify(grouped, null, 2)};

export const ARENA_LIGHT_GENERATED: Record<string, ArenaTokens> = ${JSON.stringify(
  mobileTokens,
  null,
  2,
)};
`;

// ---- write / check --------------------------------------------------------
const artifacts = [
  { path: cssOutPath, content: css },
  { path: mobileOutPath, content: mobileTs },
];

let stale = 0;
for (const a of artifacts) {
  let onDisk = null;
  try {
    onDisk = readFileSync(a.path, "utf8");
  } catch {
    onDisk = null;
  }
  const rel = relative(repoRoot, a.path).replace(/\\/g, "/");
  if (checkOnly) {
    if (onDisk !== a.content) {
      stale++;
      console.error(
        onDisk === null
          ? `gen-palettes: MISSING ${rel}`
          : `gen-palettes: STALE ${rel} (on disk ${onDisk.length} bytes, expected ${a.content.length})`,
      );
    }
    continue;
  }
  if (onDisk === a.content) {
    console.log(`gen-palettes: unchanged ${rel}`);
    continue;
  }
  mkdirSync(dirname(a.path), { recursive: true });
  writeFileSync(a.path, a.content, "utf8");
  console.log(`gen-palettes: wrote ${rel}`);
}

if (checkOnly) {
  if (stale > 0) {
    console.error("gen-palettes: run `npm run gen:palettes` and commit the result.");
    process.exit(1);
  }
  console.log(`gen-palettes: up to date (${palettes.length} palettes)`);
  process.exit(0);
}

// SQL is never generated: a migration is immutable point-in-time DDL and must be
// hand-reviewed. This is only the fragment to paste into the CHECK constraint.
console.log(`\ngen-palettes: ${palettes.length} palettes. CHECK fragment for the migration:\n`);
console.log(`palette in (${palettes.map((p) => `'${p.slug}'`).join(",")})\n`);
