#!/usr/bin/env node
// =============================================================================
// CREATE OLYMPIQ'S IN-APP PURCHASE PRODUCTS IN APP STORE CONNECT
//
// WHY THIS SCRIPT EXISTS. Apple rejected the iOS build under Guideline 3.1.1.
// The IAP rail is built; what is left is creating 21 products in App Store
// Connect by hand. A single typo in a product id does not produce an error —
// StoreKit simply never returns that product, the purchase row never appears in
// the app, and nothing anywhere says why. Twenty-one chances to make a silent,
// permanent mistake (App Store Connect never renames a product id and never
// lets the string be reused) is what this script removes.
//
// -----------------------------------------------------------------------------
// READ THIS BEFORE YOU TRUST THE REQUEST BODIES BELOW.
// -----------------------------------------------------------------------------
// Apple's API reference pages are rendered by JavaScript and could not be read
// mechanically while this was written. The endpoints and paths below are
// corroborated by Apple's own documentation URLs and by a third-party client
// (dfabulich/node-app-store-connect-api), but the exact ATTRIBUTE SET of the
// create request is reconstructed, not verified. Everything about this script's
// shape follows from that one fact — being wrong has to be cheap:
//
//   * DRY RUN IS THE DEFAULT. With no flags it prints exactly what it would
//     send and writes nothing. `--apply` is required to create anything.
//   * `--only <productId>` creates ONE product, so a wrong guess costs one
//     product and one look at the App Store Connect screen.
//   * `--minimal` drops every optional attribute (reviewNote, familySharable)
//     and sends only the three fields that are certainly required. If Apple
//     rejects an attribute name, this is the fix.
//   * Apple's FULL error body is printed on any failure. Apple's 4xx responses
//     name the offending field in `errors[].source.pointer`, which turns a
//     wrong guess into a five-minute correction instead of a mystery.
//   * Re-running is SAFE. Existing product ids are read from Apple first and
//     skipped.
//
// WHAT IS DELIBERATELY NOT HERE: PRICING. Prices are a separate resource
// (`inAppPurchasePriceSchedules`) that must be written as a COMPLETE schedule
// in one request, referencing opaque per-territory price-point ids that have to
// be fetched and chosen first. The owner has also not fixed the iOS price
// points anywhere this script can read. Guessing there could set a wrong price
// on a live product, which is worse than typing 21 prices in a browser. Set
// prices in App Store Connect. See README_IAP_PRODUCTS.md.
//
// -----------------------------------------------------------------------------
// Usage (from mobile-app/):
//   node ./scripts/create-iap-products.mjs --self-test        no network, no keys
//   node ./scripts/create-iap-products.mjs                    dry run
//   node ./scripts/create-iap-products.mjs --list             show what Apple has
//   node ./scripts/create-iap-products.mjs --apply --only ai.olympiq.app.sub.math.week
//   node ./scripts/create-iap-products.mjs --apply
//   node ./scripts/create-iap-products.mjs --apply --with-localizations
// =============================================================================

import { readFileSync, existsSync, statSync } from "node:fs";
import crypto from "node:crypto";
import process from "node:process";

const API_BASE = "https://api.appstoreconnect.apple.com";

// The bundle id is permanent by owner decision (CLAUDE.md). It is checked
// against the app the numeric APP_ID resolves to, so a mistyped app id creates
// products on somebody else's app exactly zero times.
const BUNDLE_ID = "ai.olympiq.app";

// Mirrors ck_iap_product_id_shape in supabase/sql/migrations/2026_08_31_164.
const PRODUCT_ID_RE = /^ai\.olympiq\.app\.sub\.[a-z0-9]+\.(week|month|year)$/;

const EXPECTED_PRODUCT_COUNT = 21;

// App Store Connect field limits. These are from documentation and long-standing
// App Store Connect behaviour, not from a machine-readable schema — they are
// enforced here so an over-long string fails at startup on this machine rather
// than as a 400 halfway through a run.
const LIMITS = {
  referenceName: 64,
  localizedName: 30,
  localizedDescription: 45,
  reviewNote: 4000,
};

// =============================================================================
// THE PRODUCT TABLE
//
// THIS MIRRORS `public.iap_products` (seeded by migration
// supabase/sql/migrations/2026_08_31_164_iap_products_and_intents.sql) AND MUST
// STAY IN STEP WITH IT. The database is the source of truth for which product
// id grants which subject; this table exists only so the script has no database
// dependency. If a subject is added, removed or re-slugged in that migration,
// change it here in the same round.
//
// THE SLUG IS NOT subjects.code, AND THE TWO LANGUAGE-ISH SUBJECTS ARE A TRAP:
// the subject whose code is `az_language` is named "Məntiq" (Logic), and the
// real Azerbaijani-language subject has code `azerbaycan_dili`. Getting those
// two the wrong way round produces a permanent, public product id that sells
// the wrong subject. The `dbCode` column is here purely so that mapping can be
// checked by eye against the migration.
// =============================================================================
const SUBJECTS = [
  { slug: "math",        dbCode: "math",            az: "Riyaziyyat",      en: "Mathematics", ru: "Математика" },
  { slug: "logic",       dbCode: "az_language",     az: "Məntiq",          en: "Logic",       ru: "Логика" },
  { slug: "english",     dbCode: "english",         az: "İngilis dili",    en: "English",     ru: "Английский язык" },
  { slug: "informatics", dbCode: "informatics",     az: "İnformatika",     en: "Informatics", ru: "Информатика" },
  { slug: "science",     dbCode: "elm",             az: "Elm",             en: "Science",     ru: "Естественные науки" },
  { slug: "physics",     dbCode: "fizika",          az: "Fizika",          en: "Physics",     ru: "Физика" },
  { slug: "azerbaijani", dbCode: "azerbaycan_dili", az: "Azərbaycan dili", en: "Azerbaijani", ru: "Азербайджанский язык" },
];

// `enRef` names the internal reference; `enName`/`ruName` go in the customer-
// facing display name and description.
//
// THE RUSSIAN PERIODS ARE ABBREVIATED ON PURPOSE. Apple caps a display name at
// 30 characters, and "Азербайджанский язык — 1 неделя" is 31. Rather than have
// one product read differently from the other twenty, every Russian row uses
// the same "1 нед. / 1 мес. / 1 год" abbreviation, which is ordinary Russian.
// validateProducts() proves the limit rather than trusting this comment.
const INTERVALS = [
  { key: "week",  enRef: "1 Week",  enName: "1 week",  ruName: "1 нед.", enPeriod: "week" },
  { key: "month", enRef: "1 Month", enName: "1 month", ruName: "1 мес.", enPeriod: "month" },
  { key: "year",  enRef: "1 Year",  enName: "1 year",  ruName: "1 год",  enPeriod: "year" },
];

