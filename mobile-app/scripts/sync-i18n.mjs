// Sync the trilingual UI catalog FROM the web app (the single source of truth)
// into src/i18n/messages.generated.ts. This script is the ONLY way web keys
// enter the mobile app — never hand-edit the generated file. Mobile-only
// strings live in src/i18n/messages.mobile.ts (merged at runtime).
//
// Usage: npm run sync-i18n   (from mobile-app/)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const webMessagesPath = join(here, "..", "..", "web-app", "src", "i18n", "messages.ts");
const outPath = join(here, "..", "src", "i18n", "messages.generated.ts");

const source = readFileSync(webMessagesPath, "utf8");

// Isolate the object literal assigned to `export const messages`.
const startMarker = source.indexOf("export const messages");
if (startMarker === -1) {
  console.error("sync-i18n: could not find `export const messages` in the web catalog");
  process.exit(1);
}
const braceStart = source.indexOf("{", startMarker);
// Walk to the matching closing brace (string-aware so braces inside values
// cannot derail the scan).
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
if (end === -1) {
  console.error("sync-i18n: could not find the end of the messages object");
  process.exit(1);
}
const literal = source.slice(braceStart, end + 1);

// Evaluate in an empty sandbox — the catalog is plain string literals.
let messages;
try {
  messages = vm.runInNewContext(`(${literal})`, Object.create(null), {
    timeout: 5000,
  });
} catch (err) {
  console.error("sync-i18n: failed to evaluate the web catalog:", err.message);
  process.exit(1);
}

const locales = ["az", "en", "ru"];
for (const l of locales) {
  if (!messages[l] || typeof messages[l] !== "object") {
    console.error(`sync-i18n: locale '${l}' missing from the web catalog`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// WEB-ONLY KEYS — never copied into the binary.
//
// This script takes the web catalogue WHOLESALE, so a web string that is
// correct and legal on olympiq.ai lands inside the store binaries too. Most are
// harmless. A few are not: a Subscribe CTA rendered inside an iOS build is
// Apple 3.1.1(a), and Azerbaijan gets no anti-steering relief — the penalty is
// developer-account termination, not rejection.
//
// The Free Trial's EXPIRED state is exactly that case. On the web,
// "Continue learning by purchasing a subscription" plus a link to the plans is
// the right thing to say. On mobile the equivalent state is the already-shipping
// `child.locked.*` panel, which states what ended and stops. So these keys are
// dropped here rather than relied upon never to be rendered.
//
// ACTIVATION IS WEB-ONLY, so its whole vocabulary is too.
//
// An ALLOWLIST, not a denylist, because a denylist has to be right about every
// future key and this one only has to be right about the handful mobile
// actually renders. Mobile shows the STATE of a free day — a badge, a
// countdown, and the fact that results do not count. It never offers, confirms
// or celebrates an activation, so it needs none of the hero, picker, summary,
// confirm, success or error vocabulary.
//
// The test that made this necessary: `trial.hero.body` reads "Try the platform
// before you subscribe" in English. Correct on olympiq.ai; a subscribe CTA
// inside an iOS build is Apple 3.1.1(a), and the penalty is developer-account
// termination, not rejection.
const TRIAL_KEYS_MOBILE_RENDERS = new Set([
  "trial.badge.active",
  "trial.status.active",
  "trial.status.endsIn",
  "trial.time.h",
  "trial.time.m",
  "trial.time.s",
  "trial.note.unrated",
  "trial.used.note",
  "trial.expired.title", // states what ended; the CTA half stays on the web
]);

// PURCHASE TERMS ARE WHOLLY WEB-ONLY.
//
// `terms.*` is the /terms page: "each subject has its own price", "by proceeding
// to payment you accept these terms", "all payments are in Azerbaijani manat".
// Every word of it is correct on olympiq.ai and none of it can appear in a store
// binary. No mobile screen renders any of it today — which is precisely the
// state the trial keys were in before someone nearly rendered one, and the
// reason this file drops keys rather than trusting that nobody will.
//
// Dropped as a whole prefix, with no allowlist, because unlike the trial (where
// mobile legitimately shows the STATE of a free day) there is no member of this
// group the app has any business displaying.
const WEB_ONLY_PREFIXES = ["terms."];

let dropped = 0;
for (const l of locales) {
  for (const k of Object.keys(messages[l])) {
    const isWebOnly =
      WEB_ONLY_PREFIXES.some((p) => k.startsWith(p)) ||
      (k.startsWith("trial.") && !TRIAL_KEYS_MOBILE_RENDERS.has(k));
    if (isWebOnly) {
      delete messages[l][k];
      dropped += 1;
    }
  }
}

const counts = locales.map((l) => `${l}=${Object.keys(messages[l]).length}`).join(" ");

const banner = `// AUTO-GENERATED by scripts/sync-i18n.mjs from web-app/src/i18n/messages.ts.
// DO NOT EDIT — run \`npm run sync-i18n\` to refresh. Mobile-only strings go in
// messages.mobile.ts instead.
export type Locale = "az" | "en" | "ru";

export const messages: Record<Locale, Record<string, string>> = `;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, banner + JSON.stringify(messages, null, 2) + ";\n", "utf8");
console.log(
  `sync-i18n: wrote ${outPath} (${counts})` +
    (dropped > 0 ? ` — dropped ${dropped} web-only key(s)` : ""),
);
