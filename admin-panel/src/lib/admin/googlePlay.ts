import "server-only";

// ---------------------------------------------------------------------------
// GOOGLE PLAY — one-time product PRICES, read and write.
//
// WHY THIS EXISTS (owner decision, 2026-10-10). Android now sells through
// Google Play Billing, and "whatever price is set in Admin → Subjects, the
// mobile apps must display that". This module is the Play half of that rule;
// lib/admin/appStoreConnect.ts is the Apple half and lib/admin/storePriceSync.ts
// joins them to the AZN save.
//
// WHICH API, AND WHY. Google split in-app products into the "one-time
// products" model (Play Billing Library 8 era). The current reference is
// `monetization.onetimeproducts` on Android Publisher v3:
//   GET   /applications/{pkg}/oneTimeProducts/{productId}
//         https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts/get
//   GET   /applications/{pkg}/oneTimeProducts            (list, pageSize ≤ 1000)
//         https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts/list
//   PATCH /applications/{pkg}/onetimeproducts/{productId}?updateMask=…&regionsVersion.version=…
//         https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts/patch
//         (yes, lowercase here and camelCase above — copied from the reference)
//   POST  /applications/{pkg}/pricing:convertRegionPrices
//         https://developers.google.com/android-publisher/api-ref/rest/v3/monetization/convertRegionPrices
// The legacy `inappproducts` resource (with autoConvertMissingPrices) is NOT
// used: our 21 products are created through the new model by
// mobile-app/scripts/create-play-products.mjs, and mixing the two APIs on one
// product is how a price ends up set in one view and not the other.
//
// THE NEW MODEL HAS NO "AUTO-CONVERT" FLAG. A price lives per region inside a
// purchase option (`regionalPricingAndAvailabilityConfigs`), plus
// `newRegionsConfig` (USD/EUR) for regions Google adds later. "Let Google
// convert the other regions" is therefore done explicitly: we ask
// convertRegionPrices for Google's own conversion of the target and write
// those figures to every region the product already lists, leaving each
// region's AVAILABILITY untouched. Azerbaijan (AZ) gets the exact target.
//
// AZ'S CURRENCY IS READ, NOT ASSUMED. Google publishes the buyer currency per
// country in a support table, not in the API — so it is taken from the
// product's own AZ entry, or, for a product without one, from
// convertRegionPrices' AZ entry. AZN → the admin amount exactly; USD → AZN ÷
// rate; anything else is refused (`currencyUnsupported`).
//
// AUTH. A Google Cloud service account (JSON key) with access to this app in
// Play Console. OAuth 2.0 JWT-bearer grant, RS256 signed with node:crypto — no
// SDK dependency for one token request. The token endpoint is PINNED rather
// than read from the key file's `token_uri`: a key file is configuration, and
// configuration must not decide where a signed assertion is sent.
//
// FAIL CLOSED, NAMED. Every failure is a problem code the panel translates;
// nothing throws into a request, nothing logs a key, a token or Google's body.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import {
  aznToUsd,
  fromGoogleMoney,
  googleAzTarget,
  sameCents,
  toGoogleMoney,
  type GoogleMoney,
} from "@/lib/admin/store-pricing-shared";

const PLAY_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_PACKAGE = "ai.olympiq.app";
const PLAY_TIMEOUT_MS = 10_000;

/**
 * The regions version every price write is made against. Required by the
 * patch endpoint; Google publishes the current value in its "supported
 * locations" article, and an older version keeps working when a newer one
 * ships (RegionsVersion reference). Bump it deliberately, not reflexively.
 */
export const PLAY_REGIONS_VERSION = "2025/03";
export const PLAY_REGION = "AZ";

export type PlayPriceProblem =
  | "notConfigured"
  | "keyRejected"
  | "needsPlayPermission"
  | "notCreated"
  | "unreachable"
  | "rateLimited"
  | "rejected"
  | "currencyUnsupported"
  | "noPurchaseOption"
  | "verifyFailed";