// NON_RENEWING_SUBSCRIPTION for all 21, and this is load-bearing rather than a
// preference. Apple allows ONE active subscription per subscription group per
// Apple ID; these subscriptions are PER CHILD, so a parent with three children
// needs three concurrent grants — which an auto-renewable group cannot express.
const IAP_TYPE = "NON_RENEWING_SUBSCRIPTION";

// APPLE HAS NO AZERBAIJANI APP STORE LOCALE. The App Store localization list
// does not include Azerbaijani, so the `az` names in SUBJECTS above cannot be
// uploaded and are kept only for cross-checking against the database. This is
// harmless for the product: the app renders subject names from its own
// catalogue, and StoreKit is asked only for the price string
// (mobile-app/src/features/iap/catalog.ts). Apple's localization is what a
// parent sees in the purchase sheet, in Ask to Buy and on the receipt.
// If App Store Connect ever offers Azerbaijani, add it here.
const LOCALES = ["en-US", "ru"];

/** End a sentence without producing "1 нед.." — the abbreviations already end in a dot. */
function sentence(text) {
  return text.endsWith(".") ? text : `${text}.`;
}

/** Build the full 21-product plan. Pure — no env, no network. */
function buildProducts() {
  const products = [];
  for (const subject of SUBJECTS) {
    for (const interval of INTERVALS) {
      const productId = `${BUNDLE_ID}.sub.${subject.slug}.${interval.key}`;
      products.push({
        productId,
        slug: subject.slug,
        dbCode: subject.dbCode,
        interval: interval.key,
        // Internal only; never shown to a customer. ASCII and unique per app.
        referenceName: `OlympIQ ${subject.en} ${interval.enRef}`,
        reviewNote:
          `Non-renewing subscription granting one child account access to the ` +
          `${subject.en} subject for one ${interval.enPeriod}. A parent buys it ` +
          `from the parent area of the app and chooses which of their children ` +
          `it applies to. Access is granted by our server only after the ` +
          `transaction is verified with Apple. Children cannot purchase.`,
        // Factual, and deliberately silent about the web rail: mentioning
        // another channel or a cheaper price is anti-steering, which is the
        // family of guideline the app was just rejected under.
        localizations: [
          {
            locale: "en-US",
            name: `${subject.en} — ${interval.enName}`,
            description: sentence(`${subject.en} practice for one child, ${interval.enName}`),
          },
          {
            locale: "ru",
            name: `${subject.ru} — ${interval.ruName}`,
            description: sentence(`${subject.ru}: практика, ${interval.ruName}`),
          },
        ],
      });
    }
  }
  return products;
}

/**
 * Prove the table before anything else happens. A wrong product id is the
 * single unrecoverable mistake available here, so it is checked on this machine
 * with no credentials and no network involved.
 */
function validateProducts(products) {
  const problems = [];

  if (products.length !== EXPECTED_PRODUCT_COUNT) {
    problems.push(
      `expected exactly ${EXPECTED_PRODUCT_COUNT} products (7 subjects x 3 intervals), got ${products.length}`,
    );
  }
  if (SUBJECTS.length !== 7) problems.push(`expected 7 subjects, got ${SUBJECTS.length}`);
  if (INTERVALS.length !== 3) problems.push(`expected 3 intervals, got ${INTERVALS.length}`);

  const seenIds = new Set();
  const seenRefs = new Set();
  const seenSlugs = new Set();

  for (const s of SUBJECTS) {
    if (seenSlugs.has(s.slug)) problems.push(`duplicate slug: ${s.slug}`);
    seenSlugs.add(s.slug);
    if (!/^[a-z0-9]+$/.test(s.slug)) problems.push(`slug is not lowercase alphanumeric: ${s.slug}`);
  }

  for (const p of products) {
    if (!PRODUCT_ID_RE.test(p.productId)) {
      problems.push(`product id does not match ai.olympiq.app.sub.<slug>.<week|month|year>: ${p.productId}`);
    }
    // The id and the row must agree about the period — an id ending `.month` on
    // a yearly product is a money bug. The database enforces the same thing
    // with ck_iap_product_id_interval.
    if (!p.productId.endsWith(`.${p.interval}`)) {
      problems.push(`product id ${p.productId} does not end with its interval .${p.interval}`);
    }
    if (seenIds.has(p.productId)) problems.push(`duplicate product id: ${p.productId}`);
    seenIds.add(p.productId);

    if (seenRefs.has(p.referenceName)) problems.push(`duplicate reference name: ${p.referenceName}`);
    seenRefs.add(p.referenceName);

    if (p.referenceName.length > LIMITS.referenceName) {
      problems.push(`reference name too long (${p.referenceName.length} > ${LIMITS.referenceName}): ${p.referenceName}`);
    }
    if (!/^[A-Za-z0-9 ]+$/.test(p.referenceName)) {
      problems.push(`reference name should be plain ASCII letters/digits/spaces: ${p.referenceName}`);
    }
    if (p.reviewNote.length > LIMITS.reviewNote) {
      problems.push(`review note too long (${p.reviewNote.length} > ${LIMITS.reviewNote}) for ${p.productId}`);
    }

    const locales = new Set();
    for (const loc of p.localizations) {
      if (!LOCALES.includes(loc.locale)) problems.push(`unexpected locale ${loc.locale} on ${p.productId}`);
      if (locales.has(loc.locale)) problems.push(`duplicate locale ${loc.locale} on ${p.productId}`);
      locales.add(loc.locale);
      // Counted in Unicode code points, which is what a human counts and what
      // Apple's editor counts. `.length` would count UTF-16 units.
      const nameLen = [...loc.name].length;
      const descLen = [...loc.description].length;
      if (nameLen === 0) problems.push(`empty display name on ${p.productId} (${loc.locale})`);
      if (descLen === 0) problems.push(`empty description on ${p.productId} (${loc.locale})`);
      if (nameLen > LIMITS.localizedName) {
        problems.push(`display name too long (${nameLen} > ${LIMITS.localizedName}) on ${p.productId} (${loc.locale}): ${loc.name}`);
      }
      if (descLen > LIMITS.localizedDescription) {
        problems.push(`description too long (${descLen} > ${LIMITS.localizedDescription}) on ${p.productId} (${loc.locale}): ${loc.description}`);
      }
    }
    for (const wanted of LOCALES) {
      if (!locales.has(wanted)) problems.push(`missing ${wanted} localization on ${p.productId}`);
    }
  }

  return problems;
}

