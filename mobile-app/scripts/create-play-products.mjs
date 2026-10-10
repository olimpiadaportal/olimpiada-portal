#!/usr/bin/env node
// =============================================================================
// CREATE OLYMPIQ'S 21 GOOGLE PLAY ONE-TIME PRODUCTS
//
// WHY. Owner decision 2026-10-10: Android sells through Google Play Billing,
// with the SAME product ids as iOS (`ai.olympiq.app.sub.<slug>.<week|month|year>`)
// and prices that FOLLOW Admin → Subjects. This script does the one-time part —
// creating the products — and the admin panel keeps their prices in step from
// then on (admin-panel/src/lib/admin/googlePlay.ts).
//
// WHICH API. The current one-time products model, Android Publisher v3:
//   PATCH .../applications/{pkg}/onetimeproducts/{id}?allowMissing=true
//         &updateMask=listings,purchaseOptions&regionsVersion.version=2025/03
//     https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts/patch
//     (allowMissing=true is the documented way to CREATE through patch)
//   POST  .../applications/{pkg}/oneTimeProducts/{id}/purchaseOptions:batchUpdateStates
//     https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts.purchaseOptions/batchUpdateStates
//     (a new purchase option starts as DRAFT; this ACTIVATES it)
//   POST  .../applications/{pkg}/pricing:convertRegionPrices
//     https://developers.google.com/android-publisher/api-ref/rest/v3/monetization/convertRegionPrices
//   GET   .../applications/{pkg}/oneTimeProducts        (what already exists)
//
// CONSUMABLE. Google's one-time products carry no "consumable" flag — a
// product becomes re-buyable when the SERVER consumes the purchase after
// granting it (the web-app purchase rail does that). Each product here gets one
// BUY purchase option, `legacyCompatible: true` (so every Play Billing Library
// version can buy it) and `multiQuantityEnabled: false` (one child, one grant).
//
// PRICE. From the admin AZN price (subjects_pricing) of the same (subject,
// interval): Azerbaijan (AZ) gets the exact AZN amount when Google prices AZ in
// AZN, otherwise AZN ÷ rate in USD (system setting store.fx.azn_per_usd,
// default 1.70). Every other region gets Google's own conversion of the USD
// equivalent; regions Google adds later follow newRegionsConfig.
//
// SAFE BY DEFAULT.
//   * DRY RUN unless --apply. Nothing is written without it.
//   * An EXISTING product is never touched — its price is the panel's job.
//   * --only <productId> creates one product.
//   * Database access is READ-ONLY (psql, same convention as
//     submission-preflight.mjs); the connection string is never printed.
//
// USAGE (from mobile-app/)
//   node ./scripts/create-play-products.mjs --self-test     no network, no keys
//   node ./scripts/create-play-products.mjs                 dry run
//   node ./scripts/create-play-products.mjs --apply --only ai.olympiq.app.sub.math.week
//   node ./scripts/create-play-products.mjs --apply
//
// ENV
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   key file contents (raw JSON or base64), or
//   GOOGLE_PLAY_SERVICE_ACCOUNT_FILE   path to the key file
//   GOOGLE_PLAY_PACKAGE_NAME           default ai.olympiq.app
//   OLIMPIADA_PROD_DB_URL              read-only: product ids + AZN prices + rate
// =============================================================================
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import process from "node:process";

const PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const REGIONS_VERSION = "2025/03";
const AZ = "AZ";
const PURCHASE_OPTION_ID = "buy";
const DEFAULT_RATE = 1.7;
const PRODUCT_ID_RE = /^ai\.olympiq\.app\.sub\.([a-z0-9]+)\.(week|month|year)$/;
const LIMITS = { title: 55, description: 200 };