type PlayConfig = { clientEmail: string; privateKey: string; packageName: string };

/**
 * GOOGLE_PLAY_SERVICE_ACCOUNT_JSON may hold the key file verbatim or
 * base64-encoded (Vercel's UI mangles multi-line values less when base64'd).
 * A half-usable value is the same as none.
 */
function readPlayConfig(): PlayConfig | null {
  const raw = (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (!raw) return null;
  let parsed: { client_email?: unknown; private_key?: unknown };
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    console.error("[admin] google play service account json unreadable");
    return null;
  }
  const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
  const keyRaw = typeof parsed.private_key === "string" ? parsed.private_key : "";
  const privateKey = keyRaw.includes("\\n") ? keyRaw.split("\\n").join("\n") : keyRaw;
  const packageName = (process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "").trim() || DEFAULT_PACKAGE;
  if (!clientEmail || !privateKey.includes("PRIVATE KEY")) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(packageName)) return null;
  return { clientEmail, privateKey, packageName };
}

export function isGooglePlayConfigured(): boolean {
  return readPlayConfig() !== null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The signed JWT-bearer assertion. Exported for the shape test only. */
export function buildServiceAccountAssertion(
  clientEmail: string,
  privateKeyPem: string,
  nowSeconds: number,
): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = { iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), crypto.createPrivateKey(privateKeyPem));
  return `${signingInput}.${b64url(signature)}`;
}

let tokenCache: { email: string; token: string; expiresAt: number } | null = null;

async function accessToken(
  config: PlayConfig,
): Promise<{ ok: true; token: string } | { ok: false; problem: PlayPriceProblem }> {
  const now = Date.now();
  if (tokenCache && tokenCache.email === config.clientEmail && tokenCache.expiresAt - 60_000 > now) {
    return { ok: true, token: tokenCache.token };
  }
  let assertion: string;
  try {
    assertion = buildServiceAccountAssertion(config.clientEmail, config.privateKey, Math.floor(now / 1000));
  } catch (error) {
    console.error("[admin] google play key unusable", error instanceof Error ? error.name : "unknown");
    return { ok: false, problem: "notConfigured" };
  }
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(PLAY_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, problem: "unreachable" };
  }
  if (!response.ok) {
    console.error("[admin] google oauth", response.status);
    // 400 invalid_grant / 401 = the key was revoked, rotated or is for another project.
    return { ok: false, problem: response.status >= 500 ? "unreachable" : "keyRejected" };
  }
  try {
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== "string" || !body.access_token) {
      return { ok: false, problem: "keyRejected" };
    }
    const ttl = typeof body.expires_in === "number" ? body.expires_in : 3600;
    tokenCache = { email: config.clientEmail, token: body.access_token, expiresAt: now + ttl * 1000 };
    return { ok: true, token: body.access_token };
  } catch {
    return { ok: false, problem: "unreachable" };
  }
}

/**
 * Google HTTP status → the problem the panel names. 403 means the service
 * account authenticated but has no access to THIS app (or lacks the
 * permission) in Play Console — a Users-and-permissions fix, not an outage.
 */
export function mapPlayStatus(status: number): PlayPriceProblem {
  if (status === 401) return "keyRejected";
  if (status === 403) return "needsPlayPermission";
  if (status === 404) return "notCreated";
  if (status === 429) return "rateLimited";
  if (status === 400 || status === 409 || status === 412 || status === 422) return "rejected";
  return "unreachable";
}

type PlayCall = { ok: true; json: unknown } | { ok: false; problem: PlayPriceProblem };

async function playCall(
  method: "GET" | "POST" | "PATCH",
  url: string,
  token: string,
  body?: unknown,
): Promise<PlayCall> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(PLAY_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, problem: "unreachable" };
  }
  if (!response.ok) {
    console.error("[admin] google play", method, response.status);
    return { ok: false, problem: mapPlayStatus(response.status) };
  }
  try {
    const text = await response.text();
    return { ok: true, json: text ? JSON.parse(text) : null };
  } catch {
    return { ok: false, problem: "unreachable" };
  }
}