// =============================================================================
// REQUEST BODIES
// =============================================================================

/**
 * POST /v2/inAppPurchases
 *
 * The `/v2` path is required for creation — `/v1/inAppPurchases` is the old,
 * deprecated resource and creating there does not produce a modern IAP.
 *
 * `minimal` sends only the three attributes that are certainly required. Use it
 * if Apple rejects one of the optional attribute names.
 */
function buildCreateBody(product, appId, { minimal = false } = {}) {
  const attributes = {
    name: product.referenceName,
    productId: product.productId,
    inAppPurchaseType: IAP_TYPE,
  };
  if (!minimal) {
    attributes.reviewNote = product.reviewNote;
    // Family Sharing OFF: the entitlement is per child account on our side, and
    // sharing an access grant across a family's Apple IDs would hand access to
    // people the parent never added as a child.
    attributes.familySharable = false;
    // NO `availableInAllTerritories`. Apple rejects it outright on create:
    //   409 ENTITY_ERROR.ATTRIBUTE.UNKNOWN
    //   'availableInAllTerritories' is not an attribute on the resource
    //   'inAppPurchases'
    // Territory availability is a SEPARATE resource
    // (inAppPurchaseAvailabilities), not an attribute of the product, and it is
    // set alongside the price in App Store Connect. Removed 2026-09-02 after the
    // first live --apply failed on it. (Verified against the real API, not the
    // docs — the attribute appears in some third-party references.)
  }
  return {
    data: {
      type: "inAppPurchases",
      attributes,
      relationships: {
        app: { data: { type: "apps", id: String(appId) } },
      },
    },
  };
}

/** POST /v1/inAppPurchaseLocalizations */
function buildLocalizationBody(iapId, localization) {
  return {
    data: {
      type: "inAppPurchaseLocalizations",
      attributes: {
        locale: localization.locale,
        name: localization.name,
        description: localization.description,
      },
      // The relationship is named `inAppPurchaseV2`, not `inAppPurchase` —
      // `inAppPurchase` refers to the deprecated v1 resource.
      relationships: {
        inAppPurchaseV2: { data: { type: "inAppPurchases", id: String(iapId) } },
      },
    },
  };
}

// =============================================================================
// AUTHENTICATION
//
// App Store Connect wants a short-lived ES256 JWT signed with the .p8 private
// key downloaded from Users and Access -> Integrations -> App Store Connect API.
//
// THE ONE THING THAT GOES WRONG: the ECDSA signature must be in IEEE P-1363
// format (r||s, 64 raw bytes). Node's default is DER (an ASN.1 SEQUENCE), which
// is a perfectly valid signature that Apple rejects with a BARE 401 and no
// explanation — so it looks exactly like wrong credentials and people spend
// hours re-downloading keys. `dsaEncoding: "ieee-p1363"` below is the entire
// fix. Do not remove it.
//
// Nothing in this section is ever printed. Not the key, not the token, not a
// fragment of either, not in verbose mode.
// =============================================================================

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * @param privateKeyPem contents of the .p8 file (PKCS#8 EC private key)
 * @returns a JWT string. NEVER LOG THE RETURN VALUE.
 */
function makeToken({ issuerId, keyId, privateKeyPem, lifetimeSeconds = 900 }) {
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  // Apple's hard ceiling is 20 minutes. 15 leaves room for clock skew on the
  // operator's machine; a token minted from a clock a few minutes fast is
  // another way to earn an unexplained 401.
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + Math.min(lifetimeSeconds, 20 * 60),
    aud: "appstoreconnect-v1",
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createSign("SHA256")
    .update(signingInput)
    .sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });

  return `${signingInput}.${base64url(signature)}`;
}

/** Read the .p8 without ever putting its contents anywhere but memory. */
function readPrivateKey(path) {
  if (!existsSync(path)) {
    fail(
      `Private key file not found:\n  ${path}\n\n` +
        `APP_STORE_CONNECT_P8_PATH must be the PATH to the .p8 file you downloaded\n` +
        `from App Store Connect, not the key itself.`,
    );
  }
  if (!statSync(path).isFile()) fail(`APP_STORE_CONNECT_P8_PATH is not a file:\n  ${path}`);
  let pem;
  try {
    pem = readFileSync(path, "utf8");
  } catch (err) {
    fail(`Could not read the private key file:\n  ${path}\n  ${err.code || err.message}`);
  }
  if (!pem.includes("BEGIN PRIVATE KEY")) {
    fail(
      `That file does not look like an App Store Connect API key.\n` +
        `It should be a text file whose first line is "-----BEGIN PRIVATE KEY-----".\n` +
        `  ${path}`,
    );
  }
  // Parse it now so a corrupt key fails here, with a clear message, rather than
  // as a 401 later. The key object is not printed and not returned.
  try {
    crypto.createPrivateKey(pem);
  } catch {
    fail(
      `The private key file could not be parsed. It may be truncated or may not be\n` +
        `an App Store Connect API key (.p8). Download it again from\n` +
        `Users and Access -> Integrations -> App Store Connect API.`,
    );
  }
  return pem;
}

// =============================================================================
// HTTP
// =============================================================================

class ApiError extends Error {
  constructor(status, statusText, bodyText, method, path) {
    super(`${method} ${path} -> ${status} ${statusText}`);
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
    this.method = method;
    this.path = path;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeClient(token, { verbose = false } = {}) {
  return async function request(method, path, body) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
    if (verbose) log(`  -> ${method} ${url}`);
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          // The Authorization header is built here and never logged.
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Network request failed (${method} ${url}).\n` +
          `Check the internet connection, then run the command again — this script is\n` +
          `safe to re-run.\n  ${err.message}`,
      );
    }
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, res.statusText, text, method, url);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${method} ${url} returned a response that is not JSON.`);
    }
  };
}

/**
 * Apple's 4xx bodies are precise — `errors[].detail` says what is wrong and
 * `errors[].source.pointer` names the exact field. Printing them in full is the
 * difference between "a guess in this script was wrong, here is the field" and
 * an unexplained failure.
 */