// Mirrors create-iap-products.mjs. THE SLUG IS NOT subjects.code: `logic` is
// the subject whose code is `az_language` (named Məntiq), and `azerbaijani` is
// `azerbaycan_dili`. The product id → subject mapping itself is read from
// iap_products; this table only supplies store-listing names.
const SUBJECTS = {
  math: { az: "Riyaziyyat", en: "Mathematics", ru: "Математика" },
  logic: { az: "Məntiq", en: "Logic", ru: "Логика" },
  english: { az: "İngilis dili", en: "English", ru: "Английский язык" },
  informatics: { az: "İnformatika", en: "Informatics", ru: "Информатика" },
  science: { az: "Elm", en: "Science", ru: "Естественные науки" },
  physics: { az: "Fizika", en: "Physics", ru: "Физика" },
  azerbaijani: { az: "Azərbaycan dili", en: "Azerbaijani", ru: "Азербайджанский язык" },
};

// Store-listing tone, access language, NO price and NO currency in the text.
const PERIOD = {
  week: { az: "1 həftəlik giriş", en: "1 week access", ru: "доступ на 1 неделю", azD: "1 həftəlik", enD: "One week", ruD: "1 неделю" },
  month: { az: "1 aylıq giriş", en: "1 month access", ru: "доступ на 1 месяц", azD: "1 aylıq", enD: "One month", ruD: "1 месяц" },
  year: { az: "1 illik giriş", en: "1 year access", ru: "доступ на 1 год", azD: "1 illik", enD: "One year", ruD: "1 год" },
};

function listingsFor(slug, interval) {
  const s = SUBJECTS[slug];
  const p = PERIOD[interval];
  return [
    {
      languageCode: "az-AZ",
      title: `${s.az} — ${p.az}`,
      description: `${s.az} fənninə ${p.azD} giriş, bir uşaq üçün. Avtomatik yenilənmir.`,
    },
    {
      languageCode: "en-US",
      title: `${s.en} — ${p.en}`,
      description: `${p.enD} of ${s.en} for one child. Does not renew automatically.`,
    },
    {
      languageCode: "ru-RU",
      title: `${s.ru} — ${p.ru}`,
      description: `Доступ к предмету «${s.ru}» на ${p.ruD} для одного ребёнка. Не продлевается автоматически.`,
    },
  ];
}

// -----------------------------------------------------------------------------
function log(msg = "") {
  process.stdout.write(`${msg}\n`);
}
function fail(msg) {
  process.stderr.write(`\nERROR\n${msg}\n`);
  process.exit(2);
}

/** 2-decimal amount → Google Money (units int64 string, nanos int32). */
function toMoney(amount, currencyCode) {
  const cents = Math.round(amount * 100);
  const units = Math.floor(cents / 100);
  return { currencyCode, units: String(units), nanos: (cents - units * 100) * 10_000_000 };
}
function moneyText(m) {
  return `${m.currencyCode} ${(Number(m.units) + m.nanos / 1e9).toFixed(2)}`;
}

/** AZ amount in AZ's currency, or null for a currency we hold no rate for. */
function azTarget(amountAzn, currency, rate) {
  if (currency === "AZN") return Math.round(amountAzn * 100) / 100;
  if (currency === "USD") return Math.round((amountAzn / rate) * 100) / 100;
  return null;
}

function buildProduct({ packageName, productId, amountAzn, rate, conversion, azCurrency }) {
  const m = PRODUCT_ID_RE.exec(productId);
  if (!m) throw new Error(`bad product id ${productId}`);
  const [, slug, interval] = m;
  if (!SUBJECTS[slug]) throw new Error(`no listing names for slug "${slug}"`);
  const target = azTarget(amountAzn, azCurrency, rate);
  if (target === null) throw new Error(`AZ is priced in ${azCurrency}; no rate for it`);
  const configs = [];
  for (const [code, price] of conversion.regions) {
    if (code === AZ) continue;
    configs.push({ regionCode: code, price, availability: "AVAILABLE" });
  }
  configs.push({ regionCode: AZ, price: toMoney(target, azCurrency), availability: "AVAILABLE" });
  const option = {
    purchaseOptionId: PURCHASE_OPTION_ID,
    buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
    regionalPricingAndAvailabilityConfigs: configs,
  };
  if (conversion.usdPrice && conversion.eurPrice) {
    option.newRegionsConfig = {
      usdPrice: conversion.usdPrice,
      eurPrice: conversion.eurPrice,
      availability: "AVAILABLE",
    };
  }
  return {
    packageName,
    productId,
    listings: listingsFor(slug, interval),
    purchaseOptions: [option],
  };
}