// ---- resource shapes (only what we read; everything else round-trips) -----

export type PlayRegionalConfig = {
  regionCode?: string;
  price?: Partial<GoogleMoney>;
  availability?: string;
  [k: string]: unknown;
};

export type PlayPurchaseOption = {
  purchaseOptionId?: string;
  state?: string;
  regionalPricingAndAvailabilityConfigs?: PlayRegionalConfig[];
  newRegionsConfig?: { usdPrice?: GoogleMoney; eurPrice?: GoogleMoney; availability?: string };
  buyOption?: { legacyCompatible?: boolean; multiQuantityEnabled?: boolean };
  rentOption?: unknown;
  [k: string]: unknown;
};

export type PlayOneTimeProduct = {
  packageName?: string;
  productId?: string;
  purchaseOptions?: PlayPurchaseOption[];
  [k: string]: unknown;
};

export type PlayConversion = {
  regions: Map<string, GoogleMoney>;
  usdPrice: GoogleMoney | null;
  eurPrice: GoogleMoney | null;
};

/** The AZ price on the product's buy option, or null. */
export function azPriceOf(product: PlayOneTimeProduct): { amount: number; currency: string } | null {
  for (const option of product.purchaseOptions ?? []) {
    if (!option.buyOption) continue;
    const az = (option.regionalPricingAndAvailabilityConfigs ?? []).find((c) => c.regionCode === PLAY_REGION);
    if (az?.price?.currencyCode) {
      return { amount: fromGoogleMoney(az.price), currency: String(az.price.currencyCode) };
    }
  }
  return null;
}

/**
 * The purchase options to PATCH back: AZ set to `azPrice` exactly, every other
 * region the option already lists repriced from Google's own conversion, each
 * region's availability untouched, newRegionsConfig repriced if present. Pure.
 *
 * Output-only `state` is dropped (activation is a separate call). Rent options
 * are passed through untouched — this catalogue only sells buy options.
 */
export function repricePurchaseOptions(
  options: readonly PlayPurchaseOption[],
  azPrice: GoogleMoney,
  conversion: PlayConversion,
): PlayPurchaseOption[] {
  return options.map((option) => {
    const { state: _state, ...rest } = option;
    void _state;
    if (!option.buyOption) return rest;
    const configs = (option.regionalPricingAndAvailabilityConfigs ?? []).map((c) => {
      if (c.regionCode === PLAY_REGION) return { ...c, price: azPrice };
      const converted = c.regionCode ? conversion.regions.get(c.regionCode) : undefined;
      return converted ? { ...c, price: converted } : c;
    });
    if (!configs.some((c) => c.regionCode === PLAY_REGION)) {
      configs.push({ regionCode: PLAY_REGION, price: azPrice, availability: "AVAILABLE" });
    }
    const out: PlayPurchaseOption = { ...rest, regionalPricingAndAvailabilityConfigs: configs };
    if (option.newRegionsConfig) {
      out.newRegionsConfig = {
        ...option.newRegionsConfig,
        ...(conversion.usdPrice ? { usdPrice: conversion.usdPrice } : {}),
        ...(conversion.eurPrice ? { eurPrice: conversion.eurPrice } : {}),
      };
    }
    return out;
  });
}