function formatApiError(err) {
  const lines = [];
  lines.push(`  ${err.method} ${err.path}`);
  lines.push(`  HTTP ${err.status} ${err.statusText}`);

  let parsed = null;
  try {
    parsed = JSON.parse(err.bodyText);
  } catch {
    /* not JSON; the raw body is printed below */
  }

  if (parsed && Array.isArray(parsed.errors)) {
    for (const e of parsed.errors) {
      lines.push("");
      lines.push(`  ${e.title || "(no title)"}${e.code ? `  [${e.code}]` : ""}`);
      if (e.detail) lines.push(`    ${e.detail}`);
      const pointer = e.source && (e.source.pointer || e.source.parameter);
      if (pointer) lines.push(`    offending field: ${pointer}`);
    }
  } else if (err.bodyText) {
    lines.push("");
    lines.push("  Raw response body:");
    for (const line of err.bodyText.split("\n")) lines.push(`    ${line}`);
  } else {
    lines.push("  (empty response body)");
  }

  lines.push("");
  if (err.status === 401) {
    lines.push("  WHAT A 401 USUALLY MEANS HERE, most likely first:");
    lines.push("    1. The signature format. Apple needs IEEE P-1363; Node's default is DER.");
    lines.push("       This script already passes dsaEncoding: \"ieee-p1363\" — if that line was");
    lines.push("       edited out, put it back.");
    lines.push("    2. APP_STORE_CONNECT_KEY_ID does not match the .p8 file. The key id is in");
    lines.push("       the file name: AuthKey_<KEY_ID>.p8");
    lines.push("    3. APP_STORE_CONNECT_ISSUER_ID is wrong. It is one Issuer ID for the whole");
    lines.push("       team, shown above the key list in App Store Connect.");
    lines.push("    4. The wrong .p8 entirely. The In-App Purchase key the SERVER uses to");
    lines.push("       verify receipts is a DIFFERENT key and does not work here.");
    lines.push("    5. This computer's clock is wrong by more than a few minutes.");
  } else if (err.status === 403) {
    lines.push("  A 403 means the key authenticated but is not allowed to do this.");
    lines.push("  The App Store Connect API key needs the Admin or App Manager role.");
    lines.push("  A Developer- or Finance-role key cannot create in-app purchases.");
  } else if (err.status === 404) {
    lines.push("  A 404 here usually means APP_STORE_CONNECT_APP_ID is wrong, or the key's");
    lines.push("  team does not have access to that app. The app id is the numeric");
    lines.push("  \"Apple ID\" on the App Information page in App Store Connect.");
  } else if (err.status === 409) {
    lines.push("  A 409 is a conflict. Most often: that product id already exists (possibly");
    lines.push("  on another app, or in a deleted state) and cannot be reused, or a required");
    lines.push("  attribute was rejected. Read errors[].detail above — it names the field.");
  } else if (err.status === 429) {
    lines.push("  A 429 means Apple is rate-limiting. Wait a few minutes and run the same");
    lines.push("  command again. Nothing is lost: this script skips products that already");
    lines.push("  exist, so re-running continues where it stopped.");
  } else if (err.status >= 500) {
    lines.push("  A 5xx is a problem on Apple's side. Wait and run the same command again;");
    lines.push("  re-running is safe.");
  }
  return lines.join("\n");
}

// =============================================================================
// APP STORE CONNECT OPERATIONS
// =============================================================================

/**
 * One cheap authenticated GET before any write. If the credentials are wrong,
 * this is where it is discovered — before 21 attempts have failed one at a
 * time. It also proves the numeric app id points at OlympIQ.
 */
async function preflight(request, appId) {
  const res = await request("GET", `/v1/apps/${encodeURIComponent(appId)}`);
  const attrs = (res && res.data && res.data.attributes) || {};
  const name = attrs.name || "(unnamed)";
  const bundle = attrs.bundleId || "(unknown)";
  log(`Authenticated. App ${appId} is "${name}" (${bundle}).`);
  if (bundle !== BUNDLE_ID) {
    fail(
      `WRONG APP.\n\n` +
        `APP_STORE_CONNECT_APP_ID (${appId}) is the app "${name}" whose bundle id is\n` +
        `  ${bundle}\n` +
        `but OlympIQ's bundle id is\n` +
        `  ${BUNDLE_ID}\n\n` +
        `Nothing was created. Fix APP_STORE_CONNECT_APP_ID — it is the numeric\n` +
        `"Apple ID" shown on the App Information page of the OlympIQ app.`,
    );
  }
  return { name, bundle };
}

/**
 * Every in-app purchase the app already has, keyed by product id. This is what
 * makes re-running safe: an id already present is never created again.
 *
 * No `limit` parameter is sent on purpose — Apple's per-endpoint maximums differ
 * and a too-large limit is a 400. Pagination via links.next handles any size.
 */
async function fetchExistingProducts(request, appId) {
  const byProductId = new Map();
  let path = `/v1/apps/${encodeURIComponent(appId)}/inAppPurchasesV2`;
  let guard = 0;
  while (path) {
    const page = await request("GET", path);
    for (const row of (page && page.data) || []) {
      const productId = row.attributes && row.attributes.productId;
      if (productId) {
        byProductId.set(productId, {
          id: row.id,
          name: (row.attributes && row.attributes.name) || "",
          state: (row.attributes && row.attributes.state) || "",
        });
      }
    }
    path = (page && page.links && page.links.next) || null;
    if (++guard > 50) break; // no realistic app has 50 pages of IAPs
  }
  return byProductId;
}

async function fetchExistingLocales(request, iapId) {
  const locales = new Set();
  let path = `/v2/inAppPurchases/${encodeURIComponent(iapId)}/inAppPurchaseLocalizations`;
  let guard = 0;
  while (path) {
    const page = await request("GET", path);
    for (const row of (page && page.data) || []) {
      const locale = row.attributes && row.attributes.locale;
      if (locale) locales.add(locale);
    }
    path = (page && page.links && page.links.next) || null;
    if (++guard > 20) break;
  }
  return locales;
}

// =============================================================================
// OUTPUT
// =============================================================================

