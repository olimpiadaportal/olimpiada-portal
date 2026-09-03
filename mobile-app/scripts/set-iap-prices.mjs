#!/usr/bin/env node
// =============================================================================
// SET THE PRICE ON OLYMPIQ'S 21 IN-APP PURCHASES
//
// WHY THIS EXISTS, AND WHY IT DID NOT AT FIRST. create-iap-products.mjs
// deliberately REFUSES to set prices, on the reasoning that a wrong price on a
// live product is worse than typing 21 of them by hand. That reasoning was
// wrong, and this script is the correction:
//
//   * Price is one of the few fields Apple lets you edit AT ANY TIME. Even
//     while a product is Waiting for Review or In Review, the editable set is
//     "reference name, PRICING, and availability". There is no state in which a
//     price becomes permanent — unlike the product id, which never can be
//     changed or reused, and which the other script was right to be careful of.
//   * Right now nothing is exposed. The app version is REJECTED and all 21
//     products are MISSING_METADATA, so no storefront lists them and no
//     StoreKit client can fetch them. The window in which a mistake here could
//     cost a real customer real money is currently zero.
//   * By hand this is ~7 clicks x 21 products through a three-screen wizard,
//     with no bulk or duplicate control anywhere in App Store Connect.
//
// THE TRAP THIS SCRIPT IS BUILT AROUND. A price point id is NOT a global
// "tier" — it is base64 of `{iapId}_{territory}_{tier}`, so a point fetched for
// one product is meaningless for the other twenty. Caching one id and reusing
// it is the single most likely way to write a pricing script that looks like it
// worked and did not. Every product therefore gets its OWN lookup, and every
// write is READ BACK and compared before the run is called a success.
//
// customerPrice is a STRING in Apple's response ("2.99"), not a number. It is
// compared as a string throughout: a float comparison silently picks a
// neighbouring tier, which is the one failure mode here that is not loud.
//
// USAGE (from mobile-app/)
//   node ./scripts/set-iap-prices.mjs --show-points     what prices exist at all
//   node ./scripts/set-iap-prices.mjs                   dry run: resolve + show
//   node ./scripts/set-iap-prices.mjs --only <productId> --apply
//   node ./scripts/set-iap-prices.mjs --apply           all 21
//
// Same four environment variables as create-iap-products.mjs.
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import process from "node:process";

const API_BASE = "https://api.appstoreconnect.apple.com";
const BUNDLE_ID = "ai.olympiq.app";

// OWNER DECISION, 2026-09-03 — "Option A": the CUSTOMER pays the same as on the
// web, and Apple's commission comes out of our side rather than being added on
// top. A family is charged the same whether they buy on olympiq.ai or in the
// app; we simply net less through Apple. Explicitly NOT the alternative of
// marking the App Store price up to preserve revenue.
//
// THE BASE TERRITORY IS AZERBAIJAN BUT IT IS BILLED IN **USD**. Apple's
// territory record for AZE returns currency USD — the App Store does not charge
// manat there. So these numbers are DOLLARS, converted from the web's
// 3 / 9 / 90 AZN at the pegged rate of 1.70 AZN = 1 USD and rounded to the
// nearest price point Apple actually offers:
//
//     ₼3  / 1.70 = $1.76  ->  1.79
//     ₼9  / 1.70 = $5.29  ->  5.29
//     ₼90 / 1.70 = $52.94 ->  52.99
//
// EXPECTED_CURRENCY is checked against Apple before anything is written. The
// first version of this script hardcoded the AZN assumption and would have set
// $3 / $9 / $90 — a ~70% overcharge — while reporting an exact match, because
// customerPrice is a bare number with no unit anywhere in Apple's response.
const BASE_TERRITORY = "AZE";
const EXPECTED_CURRENCY = "USD";
const TARGET_PRICE = {
  week: "1.79",
  month: "5.29",
  year: "52.99",
};

const SUBJECT_SLUGS = [
  "math",
  "logic",
  "english",
  "informatics",
  "science",
  "physics",
  "azerbaijani",
];
const INTERVALS = ["week", "month", "year"];

