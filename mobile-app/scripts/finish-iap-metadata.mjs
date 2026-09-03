#!/usr/bin/env node
// =============================================================================
// THE LAST TWO FIELDS: territory availability, and the review screenshot.
//
// After create-iap-products.mjs and set-iap-prices.mjs the 21 products have a
// reference name, a price schedule, en-US + ru localizations, review notes and
// an inherited tax category — and Apple still reports every one of them as
// MISSING_METADATA. Opening a product in App Store Connect shows exactly two
// empty sections, and neither is marked "(Optional)" the way Review Notes and
// Image are:
//
//     Availability        -> "Set Up Availability", nothing selected
//     Review Information  -> Screenshot, an empty "Choose File"
//
// Doing both by hand is 42 operations across 21 pages. This does them in one.
//
// -----------------------------------------------------------------------------
// TWO TRAPS THIS SCRIPT IS BUILT AROUND, both verified against Apple's schemas
// rather than inferred from the blog posts that get them wrong.
// -----------------------------------------------------------------------------
// 1. THE AVAILABILITY BODY IS NOT THE APP-LEVEL ONE. The app resource
//    (`appAvailabilities`) uses relationship `territoryAvailabilities`, member
//    type `territoryAvailabilities`, and a top-level `included` array. The
//    IN-APP PURCHASE resource uses relationship `availableTerritories`, member
//    type `territories`, and NO `included` array at all. Copying the app shape
//    produces 409 ENTITY_ERROR.RELATIONSHIP.INVALID. Most snippets online are
//    the app-level one.
//
// 2. READING AVAILABILITY BACK VIA `include=` SILENTLY TRUNCATES. The include
//    form caps `limit[availableTerritories]` at 50, so a correct 175-territory
//    write reads back as ~50 and looks like a partial failure. The dedicated
//    sub-endpoint allows limit=200 and returns them all. Verification uses the
//    sub-endpoint.
//
// The screenshot is a three-step reserve -> upload -> commit. The commit's
// `sourceFileChecksum` is the MD5 of the WHOLE original file as LOWERCASE HEX —
// not base64, not SHA-256, not per-part. Apple recomputes it after reassembly
// and fails processing on a mismatch. The upload PUTs go to pre-signed
// blobstore URLs and must NOT carry our JWT.
//
// USAGE (from mobile-app/)
//   node ./scripts/finish-iap-metadata.mjs                              dry run
//   node ./scripts/finish-iap-metadata.mjs --screenshot ../shot.png     dry run
//   node ./scripts/finish-iap-metadata.mjs --screenshot ../shot.png \
//        --only ai.olympiq.app.sub.math.month --apply
//   node ./scripts/finish-iap-metadata.mjs --screenshot ../shot.png --apply
//
//   --availability-only     set territories, skip the screenshot
//   --screenshot-only       upload the screenshot, skip availability
//
// Same four environment variables as the other two scripts.
// =============================================================================
import { readFileSync, existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import crypto from "node:crypto";
import process from "node:process";

const API_BASE = "https://api.appstoreconnect.apple.com";
const BUNDLE_ID = "ai.olympiq.app";

const SUBJECT_SLUGS = ["math", "logic", "english", "informatics", "science", "physics", "azerbaijani"];
const INTERVALS = ["week", "month", "year"];
const EXPECTED_PRODUCT_IDS = SUBJECT_SLUGS.flatMap((s) => INTERVALS.map((i) => `${BUNDLE_ID}.sub.${s}.${i}`));

const IMAGE_MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

// -----------------------------------------------------------------------------
function log(m = "") {
  process.stdout.write(`${m}\n`);
}
function rule(c = "-") {
  log(c.repeat(78));
}
function fail(m) {
  process.stderr.write(`\nERROR\n${m}\n`);
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function b64u(x) {
  return Buffer.from(x).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeToken({ issuerId, keyId, privateKeyPem }) {
  const now = Math.floor(Date.now() / 1000);
  const input =
    `${b64u(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.` +
    `${b64u(JSON.stringify({ iss: issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }))}`;
  // ieee-p1363, not Node's DER default: DER yields a bare 401 that reads like a
  // wrong key id.
  const sig = crypto.sign("sha256", Buffer.from(input), {
    key: crypto.createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${b64u(sig)}`;
}

class ApiError extends Error {
  constructor(status, bodyText, method, path) {
    super(`HTTP ${status}`);
    Object.assign(this, { status, bodyText, method, path });
  }
}

function formatApiError(err) {
  const lines = [`  ${err.method} ${err.path}`, `  HTTP ${err.status}`];
  try {
    for (const e of JSON.parse(err.bodyText).errors || []) {
      lines.push("");
      lines.push(`  ${e.title || "(no title)"}${e.code ? `  [${e.code}]` : ""}`);
      if (e.detail) lines.push(`    ${e.detail}`);
      const p = e.source && (e.source.pointer || e.source.parameter);
      if (p) lines.push(`    offending field: ${p}`);
    }
  } catch {
    if (err.bodyText) lines.push(`  ${err.bodyText.slice(0, 400)}`);
  }
  return lines.join("\n");
}

function makeClient(token, { verbose = false } = {}) {
  return async (method, path, body) => {
    if (verbose) log(`  → ${method} ${path}`);
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text, method, path);
    return text ? JSON.parse(text) : null;
  };
}

function readEnv() {
  const g = (n) => (process.env[n] || "").trim();
  const env = {
    issuerId: g("APP_STORE_CONNECT_ISSUER_ID"),
    keyId: g("APP_STORE_CONNECT_KEY_ID"),
    p8Path: g("APP_STORE_CONNECT_P8_PATH"),
    appId: g("APP_STORE_CONNECT_APP_ID"),
  };
  if (Object.values(env).some((v) => !v)) {
    fail("APP_STORE_CONNECT_ISSUER_ID / KEY_ID / P8_PATH / APP_ID must all be set.");
  }
  if (!/^\d+$/.test(env.appId)) fail("APP_STORE_CONNECT_APP_ID must be digits only.");
  if (!existsSync(env.p8Path)) fail("No .p8 file at APP_STORE_CONNECT_P8_PATH.");
  return env;
}

// -----------------------------------------------------------------------------
async function fetchProducts(request, appId) {
  const map = new Map();
  let cursor = `/v1/apps/${appId}/inAppPurchasesV2?fields%5BinAppPurchases%5D=productId,state,name&limit=200`;
  while (cursor) {
    const body = await request("GET", cursor);
    for (const row of body.data || []) {
      const a = row.attributes || {};
      if (a.productId) map.set(a.productId, { id: row.id, state: a.state || "" });
    }
    cursor = body.links && body.links.next ? body.links.next.replace(API_BASE, "") : null;
  }
  return map;
}

async function fetchAllTerritories(request) {
  const ids = [];
  let cursor = "/v1/territories?limit=200";
  while (cursor) {
    const body = await request("GET", cursor);
    for (const row of body.data || []) ids.push(row.id);
    cursor = body.links && body.links.next ? body.links.next.replace(API_BASE, "") : null;
  }
  return ids;
}

/** POST replaces the WHOLE availability set — there is no PATCH and no DELETE. */
function buildAvailabilityBody(iapId, territoryIds) {
  return {
    data: {
      type: "inAppPurchaseAvailabilities",
      attributes: {
        // Future territories Apple adds are included automatically, so a new
        // storefront does not silently arrive unsellable.
        availableInNewTerritories: true,
      },
      relationships: {
        // `availableTerritories` + member type `territories`, and NO `included`.
        // The app-level resource uses `territoryAvailabilities` + `included`;
        // that shape here is a 409.
        availableTerritories: {
          data: territoryIds.map((id) => ({ type: "territories", id })),
        },
        inAppPurchase: { data: { type: "inAppPurchases", id: String(iapId) } },
      },
    },
  };
}

/** Count via the SUB-ENDPOINT. `include=` caps at 50 and truncates silently. */
async function countAvailableTerritories(request, availabilityId) {
  let total = 0;
  let cursor = `/v1/inAppPurchaseAvailabilities/${availabilityId}/availableTerritories?limit=200`;
  while (cursor) {
    const body = await request("GET", cursor);
    total += (body.data || []).length;
    cursor = body.links && body.links.next ? body.links.next.replace(API_BASE, "") : null;
  }
  return total;
}

async function setAvailability(request, iapId, territoryIds) {
  const created = await request("POST", "/v1/inAppPurchaseAvailabilities", buildAvailabilityBody(iapId, territoryIds));
  const availabilityId = created && created.data && created.data.id;
  if (!availabilityId) return { ok: false, reason: "no id returned" };
  const count = await countAvailableTerritories(request, availabilityId);
  if (count !== territoryIds.length) {
    return { ok: false, reason: `stored ${count} of ${territoryIds.length} territories` };
  }
  return { ok: true, count };
}

// -----------------------------------------------------------------------------
// Screenshot: reserve -> upload -> commit -> verify.
// -----------------------------------------------------------------------------
async function uploadScreenshot(request, iapId, file) {
  // 1. RESERVE
  let reserved;
  try {
    reserved = await request("POST", "/v1/inAppPurchaseAppStoreReviewScreenshots", {
      data: {
        type: "inAppPurchaseAppStoreReviewScreenshots",
        attributes: { fileName: file.name, fileSize: file.bytes.length },
        // `inAppPurchaseV2` — `inAppPurchase` is the deprecated v1 resource.
        relationships: { inAppPurchaseV2: { data: { type: "inAppPurchases", id: String(iapId) } } },
      },
    });
  } catch (err) {
    // ALREADY DONE IS DONE. Apple allows one review screenshot per product and
    // answers a second reservation with
    //   409 ENTITY_ERROR.MEDIA_ASSET_CREATION_NOT_ALLOWED "Screenshot already exists"
    // That is the state we were trying to reach, so reporting it as a failure
    // makes a complete run look partial — which is exactly what happened on the
    // first real run: 20 uploaded, 1 "failed", and all 21 actually had one.
    // Re-running has to be safe the way the other scripts are.
    const already =
      err instanceof ApiError &&
      err.status === 409 &&
      /already exists|MEDIA_ASSET_CREATION_NOT_ALLOWED/i.test(err.bodyText || "");
    if (already) return { ok: true, state: "already present" };
    throw err;
  }

  const shot = reserved && reserved.data;
  const shotId = shot && shot.id;
  const operations = (shot && shot.attributes && shot.attributes.uploadOperations) || [];
  if (!shotId) return { ok: false, reason: "reserve returned no id" };
  if (operations.length === 0) return { ok: false, reason: "reserve returned no uploadOperations" };

  // 2. UPLOAD each part to its PRE-SIGNED url. No Authorization header here —
  //    these are unauthenticated, time-limited blobstore URLs, and sending our
  //    JWT to them is both unnecessary and a credential leak to another host.
  for (const op of operations) {
    const headers = {};
    for (const h of op.requestHeaders || []) headers[h.name] = h.value;
    const slice = file.bytes.subarray(op.offset, op.offset + op.length);
    const res = await fetch(op.url, { method: op.method || "PUT", headers, body: slice });
    if (!res.ok) return { ok: false, reason: `part upload HTTP ${res.status}` };
  }

  // 3. COMMIT. Exactly two attributes are valid here: `uploaded` and
  //    `sourceFileChecksum`. It is `uploaded`, not `isUploaded` — that name
  //    belongs to the older appScreenshots flow and is what most blog posts say.
  const committed = await request("PATCH", `/v1/inAppPurchaseAppStoreReviewScreenshots/${shotId}`, {
    data: {
      type: "inAppPurchaseAppStoreReviewScreenshots",
      id: shotId,
      attributes: { uploaded: true, sourceFileChecksum: file.md5 },
    },
  });

  // 4. VERIFY. Apple recomputes the checksum after reassembling the parts, so a
  //    2xx on the PATCH is not the same as a usable asset.
  const state =
    (committed && committed.data && committed.data.attributes && committed.data.attributes.assetDeliveryState) || {};
  if (state.errors && state.errors.length) {
    return { ok: false, reason: `asset rejected: ${JSON.stringify(state.errors).slice(0, 120)}` };
  }
  return { ok: true, state: state.state || "(no state)" };
}

// -----------------------------------------------------------------------------
function parseArgs(argv) {
  const o = {
    apply: false,
    only: null,
    screenshot: null,
    availabilityOnly: false,
    screenshotOnly: false,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") o.apply = true;
    else if (a === "--availability-only") o.availabilityOnly = true;
    else if (a === "--screenshot-only") o.screenshotOnly = true;
    else if (a === "--verbose") o.verbose = true;
    else if (a === "--only") {
      o.only = argv[++i];
      if (!o.only || o.only.startsWith("--")) fail("--only needs a product id.");
    } else if (a.startsWith("--only=")) o.only = a.slice(7);
    else if (a === "--screenshot") {
      o.screenshot = argv[++i];
      if (!o.screenshot || o.screenshot.startsWith("--")) fail("--screenshot needs a file path.");
    } else if (a.startsWith("--screenshot=")) o.screenshot = a.slice(13);
    else fail(`Unknown option: ${a}`);
  }
  return o;
}

function loadScreenshot(path) {
  if (!existsSync(path)) fail(`No file at ${path}`);
  const stat = statSync(path);
  if (!stat.isFile()) fail(`${path} is not a file.`);
  const name = basename(path);
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (!IMAGE_MIME[ext]) fail(`Screenshot must be .png, .jpg or .jpeg — got ".${ext}".`);
  const bytes = readFileSync(path);
  if (bytes.length === 0) fail("The screenshot file is empty.");
  return {
    name,
    bytes,
    // MD5 of the WHOLE original file, lowercase hex. Not base64, not per-part.
    md5: crypto.createHash("md5").update(bytes).digest("hex"),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const doAvailability = !opts.screenshotOnly;
  const doScreenshot = !opts.availabilityOnly;

  if (doScreenshot && !opts.screenshot) {
    fail(
      "A screenshot file is required.\n\n" +
        "  node ./scripts/finish-iap-metadata.mjs --screenshot <path> --apply\n\n" +
        "Or run --availability-only to do just the territories.",
    );
  }
  const file = doScreenshot ? loadScreenshot(opts.screenshot) : null;

  const env = readEnv();
  const request = makeClient(
    makeToken({ issuerId: env.issuerId, keyId: env.keyId, privateKeyPem: readFileSync(env.p8Path, "utf8") }),
    { verbose: opts.verbose },
  );

  rule("=");
  log(opts.apply ? "APPLY — this WILL write to App Store Connect" : "DRY RUN — nothing is written");
  log(`  availability: ${doAvailability ? "yes" : "skipped"}   screenshot: ${doScreenshot ? "yes" : "skipped"}`);
  if (file) log(`  ${file.name}  ${file.bytes.length} bytes  md5 ${file.md5}`);
  rule("=");

  const live = await fetchProducts(request, env.appId);
  log(`App Store Connect has ${live.size} in-app purchase(s).`);

  let territories = [];
  if (doAvailability) {
    territories = await fetchAllTerritories(request);
    log(`Apple lists ${territories.length} territories; all will be enabled.`);
  }

  let targets = EXPECTED_PRODUCT_IDS;
  if (opts.only) {
    targets = targets.filter((p) => p === opts.only);
    if (!targets.length) fail(`No planned product with id "${opts.only}".`);
  }

  const summary = { availability: [], screenshot: [], failed: [] };
  let index = 0;

  for (const productId of targets) {
    index += 1;
    const label = `[${index}/${targets.length}] ${productId}`;
    const iap = live.get(productId);
    if (!iap) {
      log(`${label} — NOT AT APPLE, skipped`);
      continue;
    }
    if (!opts.apply) {
      log(
        `${label} — would set${doAvailability ? ` ${territories.length} territories` : ""}` +
          `${doAvailability && doScreenshot ? " and" : ""}${doScreenshot ? " the review screenshot" : ""}`,
      );
      continue;
    }

    if (doAvailability) {
      try {
        const r = await setAvailability(request, iap.id, territories);
        if (r.ok) {
          log(`${label} — availability ${r.count} territories ✓`);
          summary.availability.push(productId);
        } else {
          log(`${label} — availability FAILED: ${r.reason}`);
          summary.failed.push(`${productId}:availability`);
        }
      } catch (err) {
        log(`${label} — availability FAILED`);
        process.stderr.write(`${err instanceof ApiError ? formatApiError(err) : err.message}\n`);
        summary.failed.push(`${productId}:availability`);
      }
      await sleep(300);
    }

    if (doScreenshot) {
      try {
        const r = await uploadScreenshot(request, iap.id, file);
        if (r.ok) {
          log(`${label} — screenshot uploaded (${r.state}) ✓`);
          summary.screenshot.push(productId);
        } else {
          log(`${label} — screenshot FAILED: ${r.reason}`);
          summary.failed.push(`${productId}:screenshot`);
        }
      } catch (err) {
        log(`${label} — screenshot FAILED`);
        process.stderr.write(`${err instanceof ApiError ? formatApiError(err) : err.message}\n`);
        summary.failed.push(`${productId}:screenshot`);
      }
      await sleep(400);
    }
  }

  log("");
  rule("=");
  log("SUMMARY");
  rule("=");
  log(`  availability set: ${summary.availability.length}`);
  log(`  screenshots uploaded: ${summary.screenshot.length}`);
  log(`  failed: ${summary.failed.length}`);
  for (const f of summary.failed) log(`      ${f}`);
  if (!opts.apply) {
    log("");
    log("Nothing was written. Re-run with --apply.");
  } else if (!summary.failed.length) {
    log("");
    log("Now re-check the states:");
    log("  node ./scripts/create-iap-products.mjs --list");
    log("Products should have left MISSING_METADATA.");
  }
  return summary.failed.length ? 1 : 0;
}

main()
  .then((c) => {
    process.exitCode = c;
  })
  .catch((err) => {
    process.stderr.write(`\nUnexpected error:\n  ${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 2;
  });