function log(msg = "") {
  process.stdout.write(`${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`\nERROR\n${msg}\n`);
  process.exit(2);
}

function rule(char = "-") {
  log(char.repeat(74));
}

// =============================================================================
// SELF TEST — no network, no credentials, no env vars.
// =============================================================================

function selfTest() {
  const checks = [];
  const check = (name, fn) => {
    try {
      const problem = fn();
      checks.push({ name, ok: !problem, problem: problem || null });
    } catch (err) {
      checks.push({ name, ok: false, problem: err.message });
    }
  };

  const products = buildProducts();

  check("product table has exactly 21 entries", () =>
    products.length === EXPECTED_PRODUCT_COUNT ? null : `got ${products.length}`);

  check("product table passes every validation rule", () => {
    const problems = validateProducts(products);
    return problems.length === 0 ? null : problems.join("; ");
  });

  check("every product id matches ai.olympiq.app.sub.<slug>.<interval>", () => {
    const bad = products.filter((p) => !PRODUCT_ID_RE.test(p.productId));
    return bad.length === 0 ? null : bad.map((p) => p.productId).join(", ");
  });

  check("all 7 expected slugs and 3 intervals are present", () => {
    const wantSlugs = ["math", "logic", "english", "informatics", "science", "physics", "azerbaijani"];
    const gotSlugs = SUBJECTS.map((s) => s.slug);
    const missing = wantSlugs.filter((s) => !gotSlugs.includes(s));
    const extra = gotSlugs.filter((s) => !wantSlugs.includes(s));
    if (missing.length || extra.length) {
      return `missing [${missing.join(", ")}] extra [${extra.join(", ")}]`;
    }
    const ivs = INTERVALS.map((i) => i.key).join(",");
    return ivs === "week,month,year" ? null : `intervals were ${ivs}`;
  });

  check("logic maps to az_language and azerbaijani maps to azerbaycan_dili", () => {
    const logic = SUBJECTS.find((s) => s.slug === "logic");
    const azlang = SUBJECTS.find((s) => s.slug === "azerbaijani");
    if (!logic || logic.dbCode !== "az_language") return "logic slug is not mapped to az_language";
    if (!azlang || azlang.dbCode !== "azerbaycan_dili") return "azerbaijani slug is not mapped to azerbaycan_dili";
    return null;
  });

  check("every product is NON_RENEWING_SUBSCRIPTION", () => {
    const body = buildCreateBody(products[0], "123456789");
    return body.data.attributes.inAppPurchaseType === IAP_TYPE ? null : "type was not NON_RENEWING_SUBSCRIPTION";
  });

  check("create body has the required shape", () => {
    const body = buildCreateBody(products[0], "123456789");
    const a = body.data.attributes;
    if (body.data.type !== "inAppPurchases") return "data.type wrong";
    if (!a.name || !a.productId || !a.inAppPurchaseType) return "an attribute is missing";
    if (a.familySharable !== false) return "familySharable should be false";
    const rel = body.data.relationships.app.data;
    if (rel.type !== "apps" || rel.id !== "123456789") return "app relationship wrong";
    return null;
  });

  check("--minimal body drops every optional attribute", () => {
    const body = buildCreateBody(products[0], "1", { minimal: true });
    const keys = Object.keys(body.data.attributes).sort().join(",");
    return keys === "inAppPurchaseType,name,productId" ? null : `attributes were ${keys}`;
  });

  check("the success path never calls process.exit", () => {
    // Regression guard, 2026-09-01. process.exit() after a fetch races libuv's
    // keep-alive socket teardown and trips a Windows assertion AFTER the work
    // succeeded — during --apply that means "products created" printed next to
    // a crash. Only the pre-network fail() may exit; the main chain sets
    // exitCode and lets the loop drain. See shutdown().
    const src = readFileSync(new URL(import.meta.url), "utf8");
    const chain = src.slice(src.lastIndexOf("\nmain()"));
    if (chain.includes("process.exit(")) return "the main() chain still calls process.exit()";
    if (!chain.includes("process.exitCode")) return "the main() chain sets no exit code at all";
    if (!chain.includes("await shutdown()")) return "the main() chain does not close the socket pool";
    return null;
  });

  check("localization body targets the inAppPurchaseV2 relationship", () => {
    const body = buildLocalizationBody("abc", products[0].localizations[0]);
    if (body.data.type !== "inAppPurchaseLocalizations") return "data.type wrong";
    const rel = body.data.relationships.inAppPurchaseV2;
    if (!rel || rel.data.type !== "inAppPurchases" || rel.data.id !== "abc") return "relationship wrong";
    const a = body.data.attributes;
    if (!a.locale || !a.name || !a.description) return "an attribute is missing";
    return null;
  });

  check("JWT header and payload are assembled correctly", () => {
    // A throwaway key generated in memory. The real .p8 is never involved in
    // the self-test and no key material is printed.
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const token = makeToken({ issuerId: "ISSUER", keyId: "KEYID", privateKeyPem: pem });
    const parts = token.split(".");
    if (parts.length !== 3) return "token does not have three segments";
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (header.alg !== "ES256") return `alg was ${header.alg}`;
    if (header.typ !== "JWT") return `typ was ${header.typ}`;
    if (header.kid !== "KEYID") return "kid missing";
    if (payload.iss !== "ISSUER") return "iss missing";
    if (payload.aud !== "appstoreconnect-v1") return `aud was ${payload.aud}`;
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return "iat/exp missing";
    if (payload.exp - payload.iat > 20 * 60) return "token lifetime exceeds Apple's 20 minute maximum";
    if (payload.exp <= payload.iat) return "token expires before it is issued";
    return null;
  });

  check("JWT signature is IEEE P-1363, not DER", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    const token = makeToken({ issuerId: "I", keyId: "K", privateKeyPem: pem });
    const [h, p, s] = token.split(".");
    const sig = Buffer.from(s, "base64url");
    // P-1363 for P-256 is exactly r||s = 32+32 bytes. A DER signature is
    // variable-length and starts with 0x30 — which is the failure that produces
    // a bare 401 from Apple.
    if (sig.length !== 64) return `signature is ${sig.length} bytes, expected 64 (DER would be ~70 and start with 0x30)`;
    if (sig[0] === 0x30 && sig.length !== 64) return "signature looks like DER";
    const ok = crypto
      .createVerify("SHA256")
      .update(`${h}.${p}`)
      .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, sig);
    return ok ? null : "signature did not verify as IEEE P-1363";
  });

  check("no secret-looking value is embedded in this script", () => {
    const source = readFileSync(new URL(import.meta.url), "utf8");
    if (source.includes("BEGIN PRIVATE KEY-----\nM")) return "a private key appears to be pasted into the script";
    return null;
  });

  rule("=");
  log("SELF TEST");
  rule("=");
  let failed = 0;
  for (const c of checks) {
    log(`${c.ok ? "  ok  " : "  FAIL"}  ${c.name}`);
    if (!c.ok) {
      failed += 1;
      log(`        ${c.problem}`);
    }
  }
  rule();
  log(`${checks.length - failed} passed, ${failed} failed`);
  if (!failed) {
    log("");
    log("The 21 products this script would create:");
    for (const p of products) {
      const en = p.localizations.find((l) => l.locale === "en-US");
      log(`  ${p.productId.padEnd(42)} ${en.name}`);
    }
  }
  return failed === 0 ? 0 : 1;
}

// =============================================================================
// CLI
// =============================================================================

const HELP = `
create-iap-products.mjs — create OlympIQ's 21 in-app purchases in App Store Connect

  node ./scripts/create-iap-products.mjs [options]

Options
  (no options)             DRY RUN. Prints every request it would send. Writes nothing.
  --apply                  Actually create the products.
  --only <productId>       Work on a single product id. Recommended for the first run.
  --list                   Read-only: show the in-app purchases Apple already has.
  --find-app               Read-only: list every app this key can see, with the
                           numeric Apple ID each one needs. Does NOT need
                           APP_STORE_CONNECT_APP_ID — this is how you find it.
  --with-localizations     Also create the English and Russian display names.
  --with-prices            NOT IMPLEMENTED — refuses, and explains why.
  --minimal                Send only name, productId and inAppPurchaseType.
                           Use this if Apple rejects an attribute name.
  --self-test              Run the offline checks. Needs no keys and no internet.
  --verbose                Print each HTTP request line (never any secret).
  --help                   This text.

Environment (required for everything except --self-test and --help)
  APP_STORE_CONNECT_ISSUER_ID   Issuer ID from Users and Access -> Integrations
  APP_STORE_CONNECT_KEY_ID      Key ID of the App Store Connect API key
  APP_STORE_CONNECT_P8_PATH     Path to the AuthKey_<KEY_ID>.p8 file
  APP_STORE_CONNECT_APP_ID      Numeric Apple ID of the app

See README_IAP_PRODUCTS.md in this folder for step-by-step instructions.
`;

function parseArgs(argv) {
  const opts = {
    apply: false,
    only: null,
    list: false,
    findApp: false,
    withLocalizations: false,
    withPrices: false,
    minimal: false,
    selfTest: false,
    verbose: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--apply": opts.apply = true; break;
      case "--list": opts.list = true; break;
      case "--find-app": opts.findApp = true; break;
      case "--with-localizations": opts.withLocalizations = true; break;
      case "--with-prices": opts.withPrices = true; break;
      case "--minimal": opts.minimal = true; break;
      case "--self-test": opts.selfTest = true; break;
      case "--verbose": opts.verbose = true; break;
      case "--help": case "-h": opts.help = true; break;
      case "--only":
        opts.only = argv[i + 1];
        i += 1;
        if (!opts.only || opts.only.startsWith("--")) fail("--only needs a product id after it.");
        break;
      default:
        if (arg.startsWith("--only=")) { opts.only = arg.slice("--only=".length); break; }
        fail(`Unknown option: ${arg}\n\nRun with --help to see the options.`);
    }
  }
  return opts;
}

/**
 * @param required when false (dry run only), returns null instead of exiting if
 *   the variables are not set — so the very first look at this script needs no
 *   setup at all.
 */
function readEnv(required = true, { needAppId = true } = {}) {
  const missing = [];
  const get = (name) => {
    const value = (process.env[name] || "").trim();
    if (!value) missing.push(name);
    return value;
  };
  const env = {
    issuerId: get("APP_STORE_CONNECT_ISSUER_ID"),
    keyId: get("APP_STORE_CONNECT_KEY_ID"),
    p8Path: get("APP_STORE_CONNECT_P8_PATH"),
    // --find-app is what you run BECAUSE you do not know this value yet, so it
    // cannot be a requirement of the command that discovers it.
    appId: needAppId ? get("APP_STORE_CONNECT_APP_ID") : (process.env.APP_STORE_CONNECT_APP_ID || "").trim(),
  };
  if (missing.length) {
    if (!required) return null;
    fail(
      `These environment variables are not set:\n` +
        missing.map((m) => `  ${m}`).join("\n") +
        `\n\nSee README_IAP_PRODUCTS.md in this folder — it has the exact commands,\n` +
        `and says where in App Store Connect each value comes from.`,
    );
  }
  if (needAppId && !/^\d+$/.test(env.appId)) {
    fail(
      `APP_STORE_CONNECT_APP_ID must be the app's numeric Apple ID (digits only),\n` +
        `not the bundle id.\n\n` +
        `Run this to find it — it needs no app id and creates nothing:\n` +
        `  node ./scripts/create-iap-products.mjs --find-app`,
    );
  }
  return env;
}