async function convertRegionPrices(
  config: PlayConfig,
  token: string,
  price: GoogleMoney,
): Promise<{ ok: true; conversion: PlayConversion } | { ok: false; problem: PlayPriceProblem }> {
  const res = await playCall(
    "POST",
    `${PLAY_API}/applications/${encodeURIComponent(config.packageName)}/pricing:convertRegionPrices`,
    token,
    { price },
  );
  if (!res.ok) return res;
  const body = (res.json ?? {}) as {
    convertedRegionPrices?: Record<string, { regionCode?: string; price?: GoogleMoney }>;
    convertedOtherRegionsPrice?: { usdPrice?: GoogleMoney; eurPrice?: GoogleMoney };
  };
  const regions = new Map<string, GoogleMoney>();
  for (const [code, entry] of Object.entries(body.convertedRegionPrices ?? {})) {
    if (entry?.price?.currencyCode) regions.set(entry.regionCode ?? code, entry.price);
  }
  return {
    ok: true,
    conversion: {
      regions,
      usdPrice: body.convertedOtherRegionsPrice?.usdPrice ?? null,
      eurPrice: body.convertedOtherRegionsPrice?.eurPrice ?? null,
    },
  };
}

export type PlaySyncResult =
  | {
      readonly ok: true;
      readonly productId: string;
      readonly changed: boolean;
      readonly from: number | null;
      readonly to: number;
      readonly currency: string;
    }
  | {
      readonly ok: false;
      readonly productId: string;
      readonly problem: PlayPriceProblem;
      readonly from?: number | null;
      readonly to?: number;
      readonly currency?: string;
      /** true = the write itself was sent (and failed or did not verify). */
      readonly attempted?: boolean;
    };

/**
 * Set ONE product's AZ price from the admin AZN amount and reprice the other
 * regions from Google's conversion. Reads first; already-right ⇒ no write.
 * The PATCH response is checked before success is reported.
 */
export async function syncGooglePlayPrice(
  productId: string,
  amountAzn: number,
  aznPerUsd: number,
): Promise<PlaySyncResult> {
  const config = readPlayConfig();
  if (!config) return { ok: false, productId, problem: "notConfigured" };
  const auth = await accessToken(config);
  if (!auth.ok) return { ok: false, productId, problem: auth.problem };
  const pkg = encodeURIComponent(config.packageName);

  const got = await playCall(
    "GET",
    `${PLAY_API}/applications/${pkg}/oneTimeProducts/${encodeURIComponent(productId)}`,
    auth.token,
  );
  if (!got.ok) return { ok: false, productId, problem: got.problem };
  const product = (got.json ?? {}) as PlayOneTimeProduct;
  const options = product.purchaseOptions ?? [];
  if (!options.some((o) => o.buyOption)) return { ok: false, productId, problem: "noPurchaseOption" };

  // Google's conversion of the USD equivalent: used for every OTHER region,
  // and — for a product with no AZ entry yet — to learn AZ's currency.
  const usdBase = toGoogleMoney(aznToUsd(amountAzn, aznPerUsd), "USD");
  const conv = await convertRegionPrices(config, auth.token, usdBase);
  if (!conv.ok) return { ok: false, productId, problem: conv.problem };

  const current = azPriceOf(product);
  const currency = current?.currency ?? conv.conversion.regions.get(PLAY_REGION)?.currencyCode ?? "";
  const target = googleAzTarget(amountAzn, currency, aznPerUsd);
  if (target === null) return { ok: false, productId, problem: "currencyUnsupported", currency };
  const from = current ? current.amount : null;

  if (from !== null && sameCents(from, target)) {
    return { ok: true, productId, changed: false, from, to: target, currency };
  }

  const azMoney = toGoogleMoney(target, currency);
  const body: PlayOneTimeProduct = {
    packageName: config.packageName,
    productId,
    purchaseOptions: repricePurchaseOptions(options, azMoney, conv.conversion),
  };
  const patched = await playCall(
    "PATCH",
    `${PLAY_API}/applications/${pkg}/onetimeproducts/${encodeURIComponent(productId)}` +
      `?updateMask=purchaseOptions&regionsVersion.version=${encodeURIComponent(PLAY_REGIONS_VERSION)}`,
    auth.token,
    body,
  );
  if (!patched.ok) {
    return { ok: false, productId, problem: patched.problem, from, to: target, currency, attempted: true };
  }

  const after = azPriceOf((patched.json ?? {}) as PlayOneTimeProduct);
  if (!after || after.currency !== currency || !sameCents(after.amount, target)) {
    return { ok: false, productId, problem: "verifyFailed", from, to: target, currency, attempted: true };
  }
  return { ok: true, productId, changed: true, from, to: after.amount, currency };
}

