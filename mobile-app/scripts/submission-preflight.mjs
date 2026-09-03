#!/usr/bin/env node
// =============================================================================
// SUBMISSION PREFLIGHT — is this build actually submittable to App Review?
//
// WHY THIS EXISTS. docs/APP_REVIEW_NOTES.md carries a blocking checklist. A
// checklist a human reads on release day is a checklist that gets skipped, and
// the item most likely to be skipped is the one with no visible symptom: all 23
// iap_products rows ship `active = false`, and an inactive catalogue renders NO
// PURCHASE CARD AT ALL. The reviewer then sees precisely the screen that was
// rejected under 3.1.1, with the entire payment rail built and working behind
// it. Nothing in the app looks broken. Nothing warns anybody.
//
// So this script answers the checklist mechanically and refuses to be reassuring:
// every check is phrased so that NOT RUNNING it, or not being able to run it, is
// reported rather than silently passed.
//
// READ-ONLY. It runs SELECTs against the database and GETs against App Store
// Connect. It changes nothing, anywhere.
//
// USAGE
//   node ./scripts/submission-preflight.mjs
//
// ENVIRONMENT (each unlocks a group of checks; missing ones are reported SKIP,
// never PASS)
//   OLIMPIADA_PROD_DB_URL         production database, read-only queries
//   APP_STORE_CONNECT_ISSUER_ID   \
//   APP_STORE_CONNECT_KEY_ID       |  same values the product-creation script
//   APP_STORE_CONNECT_P8_PATH      |  uses; see README_IAP_PRODUCTS.md
//   APP_STORE_CONNECT_APP_ID      /
//
// EXIT CODES
//   0  no FAILs (warnings may still be present — read them)
//   1  at least one FAIL: do not submit
//   2  the script itself could not run
// =============================================================================
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import process from "node:process";

const API_BASE = "https://api.appstoreconnect.apple.com";
const BUNDLE_ID = "ai.olympiq.app";

/** Product ids the app expects to be sellable. Mirrors create-iap-products.mjs. */
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
const EXPECTED_PRODUCT_IDS = SUBJECT_SLUGS.flatMap((s) =>
  INTERVALS.map((i) => `${BUNDLE_ID}.sub.${s}.${i}`),
);

// States in which App Store Connect can still turn this product into a sale.
// Deliberately includes the review-pipeline states: App Review buys in the
// SANDBOX, and sandbox availability does not require the product to be
// approved — demanding APPROVED here would fail every legitimate submission.
const SELLABLE_STATES = new Set([
  "APPROVED",
  "PENDING_BINARY_APPROVAL",
  "IN_REVIEW",
  "WAITING_FOR_REVIEW",
  "READY_TO_SUBMIT",
]);

// -----------------------------------------------------------------------------
// Reporting
// -----------------------------------------------------------------------------
const results = [];
const PASS = "PASS";
const FAIL = "FAIL";
const WARN = "WARN";
const SKIP = "SKIP";

function record(status, name, detail) {
  results.push({ status, name, detail });
}

function out(line = "") {
  process.stdout.write(`${line}\n`);
}