/**
 * List every app this key can see, with the numeric Apple ID each one needs.
 *
 * WHY THIS EXISTS. The numeric app id is on a page that is easy to miss, and
 * the failure mode when it is wrong is a 404 that reads exactly like a bad
 * credential — so the natural next move is to regenerate a key that was fine.
 * One read-only command removes the hunt and the misdiagnosis together.
 *
 * Creates nothing, and needs no APP_STORE_CONNECT_APP_ID.
 */
async function findApps(request) {
  let res;
  try {
    res = await request("GET", "/v1/apps?limit=200&fields%5Bapps%5D=name,bundleId,sku");
  } catch (err) {
    if (err instanceof ApiError) {
      process.stderr.write(`\nCould not list your apps.\n\n${formatApiError(err)}\n`);
      return 2;
    }
    throw err;
  }

  const apps = Array.isArray(res && res.data) ? res.data : [];
  rule("=");
  log("YOUR APPS — the first column is APP_STORE_CONNECT_APP_ID");
  rule("=");
  log("");

  if (!apps.length) {
    log("  (none)");
    log("");
    log("This key authenticated but can see no apps. The usual cause is the key's");
    log("access level: creating in-app purchases needs Admin or App Manager.");
    return 2;
  }

  for (const app of apps) {
    const attrs = app.attributes || {};
    const isOurs = attrs.bundleId === BUNDLE_ID;
    log(
      `  ${String(app.id).padEnd(14)}` +
        `${String(attrs.bundleId || "(unknown)").padEnd(30)}` +
        `${attrs.name || ""}${isOurs ? "   <-- this one" : ""}`,
    );
  }
  log("");

  const ours = apps.find((a) => (a.attributes || {}).bundleId === BUNDLE_ID);
  if (!ours) {
    log(`No app with bundle id ${BUNDLE_ID} is visible to this key.`);
    log("Either the app has not been created in App Store Connect yet, or this key");
    log("belongs to a different team.");
    return 2;
  }

  log("Set it and you are done:");
  log("");
  log(`  PowerShell:  $env:APP_STORE_CONNECT_APP_ID = "${ours.id}"`);
  log(`  bash:        export APP_STORE_CONNECT_APP_ID=${ours.id}`);
  return 0;
}