export type PlayLivePrices =
  | {
      readonly ok: true;
      /** productId → AZ price; absent = Google has no such product. */
      readonly prices: Map<string, { amount: number; currency: string } | null>;
    }
  | { readonly ok: false; readonly problem: PlayPriceProblem };

/** Every one-time product's AZ price, from the list endpoint. READ-ONLY. */
export async function readGooglePlayPrices(): Promise<PlayLivePrices> {
  const config = readPlayConfig();
  if (!config) return { ok: false, problem: "notConfigured" };
  const auth = await accessToken(config);
  if (!auth.ok) return { ok: false, problem: auth.problem };
  const prices = new Map<string, { amount: number; currency: string } | null>();
  let pageToken = "";
  for (let page = 0; page < 10; page += 1) {
    const res = await playCall(
      "GET",
      `${PLAY_API}/applications/${encodeURIComponent(config.packageName)}/oneTimeProducts?pageSize=1000` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""),
      auth.token,
    );
    if (!res.ok) return { ok: false, problem: res.problem };
    const body = (res.json ?? {}) as { oneTimeProducts?: PlayOneTimeProduct[]; nextPageToken?: string };
    for (const p of body.oneTimeProducts ?? []) {
      if (p.productId) prices.set(p.productId, azPriceOf(p));
    }
    pageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : "";
    if (!pageToken) break;
  }
  return { ok: true, prices };
}

// ===========================================================================
// ACTIVATION PREFLIGHT AND MIRROR (the Play twin of preflightStoreProduct /
// fetchStoreCatalogue in appStoreConnect.ts)
//
// An android row in iap_products switched on is a buy button in the Android
// app. If Google has no such product, or its buy option is not ACTIVE, Play
// Billing returns nothing for it and every tap fails. Activation therefore asks
// Google first and refuses on anything it cannot positively confirm.
//
// Purchase option states (OneTimeProductPurchaseOption.state): DRAFT, ACTIVE,
// INACTIVE, INACTIVE_PUBLISHED. Only ACTIVE can be bought; a new option starts
// as DRAFT until activated (purchaseOptions:batchUpdateStates).
// ===========================================================================

export type PlayPreflightProblem =
  | "playNotConfigured"
  | "playNoPermission"
  | "playMissingProduct"
  | "playInactive"
  | "playUnreachable";

export type PlayPreflightResult =
  | { readonly ok: true; readonly state: string }
  | { readonly ok: false; readonly problem: PlayPreflightProblem; readonly state?: string };

/**
 * The buy option's state, ACTIVE winning when a product carries several. Null
 * when the product has no buy option at all (only rent, or none) — which is
 * not something this catalogue can sell.
 */
export function playBuyOptionState(product: PlayOneTimeProduct): string | null {
  const states = (product.purchaseOptions ?? [])
    .filter((o) => o.buyOption)
    .map((o) => String(o.state ?? "STATE_UNSPECIFIED"));
  if (states.length === 0) return null;
  return states.includes("ACTIVE") ? "ACTIVE" : states[0];
}

function preflightProblemOf(p: PlayPriceProblem): PlayPreflightProblem {
  if (p === "notConfigured" || p === "keyRejected") return "playNotConfigured";
  if (p === "needsPlayPermission") return "playNoPermission";
  if (p === "notCreated") return "playMissingProduct";
  return "playUnreachable";
}

/**
 * Does Google Play have this product, with an ACTIVE buy option? Read-only:
 * one GET. Fails closed — with no credentials there is no check, and an
 * unchecked activation is the event this exists to prevent.
 */
