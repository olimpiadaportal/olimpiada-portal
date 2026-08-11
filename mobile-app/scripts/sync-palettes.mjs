// Sync the arena palette catalogue FROM the web app (the single source of
// truth) into src/theme/palettes.generated.ts — the same relationship
// sync-i18n.mjs has with the trilingual string catalog.
//
// This is a thin wrapper: web-app/scripts/gen-palettes.mjs owns the extraction
// and writes both the web CSS and the mobile tokens in one pass, so the two can
// never be regenerated from different revisions of the catalogue.
//
// Usage: npm run sync-palettes          (from mobile-app/)
//        npm run check-palettes         (verify; exit 1 when stale)
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const generator = join(here, "..", "..", "web-app", "scripts", "gen-palettes.mjs");
const args = process.argv.slice(2);

const res = spawnSync(process.execPath, [generator, ...args], { stdio: "inherit" });
if (res.error) {
  console.error(`sync-palettes: could not run the web generator: ${res.error.message}`);
  process.exit(1);
}
process.exit(res.status ?? 1);
