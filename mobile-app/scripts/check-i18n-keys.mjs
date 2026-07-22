// Guard against raw-key renders. `t()` is typed `(key: string) => string` and
// its resolution chain ends by returning the key itself (src/i18n/index.ts), so
// a key that was never added type-checks, builds, and ships as literal text —
// a user sees "poly.buyFor" on a button. Nothing else in the toolchain catches
// that. This sweep collects every t("literal") in src/ and fails when one does
// not exist in the synced web catalog or the mobile overlay.
//
// Only static string literals are checked; dynamic keys (t(`x.${y}`), t(res.error))
// are unverifiable here and must be reviewed by hand.
//
// Usage: npm run check-i18n   (from mobile-app/); also asserted by __tests__/i18n.test.ts
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");
const generatedPath = join(srcDir, "i18n", "messages.generated.ts");
const overlayPath = join(srcDir, "i18n", "messages.mobile.ts");

// The catalogs define keys rather than consume them, and their translated
// values could otherwise trip the call regex.
const catalogFiles = new Set(["messages.generated.ts", "messages.mobile.ts"]);

const locales = ["az", "en", "ru"];

function fail(message) {
  console.error(`check-i18n-keys: ${message}`);
  process.exit(1);
}

/** Slice the object literal assigned to `export const <name>` and evaluate it.
 *  Same brace walk as sync-i18n.mjs — the catalogs are plain string literals. */
function readCatalog(path, exportName) {
  const source = readFileSync(path, "utf8");
  const startMarker = source.indexOf(`export const ${exportName}`);
  if (startMarker === -1) fail(`could not find \`export const ${exportName}\` in ${path}`);
  const braceStart = source.indexOf("{", startMarker);
  let depth = 0;
  let end = -1;
  let inString = null;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i === -1) break;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) fail(`could not find the end of the ${exportName} object in ${path}`);
  try {
    return vm.runInNewContext(`(${source.slice(braceStart, end + 1)})`, Object.create(null), {
      timeout: 5000,
    });
  } catch (err) {
    fail(`failed to evaluate ${exportName}: ${err.message}`);
  }
}

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !catalogFiles.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// `t("some.key")` — the lookbehind keeps identifiers that merely end in `t`
// (print, format, …) from matching; a `.` prefix is allowed so member calls
// are swept too.
const T_CALL = /(?<![A-Za-z0-9_$])t\(\s*(["'])([^"'`\\\n]+)\1\s*\)/g;

const generated = readCatalog(generatedPath, "messages");
const overlay = readCatalog(overlayPath, "mobileMessages");
for (const l of locales) {
  if (!generated[l] || !overlay[l]) fail(`locale '${l}' missing from a catalog`);
}

const files = collectSourceFiles(srcDir);
// key -> ["relative/path.tsx:123", …]
const used = new Map();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const rel = relative(join(here, ".."), file).split(sep).join("/");
  for (const match of source.matchAll(T_CALL)) {
    const key = match[2];
    const line = source.slice(0, match.index).split("\n").length;
    const sites = used.get(key) ?? [];
    sites.push(`${rel}:${line}`);
    used.set(key, sites);
  }
}

// The runtime falls back to az last, so a key present in az always renders
// SOMETHING; one missing from az renders raw. Missing en/ru is not a raw-key
// bug but breaks the trilingual rule, so it fails too.
const unresolved = [];
const untranslated = [];
for (const [key, sites] of used) {
  const missingIn = locales.filter((l) => !overlay[l][key] && !generated[l][key]);
  if (missingIn.length === locales.length) unresolved.push({ key, sites });
  else if (missingIn.length > 0) untranslated.push({ key, sites, missingIn });
}

if (unresolved.length > 0 || untranslated.length > 0) {
  for (const { key, sites } of unresolved) {
    console.error(`  MISSING  ${key}\n             ${sites.join("\n             ")}`);
  }
  for (const { key, sites, missingIn } of untranslated) {
    console.error(
      `  NO ${missingIn.join("/").toUpperCase()}  ${key}\n             ${sites.join("\n             ")}`,
    );
  }
  console.error(
    "\ncheck-i18n-keys: add web-shared keys to web-app/src/i18n/messages.ts and run" +
      " `npm run sync-i18n`; mobile-only keys go in src/i18n/messages.mobile.ts.",
  );
  fail(
    `${unresolved.length} key(s) resolve to nothing and render raw, ` +
      `${untranslated.length} key(s) missing a locale`,
  );
}

console.log(
  `check-i18n-keys: ok — ${used.size} keys used in ${files.length} files all resolve ` +
    `(generated=${Object.keys(generated.az).length} overlay=${Object.keys(overlay.az).length})`,
);