export async function preflightPlayProduct(productId: string): Promise<PlayPreflightResult> {
  const config = readPlayConfig();
  if (!config) return { ok: false, problem: "playNotConfigured" };
  const auth = await accessToken(config);
  if (!auth.ok) return { ok: false, problem: preflightProblemOf(auth.problem) };
  const res = await playCall(
    "GET",
    `${PLAY_API}/applications/${encodeURIComponent(config.packageName)}/oneTimeProducts/${encodeURIComponent(productId)}`,
    auth.token,
  );
  if (!res.ok) return { ok: false, problem: preflightProblemOf(res.problem) };
  const product = (res.json ?? {}) as PlayOneTimeProduct;
  // Match the id ourselves: a response for some other product must not pass.
  if (product.productId && product.productId !== productId) {
    return { ok: false, problem: "playMissingProduct" };
  }
  const state = playBuyOptionState(product);
  if (state === "ACTIVE") return { ok: true, state };
  return { ok: false, problem: "playInactive", state: state ?? "NONE" };
}

export type PlayCatalogueProduct = {
  productId: string;
  /** Buy-option state, or "NONE" when the product has no buy option. */
  state: string;
  /** The English listing title, for spotting a mis-mapped id. */
  name: string | null;
};

export type PlayCatalogue =
  | { readonly ok: true; readonly products: PlayCatalogueProduct[]; readonly fetchedAt: string }
  | {
      readonly ok: false;
      readonly problem: "storeNotConfigured" | "storeUnreachable";
      readonly fetchedAt: string;
    };

/** Every one-time product Google Play holds for this app. READ-ONLY. */
export async function fetchPlayCatalogue(): Promise<PlayCatalogue> {
  const fetchedAt = new Date().toISOString();
  const config = readPlayConfig();
  if (!config) return { ok: false, problem: "storeNotConfigured", fetchedAt };
  const auth = await accessToken(config);
  if (!auth.ok) {
    return {
      ok: false,
      problem: auth.problem === "notConfigured" || auth.problem === "keyRejected" ? "storeNotConfigured" : "storeUnreachable",
      fetchedAt,
    };
  }
  const products: PlayCatalogueProduct[] = [];
  let pageToken = "";
  for (let page = 0; page < 10; page += 1) {
    const res = await playCall(
      "GET",
      `${PLAY_API}/applications/${encodeURIComponent(config.packageName)}/oneTimeProducts?pageSize=1000` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""),
      auth.token,
    );
    // A partial catalogue must never be presented as the catalogue.
    if (!res.ok) return { ok: false, problem: "storeUnreachable", fetchedAt };
    const body = (res.json ?? {}) as {
      oneTimeProducts?: (PlayOneTimeProduct & { listings?: { languageCode?: string; title?: string }[] })[];
      nextPageToken?: string;
    };
    for (const p of body.oneTimeProducts ?? []) {
      if (!p.productId) continue;
      const listings = p.listings ?? [];
      const name =
        listings.find((l) => l.languageCode === "en-US")?.title ?? listings[0]?.title ?? null;
      products.push({ productId: p.productId, state: playBuyOptionState(p) ?? "NONE", name });
    }
    pageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : "";
    if (!pageToken) break;
  }
  return { ok: true, products, fetchedAt };
}

/** Play buy-option state → the i18n key the mirror shows (never the raw enum). */
export function playStateLabelKey(state: string): string {
  if (state === "ACTIVE") return "iap.play.state.active";
  if (state === "DRAFT") return "iap.play.state.draft";
  if (state === "INACTIVE" || state === "INACTIVE_PUBLISHED") return "iap.play.state.inactive";
  if (state === "NONE") return "iap.play.state.noBuyOption";
  return "iap.play.state.unknown";
}

export function playStateVerdict(state: string): "sellable" | "blocked" | "unknown" {
  if (state === "ACTIVE") return "sellable";
  if (state === "DRAFT" || state === "INACTIVE" || state === "INACTIVE_PUBLISHED" || state === "NONE") {
    return "blocked";
  }
  return "unknown";
}