// -----------------------------------------------------------------------------
// Database — read-only. The connection string is NEVER printed, only passed.
// -----------------------------------------------------------------------------
function dbQuery(sql) {
  const url = process.env.OLIMPIADA_PROD_DB_URL;
  if (!url) return null;
  try {
    return execFileSync("psql", [url, "-tAc", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    // Redact aggressively: psql echoes the connection string in some errors.
    const raw = String((error && error.stderr) || (error && error.message) || "");
    const safe = raw.split(url).join("<redacted>").split("\n")[0];
    throw new Error(`psql failed: ${safe}`);
  }
}

function checkDatabase() {
  if (!process.env.OLIMPIADA_PROD_DB_URL) {
    record(SKIP, "database checks", "OLIMPIADA_PROD_DB_URL is not set");
    return null;
  }

  let activeIds = [];
  try {
    // 1. THE BIG ONE. No active product => no purchase card => 3.1.1 again.
    const rows = dbQuery(
      "select product_id from iap_products where platform='ios' and active order by product_id;",
    );
    // SPLIT ON \r?\n AND TRIM. psql on Windows returns CRLF, so splitting on
    // "\n" leaves a trailing \r on every row but the last. These ids are then
    // compared against App Store Connect's productId, and "…month\r" matches
    // nothing — the check would report every active product as missing from
    // Apple while looking like a real finding. The same slip made the avatar
    // purge delete exactly one object per run.
    activeIds = rows
      ? rows.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      : [];
    if (activeIds.length === 0) {
      record(
        FAIL,
        "iap_products has an active product",
        "ZERO active iOS products. The app renders no purchase card at all — this is the rejected screen.",
      );
    } else if (activeIds.length < EXPECTED_PRODUCT_IDS.length) {
      record(
        WARN,
        "iap_products has an active product",
        `${activeIds.length} of ${EXPECTED_PRODUCT_IDS.length} subject products active. Intended, or forgotten?`,
      );
    } else {
      record(PASS, "iap_products has an active product", `${activeIds.length} active`);
    }

    // 2. The kill switch. Off => every price button shows a red failure and the
    //    reviewer never reaches the App Store sheet.
    const payments = dbQuery(
      "select coalesce((select enabled::text from feature_flags where key='payments'),'MISSING');",
    );
    if (payments === "true") {
      record(PASS, "payments flag is enabled", "feature_flags.payments = true");
    } else {
      record(
        FAIL,
        "payments flag is enabled",
        `feature_flags.payments = ${payments}. Every purchase fails closed with a red "not available right now".`,
      );
    }

    // 3. The free-access window. Not fatal, but it puts "all subjects are open"
    //    directly above a row of price buttons, which reads as content unlocked
    //    outside In-App Purchase.
    const giveaway = dbQuery(
      "select coalesce((select enabled::text from feature_flags where key='giveaway_period'),'MISSING');",
    );
    if (giveaway === "true") {
      const ends = dbQuery(
        "select coalesce((select to_char(((select (value_json #>> '{}')::timestamptz from system_settings where key='giveaway.started_at') + make_interval(days => (select (value_json #>> '{}')::int from system_settings where key='giveaway.duration_days'))),'YYYY-MM-DD')),'unknown');",
      );
      record(
        WARN,
        "free-access window is closed",
        `Window is OPEN (ends ${ends}). A reviewer sees "all subjects are open" above the price buttons. Either close it, or include the demo-account paragraph from APP_REVIEW_NOTES.md §4.`,
      );
    } else {
      record(PASS, "free-access window is closed", "giveaway_period = false");
    }

    // 4. Olympiad packages: only a compliance problem if one costs money while
    //    the app cannot sell it. Free content needs no in-app purchase.
    const pricedPackages = dbQuery(
      "select count(*) from olympiad_packages where status='active' and coalesce(price_amount,0) > 0;",
    );
    if (pricedPackages === "0") {
      record(
        PASS,
        "no unsellable priced content",
        "no active olympiad package has a price, so none needs an in-app purchase",
      );
    } else {
      record(
        FAIL,
        "no unsellable priced content",
        `${pricedPackages} active olympiad package(s) cost money but cannot be bought in the app. That is Guideline 3.1.1 on a second product line.`,
      );
    }

    // 5. The notification endpoint reads a table. Code without it 500s forever.
    const notifTable = dbQuery(
      "select coalesce(to_regclass('public.iap_notifications')::text,'MISSING');",
    );
    record(
      notifTable === "MISSING" ? FAIL : PASS,
      "notification-log migration applied",
      notifTable === "MISSING"
        ? "iap_notifications does not exist. Apply migration 166 BEFORE pushing the notification endpoints, or every Apple notification 500s and retries forever."
        : "iap_notifications exists",
    );
  } catch (error) {
    record(FAIL, "database checks", error.message);
  }
  return activeIds;
}

// -----------------------------------------------------------------------------
// App Store Connect — read-only.
//
// The JWT signer is duplicated from create-iap-products.mjs rather than shared.
// That script is proven against the live API and is what the owner runs on
// release day; refactoring it to export helpers risks the tool that matters
// most, to save forty lines in the tool that merely reports.
// -----------------------------------------------------------------------------
function b64u(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function ascToken(cfg) {
  const now = Math.floor(Date.now() / 1000);
  const signingInput = `${b64u(JSON.stringify({ alg: "ES256", kid: cfg.keyId, typ: "JWT" }))}.${b64u(
    JSON.stringify({ iss: cfg.issuerId, iat: now, exp: now + 300, aud: "appstoreconnect-v1" }),
  )}`;
  // ieee-p1363, not Node's default DER. DER produces a bare 401 that reads
  // exactly like a wrong key id.
  const sig = crypto.sign("sha256", Buffer.from(signingInput), {
    key: crypto.createPrivateKey(cfg.privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64u(sig)}`;
}

function ascConfig() {
  const issuerId = (process.env.APP_STORE_CONNECT_ISSUER_ID || "").trim();
  const keyId = (process.env.APP_STORE_CONNECT_KEY_ID || "").trim();
  const p8Path = (process.env.APP_STORE_CONNECT_P8_PATH || "").trim();
  const appId = (process.env.APP_STORE_CONNECT_APP_ID || "").trim();
  if (!issuerId || !keyId || !p8Path || !/^\d+$/.test(appId)) return null;
  if (!existsSync(p8Path)) return null;
  return { issuerId, keyId, appId, privateKeyPem: readFileSync(p8Path, "utf8") };
}

async function checkAppStoreConnect(activeIds) {
  const cfg = ascConfig();
  if (!cfg) {
    record(
      SKIP,
      "App Store Connect checks",
      "APP_STORE_CONNECT_* not set (or the .p8 path does not exist)",
    );
    return;
  }

  let token;
  try {
    token = ascToken(cfg);
  } catch (error) {
    record(FAIL, "App Store Connect checks", `key unusable: ${error.name}`);
    return;
  }

  const byProductId = new Map();
  let cursor =
    `/v1/apps/${cfg.appId}/inAppPurchasesV2` +
    `?fields%5BinAppPurchases%5D=productId,state,name&limit=200`;
  try {
    while (cursor) {
      const res = await fetch(`${API_BASE}${cursor}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      for (const row of body.data || []) {
        const a = row.attributes || {};
        if (a.productId) byProductId.set(a.productId, a.state || "UNKNOWN");
      }
      const next = body.links && body.links.next;
      cursor = next ? next.replace(API_BASE, "") : null;
    }
  } catch (error) {
    record(FAIL, "App Store Connect checks", `could not read products: ${error.message}`);
    return;
  }

  const missing = EXPECTED_PRODUCT_IDS.filter((id) => !byProductId.has(id));
  record(
    missing.length ? FAIL : PASS,
    "all 21 products exist in App Store Connect",
    missing.length
      ? `${missing.length} missing, first: ${missing[0]}`
      : `${EXPECTED_PRODUCT_IDS.length} found`,
  );

  // Only the products we actually intend to SELL have to be sellable. A product
  // that is off in our database cannot hurt a reviewer whatever Apple thinks.
  const toCheck = activeIds && activeIds.length ? activeIds : EXPECTED_PRODUCT_IDS;
  const unsellable = toCheck
    .filter((id) => byProductId.has(id))
    .filter((id) => !SELLABLE_STATES.has(byProductId.get(id)))
    .map((id) => `${id} (${byProductId.get(id)})`);

  if (unsellable.length) {
    record(
      activeIds && activeIds.length ? FAIL : WARN,
      "every product we sell can be sold",
      `${unsellable.length} in a state that cannot serve: ${unsellable[0]}` +
        `. MISSING_METADATA shows as "Prepare for Submission" in App Store Connect — add the price, name and description.`,
    );
  } else {
    record(PASS, "every product we sell can be sold", `${toCheck.length} checked`);
  }

  const notApproved = toCheck
    .filter((id) => byProductId.has(id))
    .filter((id) => byProductId.get(id) === "READY_TO_SUBMIT");
  if (notApproved.length) {
    record(
      WARN,
      "products are attached to a submission",
      `${notApproved.length} product(s) are READY_TO_SUBMIT — metadata is complete but they are NOT in a submission. In-app purchases are never swept in with the build; add them explicitly, or they will not be reviewed.`,
    );
  }
}

// -----------------------------------------------------------------------------
// Things no script on this machine can see. Reported rather than assumed.
// -----------------------------------------------------------------------------
function checkManual() {
  record(
    SKIP,
    "APPLE_IAP_SANDBOX_GRANTS is not \"off\" in production",
    "Set on the Vercel deployment, not here. App Review buys in SANDBOX — with grants off the reviewer pays and receives nothing. Confirm in the Vercel dashboard.",
  );
  record(
    SKIP,
    "age rating declares in-app purchases",
    "App Store Connect → Age Rating → \"Does your app contain in-app purchases?\" must now be YES.",
  );
  record(
    SKIP,
    "a sandbox purchase was rehearsed on the submitted binary",
    "Nothing here can prove this. Buy a subject with a sandbox Apple ID and confirm access actually opens.",
  );
}

// -----------------------------------------------------------------------------
async function main() {
  out("=".repeat(78));
  out("SUBMISSION PREFLIGHT — read-only; nothing is changed anywhere");
  out("=".repeat(78));
  out();

  const activeIds = checkDatabase();
  await checkAppStoreConnect(activeIds);
  checkManual();

  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    out(`  ${r.status.padEnd(5)} ${r.name.padEnd(width)}  ${r.detail}`);
  }
  out();

  const fails = results.filter((r) => r.status === FAIL);
  const warns = results.filter((r) => r.status === WARN);
  const skips = results.filter((r) => r.status === SKIP);

  out("-".repeat(78));
  if (fails.length) {
    out(`DO NOT SUBMIT — ${fails.length} blocking failure(s).`);
    for (const f of fails) out(`  - ${f.name}`);
  } else {
    out("No blocking failures.");
  }
  if (warns.length) out(`${warns.length} warning(s) — read them, they are not noise.`);
  if (skips.length) {
    out(`${skips.length} check(s) could not run here. A skipped check is NOT a pass:`);
    for (const s of skips) out(`  - ${s.name}`);
  }
  out("-".repeat(78));

  return fails.length ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`\npreflight could not run:\n  ${error && error.message}\n`);
    process.exitCode = 2;
  });
