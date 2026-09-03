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
// `pricing.*` is the web PAYWALL: "= {price} AZN" for each interval, the
// sibling-discount table, "the prices shown are placeholders", and a stale
// 7-day-trial line that migration 142 retired. The app renders exactly three
// of these keys and they are interval LABELS ("Weekly"), not amounts -- so
// those three are allowlisted and the other ~96 stay on the web.
//
// No mobile component renders an amount, so this was never a live price
// display. It is dropped anyway: "the app contains no price of any kind" is
// the strongest sentence we say to Apple, and it should be true of the
// BUNDLE, not just of today's render path.
const PRICING_KEYS_MOBILE_RENDERS = new Set([
  "pricing.weekly",
  "pricing.monthly",
  "pricing.yearly",
]);

// `checkout.*` is the ABB hosted-payment handoff ("Pay now", "Amount",
// "The price has changed", "Payment successful") and `payres.*` is its result
// screen. `terms.*` is the /terms page. All three are whole web flows: not one
// key of any of them is referenced by a single mobile screen, and none of them
// could be without putting a checkout in the binary — which is Apple 2.3.1(a),
// not a design question.
const WEB_ONLY_PREFIXES = ["terms.", "checkout.", "payres."];

// ---------------------------------------------------------------------------
// DEAD COMMERCE STRINGS — shipped in the bundle, rendered by nothing.
//
// WHY THIS LIST EXISTS: Apple rejected this app under Guideline 3.1.1 on
// 2026-08-31. docs/STORE_PAYMENTS_COMPLIANCE.md §11 tells the submitter to grep
// the release bundle for `poly.buyNow`, any AZN string and any olympiq.ai URL —
// and `poly.buyNow` ("Əldə et" / "Get it" / "Получить") was still in it, along
// with the full sibling-discount schedule ("-10% for the 2nd child, -15% for the
// 3rd"), "Confirm and buy", "Subscribe to unlock this subject's analytics" and
// the rest of the web checkout vocabulary. A reviewer greps the bundle; it does
// not matter that no screen calls t() on these.
//
// EVERY KEY HERE WAS VERIFIED UNRENDERED before it was added: no literal
// occurrence anywhere under mobile-app/src, and not reachable through any of the
// template-literal key families the app builds at runtime (`faq.q${i}`,
// `carousel.i${n}.*`, `pricing2.${plan}.*`, `subscription.status.${s}`,
// `subj.${code}`, `pal.${id}`, `about2.${key}.*`, `privacy.${id}.title`, …).
// That verification is the whole cost of this list — deleting a key the app
// DOES render makes it print the raw key string to a user, in three languages.
// So: before adding a key, grep mobile-app/src for it AND for the prefix a
// template literal could build it from. Keys that ARE rendered but read wrong
// get an override in messages.mobile.ts instead; they are not deleted here.
//
// DO NOT "restore the missing keys". Their absence is the point. The web app
// still has every one of them, which is correct — olympiq.ai is where
// purchasing legitimately happens.
const DEAD_COMMERCE_KEYS = new Set([
  // Olympiad purchase flow (parent tab). The tab kept its catalogue and
  // details modal; the buy button, the confirm dialog and the price rows went
  // with the 2026-08-18 purchase-silent pass and left their strings behind.
  "poly.noChildren",
  "poly.buy",
  "poly.buyNow",
  "poly.price",
  "poly.det.price",
  "poly.err.generic",
  "poly.err.priceMoved",
  "poly.modal.title",
  "poly.modal.payNote",
  "poly.modal.confirm",
  "poly.modal.pending",
  "poly.modal.success",
  "polyPub.ctaParent",
  "polyPub.parentOnlyNote",
  "oly3.buy",
  "oly4.price",
  // Subscribe / plan configurator (web-only funnel: pick subjects → price →
  // pay). `sub.discount.hint` and `pricing2.sibling.body` are the sibling
  // schedule with the percentages in it — the same leak the FAQ pass caught.
  "pricing2.sibling.title",
  "pricing2.sibling.body",
  "cfg.emptySelection",
  "cfg.perSubjectLabel",
  "cfg.childNote",
  "cfg.serverNote",
  "cfg.loadError",
  "plan.dueToday",
  "plan.renewalLine.weekly",
  "plan.renewalLine.monthly",
  "plan.renewalLine.yearly",
  "plan.fromPrice",
  "sub.base",
  "sub.discount",
  "sub.discount.rank2",
  "sub.discount.rank3",
  "sub.discount.hint",
  "sub.discount.saved",
  "sub.noSibling",
  "sub.siblingNote",
  "sub.submit",
  "sub.done",
  "sub.trial",
  "sub.total",
  "sub.totalNow",
  "sub.previewHint",
  "sub.noSubjectsAvailable",
  "sub.trialNoChargeToday",
  "sub.payFirst",
  "sub.payFirstNote",
  "sub.err.priceMoved",
  "pay.title",
  "pay.note",
  "pay.payNow",
  "pay.continue",
  "pay.processing",
  "pay.success",
  "pay.subtotal",
  "pay.discount",
  "pay.total",
  // Manage-subjects editor: the editor itself ships, its MONEY half does not.
  // The rendered half (subjedit.title/noChargeNow/noteText/…) stays.
  "subjedit.dueNow",
  "subjedit.dueNowNote",
  "subjedit.subjectPlanLine",
  "subjedit.startsToday",
  // Parent analytics: the locked-subject state is drawn without a CTA, so this
  // "Subscribe to unlock…" line has had no render site since that pass.
  "ana.locked",
  // "…for the price of a cup of coffee" — the About page renders the about2.*
  // rewrite, not this one.
  "about.vision.body",
  // "Questions about the service or pricing…" — the Contact screen renders
  // contact.generalTitle without this body.
  "contact.generalDesc",
  // Privacy §8 deliberately renders NEITHER payment-status branch (see the
  // comment in app/(public)/privacy.tsx): one described the app as unfinished,
  // the other claimed it "may show subscription prices". Both are still in the
  // bundle, and one of them says "purchase".
  "privacy.s8.statusOn",
  "privacy.s8.statusOff",
]);

// Snapshot before the deletions below, so the stale-entry warning can tell
// "the web catalogue never had this key" from "this run just removed it".
const keysBeforeDrop = new Set(Object.keys(messages.az));

let dropped = 0;
for (const l of locales) {
  for (const k of Object.keys(messages[l])) {
    const isWebOnly =
      WEB_ONLY_PREFIXES.some((p) => k.startsWith(p)) ||
      DEAD_COMMERCE_KEYS.has(k) ||
      (k.startsWith("trial.") && !TRIAL_KEYS_MOBILE_RENDERS.has(k)) ||
      (k.startsWith("pricing.") && !PRICING_KEYS_MOBILE_RENDERS.has(k));
    if (isWebOnly) {
      delete messages[l][k];
      dropped += 1;
    }
  }
}

// A drop-list entry the web catalogue no longer has is dead weight that reads
// like protection. Warn, never fail: the web strings are edited independently
// of this script, and a stale name is not a reason to leave the mobile
// catalogue unsynced.
const staleDrops = [...DEAD_COMMERCE_KEYS].filter((k) => !keysBeforeDrop.has(k));
if (staleDrops.length > 0) {
  console.warn(
    `sync-i18n: ${staleDrops.length} drop-list key(s) no longer exist in the web catalogue — ` +
      `remove them from DEAD_COMMERCE_KEYS: ${staleDrops.join(", ")}`,
  );
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