function plannedProducts() {
  const out = [];
  for (const slug of SUBJECT_SLUGS) {
    for (const interval of INTERVALS) {
      out.push({
        productId: `${BUNDLE_ID}.sub.${slug}.${interval}`,
        interval,
        target: TARGET_PRICE[interval],
      });
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
function log(msg = "") {
  process.stdout.write(`${msg}\n`);
}
function rule(ch = "-") {
  log(ch.repeat(78));
}
function fail(msg) {
  process.stderr.write(`\nERROR\n${msg}\n`);
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------------------------
// Auth — same proven signer as create-iap-products.mjs. Duplicated rather than
// shared: that script is what the owner runs on release day, and refactoring it
// to export helpers risks the tool that matters most to save forty lines here.
// -----------------------------------------------------------------------------
function b64u(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeToken({ issuerId, keyId, privateKeyPem }) {
  const now = Math.floor(Date.now() / 1000);
  const signingInput =
    `${b64u(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.` +
    `${b64u(JSON.stringify({ iss: issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }))}`;
  // ieee-p1363, not Node's DER default. DER produces a bare 401 that reads
  // exactly like a wrong key id.
  const sig = crypto.sign("sha256", Buffer.from(signingInput), {
    key: crypto.createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64u(sig)}`;
}

class ApiError extends Error {
  constructor(status, bodyText, method, path) {
    super(`HTTP ${status}`);
    this.status = status;
    this.bodyText = bodyText;
    this.method = method;
    this.path = path;
  }
}

function formatApiError(err) {
  const lines = [`  ${err.method} ${err.path}`, `  HTTP ${err.status}`];
  try {
    const parsed = JSON.parse(err.bodyText);
    for (const e of parsed.errors || []) {
      lines.push("");
      lines.push(`  ${e.title || "(no title)"}${e.code ? `  [${e.code}]` : ""}`);
      if (e.detail) lines.push(`    ${e.detail}`);
      const pointer = e.source && (e.source.pointer || e.source.parameter);
      if (pointer) lines.push(`    offending field: ${pointer}`);
    }
  } catch {
    if (err.bodyText) lines.push(`  ${err.bodyText.slice(0, 400)}`);
  }
  return lines.join("\n");
}

function makeClient(token, { verbose = false } = {}) {
  return async (method, path, body) => {
    const url = `${API_BASE}${path}`;
    if (verbose) log(`  → ${method} ${path}`);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text, method, path);
    if (!text) return null;
    return JSON.parse(text);
  };
}

function readEnv() {
  const get = (n) => (process.env[n] || "").trim();
  const env = {
    issuerId: get("APP_STORE_CONNECT_ISSUER_ID"),
    keyId: get("APP_STORE_CONNECT_KEY_ID"),
    p8Path: get("APP_STORE_CONNECT_P8_PATH"),
    appId: get("APP_STORE_CONNECT_APP_ID"),
  };
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    fail(
      `These environment variables are not set:\n` +
        `  APP_STORE_CONNECT_ISSUER_ID / KEY_ID / P8_PATH / APP_ID\n\n` +
        `They are the same four create-iap-products.mjs uses.`,
    );
  }
  if (!/^\d+$/.test(env.appId)) fail("APP_STORE_CONNECT_APP_ID must be digits only.");
  if (!existsSync(env.p8Path)) fail(`No .p8 file at that path.`);
  return env;
}

// -----------------------------------------------------------------------------
// Apple operations
// -----------------------------------------------------------------------------
async function fetchProducts(request, appId) {
  const byProductId = new Map();
  let cursor =
    `/v1/apps/${appId}/inAppPurchasesV2` +
    `?fields%5BinAppPurchases%5D=productId,state,name&limit=200`;
  while (cursor) {
    const body = await request("GET", cursor);
    for (const row of body.data || []) {
      const a = row.attributes || {};
      if (a.productId) byProductId.set(a.productId, { id: row.id, state: a.state || "" });
    }
    const next = body.links && body.links.next;
    cursor = next ? next.replace(API_BASE, "") : null;
  }
  return byProductId;
}

/**
 * The price ladder for ONE product in ONE territory.
 *
 * Per-product by necessity: the id encodes the in-app purchase. There is no
 * filter by price — Apple offers only filter[territory] — so the whole ladder
 * comes back (~800 points) and the match is made here.
 */
/**
 * WHICH CURRENCY IS THIS TERRITORY BILLED IN?
 *
 * `customerPrice` is a bare number — "3" — with no unit attached anywhere in
 * the price-point response. The owner's instruction was "the same price as the
 * web app", which is 3 / 9 / 90 **AZN**. If the Azerbaijan storefront bills in
 * USD, then writing "3" charges $3 ≈ ₼5.10 and quietly sets a price ~70% above
 * the web one while every check in this script reports an exact match.
 *
 * The ladder itself is the warning sign: 0.99 / 1.99 / 2.99 is a USD-shaped
 * ladder. Rather than infer from the shape, ask Apple.
 */
async function fetchTerritoryCurrency(request, territory) {
  // /v1/territories is a flat list of ~175 rows, each carrying `currency`. It is
  // fetched WHOLE and matched here rather than with filter[id]: that filter is
  // not documented for this resource and the first attempt returned nothing,
  // which — because the error was swallowed — surfaced as "could not read the
  // currency" instead of "the query was wrong". One list call, no guessing.
  let cursor = "/v1/territories?limit=200";
  const seen = [];
  while (cursor) {
    const body = await request("GET", cursor);
    for (const row of body.data || []) {
      seen.push(row.id);
      if (row.id === territory) {
        return String((row.attributes || {}).currency || "");
      }
    }
    const next = body.links && body.links.next;
    cursor = next ? next.replace(API_BASE, "") : null;
  }
  throw new Error(
    `territory "${territory}" is not in Apple's list of ${seen.length} territories`,
  );
}

async function fetchPricePoints(request, iapId, territory) {
  const points = [];
  let cursor =
    `/v2/inAppPurchases/${iapId}/pricePoints` +
    `?filter%5Bterritory%5D=${territory}` +
    `&fields%5BinAppPurchasePricePoints%5D=customerPrice,proceeds&limit=8000`;
  while (cursor) {
    const body = await request("GET", cursor);
    for (const row of body.data || []) {
      points.push({
        id: row.id,
        customerPrice: String((row.attributes || {}).customerPrice ?? ""),
        proceeds: String((row.attributes || {}).proceeds ?? ""),
      });
    }
    const next = body.links && body.links.next;
    cursor = next ? next.replace(API_BASE, "") : null;
  }
  return points;
}

/** Numeric value of a decimal price STRING, for ordering only — never matching. */
function asNumber(s) {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Exact string match first, because that is the only comparison that cannot
 * silently pick a neighbouring tier. Apple returns "3" or "3.00" depending on
 * the currency, so a normalised numeric equality is accepted as a SECOND pass —
 * still exact in value, just tolerant of trailing zeros.
 */
function findPoint(points, target) {
  const exact = points.find((p) => p.customerPrice === target);
  if (exact) return { point: exact, how: "exact string" };
  const t = asNumber(target);
  const sameValue = points.find((p) => asNumber(p.customerPrice) === t);
  if (sameValue) return { point: sameValue, how: `same value (${sameValue.customerPrice})` };
  return { point: null, how: "no match" };
}

/** The nearest few points either side, so a missing target is actionable. */
function neighbours(points, target, count = 3) {
  const t = asNumber(target);
  return [...points]
    .filter((p) => Number.isFinite(asNumber(p.customerPrice)))
    .sort((a, b) => Math.abs(asNumber(a.customerPrice) - t) - Math.abs(asNumber(b.customerPrice) - t))
    .slice(0, count)
    .map((p) => p.customerPrice);
}

/**
 * Write the price. POST is the ONLY writer on this resource — there is no PATCH
 * and no DELETE — so the schedule is always sent complete and a correction is
 * simply another POST.
 */
function buildScheduleBody(iapId, pricePointId, territory) {
  const placeholder = "${price1}";
  return {
    data: {
      type: "inAppPurchasePriceSchedules",
      relationships: {
        inAppPurchase: { data: { type: "inAppPurchases", id: String(iapId) } },
        baseTerritory: { data: { type: "territories", id: territory } },
        manualPrices: { data: [{ type: "inAppPurchasePrices", id: placeholder }] },
      },
    },
    included: [
      {
        type: "inAppPurchasePrices",
        id: placeholder,
        // null = effective immediately. A date here would schedule it instead.
        attributes: { startDate: null },
        relationships: {
          inAppPurchasePricePoint: {
            data: { type: "inAppPurchasePricePoints", id: pricePointId },
          },
        },
      },
    ],
  };
}

/** Read the price back. "Apple returned 2xx" is not the same as "it is set". */
async function readBackPrice(request, iapId) {
  try {
    const body = await request(
      "GET",
      `/v1/inAppPurchasePriceSchedules/${iapId}/manualPrices` +
        `?include=inAppPurchasePricePoint&limit=200`,
    );
    const points = new Map();
    for (const inc of body.included || []) {
      if (inc.type === "inAppPurchasePricePoints") {
        points.set(inc.id, String((inc.attributes || {}).customerPrice ?? ""));
      }
    }
    for (const row of body.data || []) {
      const ref =
        row.relationships &&
        row.relationships.inAppPurchasePricePoint &&
        row.relationships.inAppPurchasePricePoint.data;
      if (ref && points.has(ref.id)) return points.get(ref.id);
    }
    return null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
function parseArgs(argv) {
  const o = { apply: false, only: null, showPoints: false, verbose: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") o.apply = true;
    else if (a === "--show-points") o.showPoints = true;
    else if (a === "--verbose") o.verbose = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--only") {
      o.only = argv[i + 1];
      i += 1;
      if (!o.only || o.only.startsWith("--")) fail("--only needs a product id after it.");
    } else if (a.startsWith("--only=")) o.only = a.slice("--only=".length);
    else fail(`Unknown option: ${a}`);
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    log("node ./scripts/set-iap-prices.mjs [--show-points] [--only <productId>] [--apply]");
    log("");
    log(`Base territory: ${BASE_TERRITORY}`);
    log(`Targets: week=${TARGET_PRICE.week}  month=${TARGET_PRICE.month}  year=${TARGET_PRICE.year}`);
    return 0;
  }

  const env = readEnv();
  const token = makeToken({
    issuerId: env.issuerId,
    keyId: env.keyId,
    privateKeyPem: readFileSync(env.p8Path, "utf8"),
  });
  const request = makeClient(token, { verbose: opts.verbose });

  rule("=");
  log(opts.apply ? "APPLY — prices WILL be written" : "DRY RUN — nothing is written");
  log(`base territory ${BASE_TERRITORY} · week ${TARGET_PRICE.week} · month ${TARGET_PRICE.month} · year ${TARGET_PRICE.year}`);
  rule("=");

  let live;
  try {
    live = await fetchProducts(request, env.appId);
  } catch (err) {
    process.stderr.write(`\nCould not read the products.\n\n${err instanceof ApiError ? formatApiError(err) : err.message}\n`);
    return 2;
  }
  log(`App Store Connect has ${live.size} in-app purchase(s).`);

  let products = plannedProducts();
  if (opts.only) {
    products = products.filter((p) => p.productId === opts.only);
    if (!products.length) fail(`No planned product with id "${opts.only}".`);
  }

  // --show-points needs only one product: the LADDER is per-territory and the
  // values are identical across products, only the ids differ.
  if (opts.showPoints) {
    const first = products[0];
    const iap = live.get(first.productId);
    if (!iap) fail(`${first.productId} does not exist at Apple yet.`);
    let currency = "";
    try {
      currency = await fetchTerritoryCurrency(request, BASE_TERRITORY);
    } catch (err) {
      log("");
      log(`Could not read the currency: ${err instanceof ApiError ? `HTTP ${err.status}` : err.message}`);
    }
    const points = await fetchPricePoints(request, iap.id, BASE_TERRITORY);
    log("");
    log("=".repeat(78));
    log(
      currency
        ? `${BASE_TERRITORY} IS BILLED IN ${currency}. Every number below is ${currency}.`
        : `COULD NOT READ THE CURRENCY for ${BASE_TERRITORY} — do not apply until you know it.`,
    );
    if (currency && currency !== "AZN") {
      log("");
      log(`  !! The web price is 3 / 9 / 90 AZN. This storefront charges ${currency}.`);
      log(`     Writing "3" here charges 3 ${currency}, NOT 3 AZN. Convert first, or`);
      log(`     accept a deliberately different App Store price and say so.`);
    }
    log("=".repeat(78));
    log("");
    log(`${points.length} price point(s) available in ${BASE_TERRITORY}, cheapest first:`);
    const sorted = [...points].sort((a, b) => asNumber(a.customerPrice) - asNumber(b.customerPrice));
    for (const p of sorted.slice(0, 40)) log(`   customer ${p.customerPrice}   (you receive ${p.proceeds})`);
    if (sorted.length > 40) log(`   … and ${sorted.length - 40} more`);
    log("");
    for (const interval of INTERVALS) {
      const { point, how } = findPoint(points, TARGET_PRICE[interval]);
      log(
        point
          ? `  ${interval.padEnd(5)} target ${TARGET_PRICE[interval].padEnd(4)} → ${point.customerPrice} (${how})`
          : `  ${interval.padEnd(5)} target ${TARGET_PRICE[interval].padEnd(4)} → NO MATCH. nearest: ${neighbours(points, TARGET_PRICE[interval]).join(", ")}`,
      );
    }
    return 0;
  }

  // FAIL CLOSED ON THE UNIT. customerPrice is a bare number — Apple attaches no
  // currency to it anywhere in the price-point response. If this storefront's
  // billing currency is not the one TARGET_PRICE was written in, every match
  // below is exact in the WRONG unit, and no read-back can catch it because
  // Apple faithfully stores exactly what it was asked for. This guard is the
  // only thing between "$1.79" and "₼1.79".
  let currency = "";
  try {
    currency = await fetchTerritoryCurrency(request, BASE_TERRITORY);
  } catch (err) {
    log("");
    log(`Currency lookup failed: ${err instanceof ApiError ? formatApiError(err) : err.message}`);
  }
  if (currency !== EXPECTED_CURRENCY) {
    log("");
    log(
      currency
        ? `REFUSING: ${BASE_TERRITORY} is billed in ${currency}, but TARGET_PRICE ` +
          `(${TARGET_PRICE.week}/${TARGET_PRICE.month}/${TARGET_PRICE.year}) was ` +
          `written in ${EXPECTED_CURRENCY}.`
        : `REFUSING: could not read the billing currency for ${BASE_TERRITORY}.`,
    );
    log("");
    log("Run --show-points, decide the prices in the real currency, and update");
    log("both TARGET_PRICE and EXPECTED_CURRENCY at the top of this script.");
    return 2;
  }
  log(`Confirmed: ${BASE_TERRITORY} bills in ${currency}, matching TARGET_PRICE.`);

  const summary = { set: [], skipped: [], failed: [] };
  let index = 0;

  for (const product of products) {
    index += 1;
    const label = `[${index}/${products.length}] ${product.productId}`;
    const iap = live.get(product.productId);
    if (!iap) {
      log(`${label} — NOT AT APPLE, skipped`);
      summary.skipped.push(product.productId);
      continue;
    }

    let points;
    try {
      // PER PRODUCT. A price point id embeds the in-app purchase id, so a point
      // fetched for another product is not valid here.
      points = await fetchPricePoints(request, iap.id, BASE_TERRITORY);
    } catch (err) {
      log(`${label} — could not read price points`);
      process.stderr.write(`${err instanceof ApiError ? formatApiError(err) : err.message}\n`);
      summary.failed.push(product.productId);
      continue;
    }

    const { point, how } = findPoint(points, product.target);
    if (!point) {
      log(
        `${label} — NO PRICE POINT for ${product.target}. nearest available: ` +
          neighbours(points, product.target).join(", "),
      );
      summary.failed.push(product.productId);
      continue;
    }

    const body = buildScheduleBody(iap.id, point.id, BASE_TERRITORY);
    if (!opts.apply) {
      log(`${label} — would set ${point.customerPrice} (${how}); you receive ${point.proceeds}`);
      continue;
    }

    try {
      await request("POST", "/v1/inAppPurchasePriceSchedules", body);
    } catch (err) {
      log(`${label} — FAILED`);
      process.stderr.write(`${err instanceof ApiError ? formatApiError(err) : err.message}\n`);
      summary.failed.push(product.productId);
      continue;
    }

    // The write is not believed until it is read back. A 2xx with the wrong
    // price attached is the one failure here that would otherwise be silent.
    const readBack = await readBackPrice(request, iap.id);
    if (readBack === null) {
      log(`${label} — written, but could NOT verify (read-back failed)`);
      summary.failed.push(product.productId);
    } else if (asNumber(readBack) !== asNumber(product.target)) {
      log(`${label} — WRONG PRICE STORED: expected ${product.target}, Apple has ${readBack}`);
      summary.failed.push(product.productId);
    } else {
      log(`${label} — set ${readBack} ✓ verified`);
      summary.set.push(product.productId);
    }

    // Apple rate-limits per hour; 21 writes in a burst is the shape that trips it.
    await sleep(400);
  }

  log("");
  rule("=");
  log("SUMMARY");
  rule("=");
  log(`  priced and verified: ${summary.set.length}`);
  log(`  skipped (not at Apple): ${summary.skipped.length}`);
  log(`  failed: ${summary.failed.length}`);
  for (const f of summary.failed) log(`      ${f}`);
  if (!opts.apply) {
    log("");
    log("Nothing was written. Re-run with --apply.");
  }
  return summary.failed.length ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`\nUnexpected error:\n  ${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 2;
  });