// -----------------------------------------------------------------------------
// Self-test: the copy and the money maths, with no network and no keys.
// -----------------------------------------------------------------------------
function selfTest() {
  const problems = [];
  for (const slug of Object.keys(SUBJECTS)) {
    for (const interval of Object.keys(PERIOD)) {
      for (const l of listingsFor(slug, interval)) {
        if (l.title.length > LIMITS.title) problems.push(`${slug}.${interval} ${l.languageCode} title ${l.title.length} > ${LIMITS.title}`);
        if (l.description.length > LIMITS.description) problems.push(`${slug}.${interval} ${l.languageCode} description too long`);
        if (/AZN|₼|manat|\$|USD|\d+[.,]\d\d/i.test(`${l.title} ${l.description}`)) problems.push(`${slug}.${interval} ${l.languageCode} mentions a price`);
      }
    }
  }
  const m = toMoney(41.18, "USD");
  if (m.units !== "41" || m.nanos !== 180000000) problems.push(`toMoney(41.18) = ${JSON.stringify(m)}`);
  if (azTarget(2, "AZN", 1.7) !== 2) problems.push("azTarget AZN");
  if (azTarget(70, "USD", 1.7) !== 41.18) problems.push("azTarget USD");
  if (azTarget(2, "EUR", 1.7) !== null) problems.push("azTarget EUR must refuse");
  const p = buildProduct({
    packageName: "ai.olympiq.app",
    productId: "ai.olympiq.app.sub.math.week",
    amountAzn: 2,
    rate: 1.7,
    azCurrency: "AZN",
    conversion: { regions: new Map([["US", toMoney(1.18, "USD")], ["AZ", toMoney(9, "AZN")]]), usdPrice: toMoney(1.18, "USD"), eurPrice: toMoney(1.09, "EUR") },
  });
  const az = p.purchaseOptions[0].regionalPricingAndAvailabilityConfigs.find((c) => c.regionCode === "AZ");
  if (!az || az.price.units !== "2" || az.price.currencyCode !== "AZN") problems.push("AZ must carry the exact admin price");
  if (!p.purchaseOptions[0].buyOption.legacyCompatible) problems.push("buy option must be legacyCompatible");
  if (problems.length) {
    for (const x of problems) log(`  FAIL ${x}`);
    return 1;
  }
  log("self-test OK: 63 listings within limits and price-free; money maths correct.");
  return 0;
}

// -----------------------------------------------------------------------------
// Database (read-only)
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
    const raw = String((error && error.stderr) || (error && error.message) || "");
    const safe = raw.split(url).join("<redacted>").split("\n")[0];
    throw new Error(`psql failed: ${safe}`);
  }
}

function loadPlan() {
  const rows = dbQuery(
    "select p.product_id || '|' || coalesce(sp.price_amount::text, '') " +
      "from iap_products p left join subjects_pricing sp " +
      "on sp.subject_id = p.subject_id and sp.\"interval\"::text = p.\"interval\"::text " +
      "where p.platform = 'ios' and p.scope = 'subject' order by p.product_id;",
  );
  if (rows === null) fail("OLIMPIADA_PROD_DB_URL is not set — the product ids and AZN prices come from the database.");
  const rateRaw = dbQuery("select value_json::text from system_settings where key = 'store.fx.azn_per_usd';");
  let rate = Number(String(rateRaw || "").replace(/"/g, ""));
  if (!Number.isFinite(rate) || rate < 0.5 || rate > 5) rate = DEFAULT_RATE;
  const plan = rows
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [productId, amount] = l.split("|");
      return { productId, amountAzn: amount ? Number(amount) : null };
    });
  return { plan, rate };
}