/** Print one request exactly as it would be sent. No headers — no token leaks. */
function printRequest(index, total, label, method, path, body) {
  rule();
  log(`[${index}/${total}] ${label}`);
  log(`${method} ${API_BASE}${path}`);
  log(JSON.stringify(body, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    log(HELP.trim());
    return 0;
  }
  if (opts.selfTest) return selfTest();

  // Before the product table, before anything: this is the command you run when
  // you do not yet have the app id the rest of the script requires.
  if (opts.findApp) {
    const env = readEnv(true, { needAppId: false });
    const privateKeyPem = readPrivateKey(env.p8Path);
    const token = makeToken({ issuerId: env.issuerId, keyId: env.keyId, privateKeyPem });
    return findApps(makeClient(token, { verbose: opts.verbose }));
  }

  if (opts.withPrices) {
    fail(
      `--with-prices is deliberately not implemented, and nothing has been done.\n\n` +
        `Prices are a separate App Store Connect resource that must be written as a\n` +
        `COMPLETE schedule in one request, referencing opaque per-territory price-point\n` +
        `identifiers that have to be fetched and chosen first. Getting that wrong sets a\n` +
        `WRONG PRICE on a live product, which is worse than typing 21 prices in a browser.\n\n` +
        `Set the prices in App Store Connect after the products exist. The products\n` +
        `themselves are created correctly without this flag.\n\n` +
        `Run the same command again without --with-prices.`,
    );
  }

  // The table is proven before anything else — no credentials, no network.
  const allProducts = buildProducts();
  const problems = validateProducts(allProducts);
  if (problems.length) {
    fail(
      `The product table in this script is not valid, so nothing was attempted:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\n\nThis is a bug in the script, not in your setup. The table must have exactly\n` +
        `${EXPECTED_PRODUCT_COUNT} products and every id must read ai.olympiq.app.sub.<slug>.<week|month|year>.`,
    );
  }

  let products = allProducts;
  if (opts.only) {
    products = allProducts.filter((p) => p.productId === opts.only);
    if (!products.length) {
      fail(
        `No product with id "${opts.only}".\n\nValid ids:\n` +
          allProducts.map((p) => `  ${p.productId}`).join("\n"),
      );
    }
  }

  // A dry run with no credentials still shows every request body. Credentials
  // are only needed to look up what already exists.
  const needsCredentials = opts.apply || opts.list;
  const env = readEnv(needsCredentials);

  // Load and parse the key BEFORE announcing what this run will do, so a
  // setup mistake never appears underneath the words "this WILL create".
  const privateKeyPem = env ? readPrivateKey(env.p8Path) : null;

  rule("=");
  log(opts.list ? "LIST — reading what App Store Connect already has" : opts.apply ? "APPLY — this WILL create products in App Store Connect" : "DRY RUN — nothing will be created");
  rule("=");

  let existing = new Map();
  let request = null;

  if (!env) {
    log("No App Store Connect credentials are set, so this dry run cannot check which");
    log("products already exist. Every request body is still shown in full below.");
    log("");
  } else {
    const token = makeToken({ issuerId: env.issuerId, keyId: env.keyId, privateKeyPem });
    request = makeClient(token, { verbose: opts.verbose });

    // 1. Verify auth before anything else.
    try {
      await preflight(request, env.appId);
    } catch (err) {
      if (err instanceof ApiError) {
        process.stderr.write(`\nCould not authenticate with App Store Connect.\n\n${formatApiError(err)}\n`);
        process.stderr.write(`\nNothing was created.\n`);
        return 2;
      }
      process.stderr.write(`\n${err.message}\n`);
      return 2;
    }

    // 2. What already exists. This is what makes re-running safe.
    try {
      existing = await fetchExistingProducts(request, env.appId);
      log(`App Store Connect currently has ${existing.size} in-app purchase(s).`);
    } catch (err) {
      if (err instanceof ApiError) {
        process.stderr.write(`\nCould not list existing in-app purchases.\n\n${formatApiError(err)}\n`);
        return 2;
      }
      throw err;
    }
  }

  if (opts.list) {
    log("");
    if (!existing.size) {
      log("  (none)");
    } else {
      const rows = [...existing.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [productId, info] of rows) {
        const planned = allProducts.some((p) => p.productId === productId);
        log(`  ${productId.padEnd(42)} ${(info.state || "").padEnd(22)} ${planned ? "" : "(not in this script's table)"}`);
      }
      log("");
      const missing = allProducts.filter((p) => !existing.has(p.productId));
      log(missing.length
        ? `${missing.length} of the ${allProducts.length} planned products are still missing:`
        : `All ${allProducts.length} planned products exist.`);
      for (const p of missing) log(`  ${p.productId}`);
    }
    return 0;
  }

  const summary = {
    created: [],
    skipped: [],
    failed: [],
    locCreated: [],
    locSkipped: [],
    locFailed: [],
  };

  // 3. Create.
  const appIdForBody = env ? env.appId : "<APP_STORE_CONNECT_APP_ID>";
  let index = 0;
  for (const product of products) {
    index += 1;
    const label = product.productId;

    const already = existing.get(product.productId);
    if (already) {
      summary.skipped.push(product.productId);
      log(`[${index}/${products.length}] ${label} — already exists, skipped (state: ${already.state || "unknown"})`);
    } else {
      const body = buildCreateBody(product, appIdForBody, { minimal: opts.minimal });
      if (!opts.apply) {
        printRequest(index, products.length, `${label}  (would create)`, "POST", "/v2/inAppPurchases", body);
      } else {
        try {
          const res = await request("POST", "/v2/inAppPurchases", body);
          const newId = res && res.data && res.data.id;
          if (!newId) throw new Error("Apple accepted the request but returned no id.");
          existing.set(product.productId, { id: newId, name: product.referenceName, state: "" });
          summary.created.push(product.productId);
          log(`[${index}/${products.length}] ${label} — created`);
        } catch (err) {
          summary.failed.push({ productId: product.productId, err });
          process.stderr.write(`\n[${index}/${products.length}] ${label} — FAILED\n`);
          process.stderr.write(`${err instanceof ApiError ? formatApiError(err) : `  ${err.message}`}\n`);
          if (err instanceof ApiError && err.status === 429) {
            process.stderr.write(`\nStopping: Apple is rate-limiting. Re-run the same command later.\n`);
            break;
          }
          continue; // one bad product must not stop the other twenty
        }
        // Deliberate pacing. Apple rate-limits per hour, and 21 writes in a
        // burst is exactly the shape that trips it.
        await sleep(300);
      }
    }

    // 4. Localizations — a separate, opt-in step so a wrong guess about the
    //    localization schema cannot stop the products themselves being created.
    if (opts.withLocalizations) {
      const iap = existing.get(product.productId);
      const iapId = iap ? iap.id : null;

      let haveLocales = new Set();
      if (opts.apply && iapId) {
        try {
          haveLocales = await fetchExistingLocales(request, iapId);
        } catch (err) {
          summary.locFailed.push({ productId: product.productId, locale: "(list)", err });
          process.stderr.write(`\n  ${label} — could not list existing localizations\n`);
          process.stderr.write(`${err instanceof ApiError ? formatApiError(err) : `  ${err.message}`}\n`);
          continue;
        }
      }

      for (const loc of product.localizations) {
        if (haveLocales.has(loc.locale)) {
          summary.locSkipped.push(`${product.productId} ${loc.locale}`);
          log(`    ${loc.locale} localization already exists, skipped`);
          continue;
        }
        const body = buildLocalizationBody(iapId || `<id of ${product.productId}>`, loc);
        if (!opts.apply) {
          printRequest(index, products.length, `${label}  (would add ${loc.locale} localization)`, "POST", "/v1/inAppPurchaseLocalizations", body);
          continue;
        }
        try {
          await request("POST", "/v1/inAppPurchaseLocalizations", body);
          summary.locCreated.push(`${product.productId} ${loc.locale}`);
          log(`    ${loc.locale} localization created`);
        } catch (err) {
          summary.locFailed.push({ productId: product.productId, locale: loc.locale, err });
          process.stderr.write(`\n  ${label} — ${loc.locale} localization FAILED\n`);
          process.stderr.write(`${err instanceof ApiError ? formatApiError(err) : `  ${err.message}`}\n`);
        }
        await sleep(300);
      }
    }
  }

  // 5. Summary.
  log("");
  rule("=");
  log(opts.apply ? "SUMMARY" : "SUMMARY (dry run — nothing was created)");
  rule("=");
  if (opts.apply) {
    log(`  created: ${summary.created.length}`);
    log(`  skipped (already existed): ${summary.skipped.length}`);
    log(`  failed:  ${summary.failed.length}`);
    if (opts.withLocalizations) {
      log(`  localizations created: ${summary.locCreated.length}, skipped: ${summary.locSkipped.length}, failed: ${summary.locFailed.length}`);
    }
    if (summary.skipped.length) {
      log("");
      log("  Skipped because they already exist:");
      for (const id of summary.skipped) log(`    ${id}`);
    }
    if (summary.failed.length) {
      log("");
      log("  FAILED — these products were NOT created:");
      for (const f of summary.failed) {
        log(`    ${f.productId}  (${f.err instanceof ApiError ? `HTTP ${f.err.status}` : "error"})`);
      }
      log("");
      log("  The full error from Apple is printed above each failure. If it names a");
      log("  field under \"offending field\", that attribute is wrong in this script —");
      log("  try again with --minimal, which sends only the required attributes.");
    }
    if (summary.locFailed.length) {
      log("");
      log("  Localizations that FAILED (the products themselves are fine):");
      for (const f of summary.locFailed) log(`    ${f.productId}  ${f.locale}`);
      log("  Display names can also be typed in App Store Connect.");
    }
  } else {
    const wouldCreate = products.filter((p) => !existing.has(p.productId));
    log(`  would create: ${wouldCreate.length}`);
    log(`  would skip (already exist): ${products.length - wouldCreate.length}`);
    log("");
    log("  Nothing was sent to Apple except read-only lookups.");
    log("  To create one product and check it by eye first:");
    log(`    node ./scripts/create-iap-products.mjs --apply --only ${(wouldCreate[0] || products[0]).productId}`);
    log("  To create all of them:");
    log("    node ./scripts/create-iap-products.mjs --apply");
  }

  if (opts.apply && summary.created.length) {
    log("");
    log("  STILL TO DO BY HAND IN APP STORE CONNECT — a created product is not yet");
    log("  sellable. Each one needs a PRICE, and the whole set has to be submitted");
    log("  for review with the next app version. See README_IAP_PRODUCTS.md.");
  }

  const anyFailure = summary.failed.length > 0 || summary.locFailed.length > 0;
  return anyFailure ? 1 : 0;
}

/**
 * Let the process end on its own terms.
 *
 * WHY NOT process.exit(). Node's fetch keeps HTTP/1.1 sockets in a global
 * keep-alive pool, which is still open when the last response resolves. Calling
 * process.exit() on top of that races libuv's handle teardown, and on Windows
 * (Node 24) it trips
 *
 *     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c
 *
 * AFTER every request has already succeeded. During --apply that is the worst
 * possible failure mode: products were created, and the operator sees a crash
 * and cannot tell whether they were. Closing the pool instead lets the event
 * loop drain and the exit code stand on its own.
 *
 * If a future Node renames the dispatcher symbol this degrades to waiting for
 * the keep-alive timeout — a few seconds, then a clean exit with the right
 * code. Slow is an acceptable failure here; a false alarm is not.
 */
async function shutdown() {
  const dispatcher = globalThis[Symbol.for("undici.globalDispatcher.1")];
  if (dispatcher && typeof dispatcher.close === "function") {
    try {
      await dispatcher.close();
    } catch {
      /* already closed, or nothing was ever opened */
    }
  }
}

main()
  .then(async (code) => {
    await shutdown();
    process.exitCode = code;
  })
  .catch(async (err) => {
    // Last resort. Whatever this is, it must not print a token: the token is
    // only ever inside makeClient's closure and is never attached to an error.
    process.stderr.write(`\nUnexpected error:\n  ${err && err.stack ? err.stack : err}\n`);
    await shutdown();
    process.exitCode = 1;
  });