// -----------------------------------------------------------------------------
// Google auth + calls
// -----------------------------------------------------------------------------
function readServiceAccount() {
  let raw = (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || "").trim();
  const file = (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE || "").trim();
  if (!raw && file) {
    if (!existsSync(file)) fail("GOOGLE_PLAY_SERVICE_ACCOUNT_FILE does not point at a file.");
    raw = readFileSync(file, "utf8").trim();
  }
  if (!raw) return null;
  try {
    const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    const key = String(json.private_key || "");
    return {
      clientEmail: String(json.client_email || ""),
      privateKey: key.includes("\\n") ? key.split("\\n").join("\n") : key,
    };
  } catch {
    fail("The service account key is not valid JSON (raw or base64).");
  }
  return null;
}

const b64u = (x) => Buffer.from(x).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64u(
    JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  )}`;
  const assertion = `${input}.${b64u(crypto.sign("sha256", Buffer.from(input), crypto.createPrivateKey(sa.privateKey)))}`;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  if (!res.ok) fail(`Google refused the service account (HTTP ${res.status}). Check the key and that it is not revoked.`);
  return (await res.json()).access_token;
}

function client(token) {
  return async (method, url, body) => {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = "";
      try {
        detail = JSON.parse(text).error?.message || "";
      } catch {
        detail = text.slice(0, 300);
      }
      const hint =
        res.status === 403
          ? " — give the service account access to this app in Play Console (Users and permissions)."
          : "";
      const err = new Error(`HTTP ${res.status} ${detail}${hint}`);
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  };
}

async function convert(request, pkg, usdAmount) {
  const body = await request("POST", `${PLAY_API}/applications/${pkg}/pricing:convertRegionPrices`, {
    price: toMoney(usdAmount, "USD"),
  });
  const regions = new Map();
  for (const [code, e] of Object.entries(body.convertedRegionPrices || {})) {
    if (e && e.price && e.price.currencyCode) regions.set(e.regionCode || code, e.price);
  }
  return {
    regions,
    usdPrice: body.convertedOtherRegionsPrice?.usdPrice || null,
    eurPrice: body.convertedOtherRegionsPrice?.eurPrice || null,
  };
}

// -----------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const opts = { apply: false, only: null, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--self-test") opts.selfTest = true;
    else if (a === "--only") {
      opts.only = argv[i + 1];
      i += 1;
    } else if (a.startsWith("--only=")) opts.only = a.slice(7);
    else fail(`Unknown option: ${a}`);
  }
  if (opts.selfTest) return selfTest();
  if (selfTest() !== 0) fail("Self-test failed; nothing was contacted.");

  const pkg = (process.env.GOOGLE_PLAY_PACKAGE_NAME || "").trim() || "ai.olympiq.app";
  const { plan: fullPlan, rate } = loadPlan();
  let plan = fullPlan;
  if (opts.only) plan = plan.filter((p) => p.productId === opts.only);
  if (plan.length === 0) fail(opts.only ? `No iOS product "${opts.only}" in iap_products.` : "iap_products has no iOS subject products.");
  for (const p of plan) {
    if (!PRODUCT_ID_RE.test(p.productId)) fail(`Unexpected product id shape: ${p.productId}`);
  }

  log("=".repeat(78));
  log(opts.apply ? "APPLY — products WILL be created and activated" : "DRY RUN — nothing is written");
  log(`package ${pkg} · ${plan.length} product(s) · rate 1 USD = ${rate} AZN · regions ${REGIONS_VERSION}`);
  log("=".repeat(78));

  const sa = readServiceAccount();
  if (!sa) {
    if (opts.apply) fail("No service account (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON / _FILE).");
    log("No service account configured — offline plan only (AZ currency unknown).");
    for (const p of plan) {
      log(`  ${p.productId}  AZN ${p.amountAzn ?? "— (no admin price: would be SKIPPED)"}`);
    }
    return 0;
  }

  const request = client(await accessToken(sa));
  const existing = new Set();
  let pageToken = "";
  do {
    const body = await request(
      "GET",
      `${PLAY_API}/applications/${pkg}/oneTimeProducts?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    for (const p of body?.oneTimeProducts || []) existing.add(p.productId);
    pageToken = body?.nextPageToken || "";
  } while (pageToken);
  log(`Google Play already has ${existing.size} one-time product(s).`);

  // AZ's currency, from Google's own conversion (any amount will do).
  const probe = await convert(request, pkg, 1);
  const azCurrency = probe.regions.get(AZ)?.currencyCode || "";
  log(`Azerbaijan (AZ) is priced in: ${azCurrency || "UNKNOWN"}`);
  if (azCurrency !== "AZN" && azCurrency !== "USD") fail(`AZ currency "${azCurrency}" has no rate here; nothing was written.`);

  const conversions = new Map();
  const summary = { created: [], skipped: [], failed: [] };
  for (const p of plan) {
    const label = p.productId;
    if (existing.has(p.productId)) {
      log(`  ${label} — exists, left alone (its price follows the admin panel)`);
      summary.skipped.push(label);
      continue;
    }
    if (!(p.amountAzn > 0)) {
      log(`  ${label} — no admin AZN price, SKIPPED`);
      summary.skipped.push(label);
      continue;
    }
    const usd = Math.round((p.amountAzn / rate) * 100) / 100;
    if (!conversions.has(usd)) conversions.set(usd, await convert(request, pkg, usd));
    const product = buildProduct({
      packageName: pkg,
      productId: p.productId,
      amountAzn: p.amountAzn,
      rate,
      azCurrency,
      conversion: conversions.get(usd),
    });
    const az = product.purchaseOptions[0].regionalPricingAndAvailabilityConfigs.find((c) => c.regionCode === AZ);
    const regions = product.purchaseOptions[0].regionalPricingAndAvailabilityConfigs.length;
    if (!opts.apply) {
      log(`  ${label} — would create: AZ ${moneyText(az.price)} (admin AZN ${p.amountAzn}), ${regions} regions, "${product.listings[1].title}"`);
      continue;
    }
    try {
      await request(
        "PATCH",
        `${PLAY_API}/applications/${pkg}/onetimeproducts/${encodeURIComponent(p.productId)}` +
          `?allowMissing=true&updateMask=listings,purchaseOptions&regionsVersion.version=${encodeURIComponent(REGIONS_VERSION)}`,
        product,
      );
      await request(
        "POST",
        `${PLAY_API}/applications/${pkg}/oneTimeProducts/${encodeURIComponent(p.productId)}/purchaseOptions:batchUpdateStates`,
        {
          requests: [
            {
              activatePurchaseOptionRequest: {
                packageName: pkg,
                productId: p.productId,
                purchaseOptionId: PURCHASE_OPTION_ID,
              },
            },
          ],
        },
      );
      log(`  ${label} — created and activated, AZ ${moneyText(az.price)}`);
      summary.created.push(label);
    } catch (err) {
      log(`  ${label} — FAILED: ${err.message}`);
      summary.failed.push(label);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  log("");
  log(`created ${summary.created.length} · skipped ${summary.skipped.length} · failed ${summary.failed.length}`);
  if (!opts.apply) log("Nothing was written. Re-run with --apply.");
  return summary.failed.length ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`\nUnexpected error: ${err && err.message ? err.message : err}\n`);
    process.exitCode = 2;
  });
