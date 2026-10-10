// Store prices follow the admin panel (owner decision 2026-10-10).
//
// The rules pinned here are the ones a plausible refactor breaks silently:
//   * Apple can only follow the NEAREST price point, and a tie goes DOWN;
//   * 2 / 7 / 70 AZN at 1.70 lands on 1.19 / 4.09 / 40.99 on Apple's ladder;
//   * a 403 from App Store Connect is a ROLE problem ("App Manager"), not an
//     outage, and nothing is believed until it is read back;
//   * Google gets the EXACT AZN amount on AZ (or AZN ÷ rate when AZ is USD),
//     every other region from Google's own conversion, availability untouched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import {
  chooseNearestPricePoint,
  googleAzTarget,
  parseFxRate,
  toGoogleMoney,
  fromGoogleMoney,
  DEFAULT_AZN_PER_USD,
} from "@/lib/admin/store-pricing-shared";

vi.mock("server-only", () => ({}));

// Apple's AZE (USD) ladder, shaped like the real one: $0.10 steps ending in 9
// up to $10, $0.50 steps to $50, $1 steps above. Ids are opaque per product.
function ladder(): { id: string; customerPrice: string }[] {
  const out: { id: string; customerPrice: string }[] = [];
  for (let c = 29; c <= 999; c += 10) out.push({ id: `p${c}`, customerPrice: (c / 100).toFixed(2) });
  for (let c = 1049; c <= 4999; c += 50) out.push({ id: `p${c}`, customerPrice: (c / 100).toFixed(2) });
  for (let c = 5099; c <= 19999; c += 100) out.push({ id: `p${c}`, customerPrice: (c / 100).toFixed(2) });
  return out;
}

describe("nearest Apple price point", () => {
  it("2 / 7 / 70 AZN at 1.70 → USD 1.19 / 4.09 / 40.99", () => {
    const pts = ladder();
    expect(chooseNearestPricePoint(pts, 2 / 1.7)?.customerPrice).toBe("1.19");
    expect(chooseNearestPricePoint(pts, 7 / 1.7)?.customerPrice).toBe("4.09");
    expect(chooseNearestPricePoint(pts, 70 / 1.7)?.customerPrice).toBe("40.99");
  });

  it("the old 3 / 9 / 90 AZN still map to what the store sold (1.79 / 5.29 / 52.99)", () => {
    const pts = ladder();
    expect(chooseNearestPricePoint(pts, 3 / 1.7)?.customerPrice).toBe("1.79");
    expect(chooseNearestPricePoint(pts, 9 / 1.7)?.customerPrice).toBe("5.29");
    expect(chooseNearestPricePoint(pts, 90 / 1.7)?.customerPrice).toBe("52.99");
  });

  it("a tie goes to the LOWER price", () => {
    const pts = [
      { id: "hi", customerPrice: "1.20" },
      { id: "lo", customerPrice: "1.10" },
    ];
    expect(chooseNearestPricePoint(pts, 1.15)?.id).toBe("lo");
  });

  it("ignores a point whose price does not parse, and refuses a non-positive target", () => {
    const pts = [
      { id: "junk", customerPrice: "" },
      { id: "ok", customerPrice: "4.99" },
    ];
    expect(chooseNearestPricePoint(pts, 0.01)?.id).toBe("ok");
    expect(chooseNearestPricePoint(pts, 0)).toBeNull();
    expect(chooseNearestPricePoint([], 1)).toBeNull();
  });
});

describe("FX rate and Google money", () => {
  it("reads a number or numeric string, and falls back to 1.70 on anything odd", () => {
    expect(parseFxRate(1.7)).toBe(1.7);
    expect(parseFxRate("1.75")).toBe(1.75);
    expect(parseFxRate(undefined)).toBe(DEFAULT_AZN_PER_USD);
    expect(parseFxRate("abc")).toBe(DEFAULT_AZN_PER_USD);
    // A typo of 17 would sell a year for $4; refused.
    expect(parseFxRate(17)).toBe(DEFAULT_AZN_PER_USD);
  });

  it("AZ gets the exact AZN amount, or AZN ÷ rate in USD, and nothing else", () => {
    expect(googleAzTarget(2, "AZN", 1.7)).toBe(2);
    expect(googleAzTarget(70, "AZN", 1.7)).toBe(70);
    expect(googleAzTarget(2, "USD", 1.7)).toBe(1.18);
    expect(googleAzTarget(70, "USD", 1.7)).toBe(41.18);
    expect(googleAzTarget(2, "EUR", 1.7)).toBeNull();
  });

  it("Money is units (string) + nanos, never a float", () => {
    expect(toGoogleMoney(41.18, "USD")).toEqual({ currencyCode: "USD", units: "41", nanos: 180_000_000 });
    expect(toGoogleMoney(2, "AZN")).toEqual({ currencyCode: "AZN", units: "2", nanos: 0 });
    expect(fromGoogleMoney({ units: "4", nanos: 120_000_000 })).toBeCloseTo(4.12);
  });
});

// ---------------------------------------------------------------------------
// App Store Connect writer, against a stubbed fetch
// ---------------------------------------------------------------------------
const { privateKey: ecKey } = await import("node:crypto").then((c) =>
  c.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }),
);
const { privateKey: rsaKey } = await import("node:crypto").then((c) =>
  c.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }),
);

const ENV_KEYS = [
  "APP_STORE_CONNECT_ISSUER_ID",
  "APP_STORE_CONNECT_KEY_ID",
  "APP_STORE_CONNECT_PRIVATE_KEY",
  "APP_STORE_CONNECT_APP_ID",
  "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  "GOOGLE_PLAY_PACKAGE_NAME",
];

function configureApple() {
  process.env.APP_STORE_CONNECT_ISSUER_ID = "issuer";
  process.env.APP_STORE_CONNECT_KEY_ID = "KEY123";
  process.env.APP_STORE_CONNECT_PRIVATE_KEY = ecKey as string;
  process.env.APP_STORE_CONNECT_APP_ID = "6798527831";
}
function configureGoogle(base64 = false) {
  const json = JSON.stringify({
    client_email: "sync@olympiq.iam.gserviceaccount.com",
    private_key: rsaKey as string,
  });
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = base64 ? Buffer.from(json).toString("base64") : json;
}

type Call = { method: string; url: string; body: unknown };
let calls: Call[] = [];

function stubFetch(handler: (c: Call) => { status: number; json?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const c: Call = {
        method: String(init?.method ?? "GET"),
        url: String(url),
        body:
          typeof init?.body === "string" && init.body.startsWith("{")
            ? JSON.parse(init.body)
            : (init?.body ?? null),
      };
      calls.push(c);
      const r = handler(c);
      return new Response(r.json === undefined ? "" : JSON.stringify(r.json), { status: r.status });
    }),
  );
}

const ASC_ID = "6700000001";
// A real-shaped price point id: base64 of {"s":…,"t":"AZE","p":…}.
const pointId = (cents: number) =>
  Buffer.from(JSON.stringify({ s: ASC_ID, t: "AZE", p: String(cents) })).toString("base64");

function appleHandler(opts: { current: string | null; postStatus?: number; currency?: string; readBackOverride?: string }) {
  let posted: string | null = null;
  return (c: Call) => {
    if (c.url.includes("/inAppPurchasesV2")) {
      return { status: 200, json: { data: [{ id: ASC_ID, attributes: { productId: "ai.olympiq.app.sub.math.week" } }] } };
    }
    if (c.url.includes("/v1/territories")) {
      return { status: 200, json: { data: [{ id: "AZE", attributes: { currency: opts.currency ?? "USD" } }] } };
    }
    if (c.url.includes("/pricePoints")) {
      return {
        status: 200,
        json: { data: ladder().map((p) => ({ id: pointId(Math.round(Number(p.customerPrice) * 100)), attributes: { customerPrice: p.customerPrice } })) },
      };
    }
    if (c.url.includes("/manualPrices")) {
      const price = posted ? (opts.readBackOverride ?? posted) : opts.current;
      if (!price) return { status: 200, json: { data: [], included: [] } };
      const id = pointId(Math.round(Number(price) * 100));
      return {
        status: 200,
        json: {
          data: [{ id: "mp1", attributes: { startDate: null, endDate: null }, relationships: { inAppPurchasePricePoint: { data: { id, type: "inAppPurchasePricePoints" } } } }],
          included: [{ id, type: "inAppPurchasePricePoints", attributes: { customerPrice: price } }],
        },
      };
    }
    if (c.method === "POST" && c.url.endsWith("/v1/inAppPurchasePriceSchedules")) {
      const status = opts.postStatus ?? 201;
      if (status < 300) {
        const body = c.body as { included: { relationships: { inAppPurchasePricePoint: { data: { id: string } } } }[] };
        const id = body.included[0].relationships.inAppPurchasePricePoint.data.id;
        const cents = Number(JSON.parse(Buffer.from(id, "base64").toString()).p);
        posted = (cents / 100).toFixed(2);
      }
      return { status, json: status < 300 ? { data: { id: ASC_ID } } : { errors: [] } };
    }
    return { status: 500 };
  };
}

async function apple() {
  vi.resetModules();
  return import("@/lib/admin/appStoreConnect");
}
async function google() {
  vi.resetModules();
  return import("@/lib/admin/googlePlay");
}

beforeEach(() => {
  calls = [];
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncAppStorePrice", () => {
  it("moves the product to the nearest AZE point, base territory AZE, and reads it back", async () => {
    configureApple();
    stubFetch(appleHandler({ current: "1.79" }));
    const { syncAppStorePrice } = await apple();
    const r = await syncAppStorePrice("ai.olympiq.app.sub.math.week", 2 / 1.7);
    expect(r).toEqual({
      ok: true,
      productId: "ai.olympiq.app.sub.math.week",
      changed: true,
      from: "1.79",
      to: "1.19",
      currency: "USD",
    });
    const post = calls.find((c) => c.method === "POST");
    const body = post?.body as {
      data: { relationships: { baseTerritory: { data: { id: string } }; inAppPurchase: { data: { id: string } } } };
      included: { attributes: { startDate: null }; relationships: { inAppPurchasePricePoint: { data: { id: string } } } }[];
    };
    expect(body.data.relationships.baseTerritory.data.id).toBe("AZE");
    expect(body.data.relationships.inAppPurchase.data.id).toBe(ASC_ID);
    expect(body.included).toHaveLength(1);
    expect(body.included[0].attributes.startDate).toBeNull();
    expect(body.included[0].relationships.inAppPurchasePricePoint.data.id).toBe(pointId(119));
  });

  it("writes NOTHING when the product is already on the nearest point", async () => {
    configureApple();
    stubFetch(appleHandler({ current: "1.19" }));
    const { syncAppStorePrice } = await apple();
    const r = await syncAppStorePrice("ai.olympiq.app.sub.math.week", 2 / 1.7);
    expect(r).toMatchObject({ ok: true, changed: false, to: "1.19" });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("403 on the write is the App Manager role, and is marked as an attempted write", async () => {
    configureApple();
    stubFetch(appleHandler({ current: "1.79", postStatus: 403 }));
    const { syncAppStorePrice } = await apple();
    const r = await syncAppStorePrice("ai.olympiq.app.sub.math.week", 2 / 1.7);
    expect(r).toMatchObject({ ok: false, problem: "needsAppManager", attempted: true, from: "1.79", to: "1.19" });
    expect(messages.en["subj.store.err.needsAppManager"]).toContain("App Manager");
    expect(messages.az["subj.store.err.needsAppManager"]).toContain("App Manager");
    expect(messages.ru["subj.store.err.needsAppManager"]).toContain("App Manager");
  });

  it("maps every status to a named problem", async () => {
    const { mapAscStatus } = await apple();
    expect(mapAscStatus(401)).toBe("keyRejected");
    expect(mapAscStatus(403)).toBe("needsAppManager");
    expect(mapAscStatus(404)).toBe("notCreated");
    expect(mapAscStatus(409)).toBe("rejected");
    expect(mapAscStatus(429)).toBe("rateLimited");
    expect(mapAscStatus(503)).toBe("unreachable");
  });

  it("a 2xx whose read-back disagrees is a failure, not a success", async () => {
    configureApple();
    stubFetch(appleHandler({ current: "1.79", readBackOverride: "1.79" }));
    const { syncAppStorePrice } = await apple();
    const r = await syncAppStorePrice("ai.olympiq.app.sub.math.week", 2 / 1.7);
    expect(r).toMatchObject({ ok: false, problem: "verifyFailed", attempted: true });
  });

  it("refuses to write when Azerbaijan is not billed in USD", async () => {
    configureApple();
    stubFetch(appleHandler({ current: "1.79", currency: "AZN" }));
    const { syncAppStorePrice } = await apple();
    const r = await syncAppStorePrice("ai.olympiq.app.sub.math.week", 2 / 1.7);
    expect(r).toMatchObject({ ok: false, problem: "currencyMismatch" });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("fails closed, without a request, when credentials are missing", async () => {
    stubFetch(() => ({ status: 200, json: {} }));
    const { syncAppStorePrice } = await apple();
    const r = await syncAppStorePrice("ai.olympiq.app.sub.math.week", 1.18);
    expect(r).toMatchObject({ ok: false, problem: "notConfigured" });
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Google Play writer
// ---------------------------------------------------------------------------
const PLAY_PRODUCT = {
  packageName: "ai.olympiq.app",
  productId: "ai.olympiq.app.sub.math.week",
  listings: [{ languageCode: "en-US", title: "Mathematics — 1 week access", description: "x" }],
  purchaseOptions: [
    {
      purchaseOptionId: "buy",
      state: "ACTIVE",
      buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
      regionalPricingAndAvailabilityConfigs: [
        { regionCode: "AZ", price: { currencyCode: "AZN", units: "3", nanos: 0 }, availability: "AVAILABLE" },
        { regionCode: "TR", price: { currencyCode: "TRY", units: "60", nanos: 0 }, availability: "NO_LONGER_AVAILABLE" },
      ],
      newRegionsConfig: {
        usdPrice: { currencyCode: "USD", units: "1", nanos: 760_000_000 },
        eurPrice: { currencyCode: "EUR", units: "1", nanos: 630_000_000 },
        availability: "AVAILABLE",
      },
    },
  ],
};

const CONVERSION = {
  convertedRegionPrices: {
    AZ: { regionCode: "AZ", price: { currencyCode: "AZN", units: "2", nanos: 10_000_000 } },
    TR: { regionCode: "TR", price: { currencyCode: "TRY", units: "40", nanos: 0 } },
  },
  convertedOtherRegionsPrice: {
    usdPrice: { currencyCode: "USD", units: "1", nanos: 180_000_000 },
    eurPrice: { currencyCode: "EUR", units: "1", nanos: 90_000_000 },
  },
};

function googleHandler(opts: { patchStatus?: number; product?: unknown } = {}) {
  return (c: Call) => {
    if (c.url.startsWith("https://oauth2.googleapis.com/token")) {
      return { status: 200, json: { access_token: "ya29.test", expires_in: 3600 } };
    }
    if (c.method === "GET" && c.url.includes("/oneTimeProducts/")) {
      return { status: 200, json: opts.product ?? PLAY_PRODUCT };
    }
    if (c.url.endsWith("/pricing:convertRegionPrices")) return { status: 200, json: CONVERSION };
    if (c.method === "PATCH") {
      const status = opts.patchStatus ?? 200;
      return { status, json: status < 300 ? c.body : { error: { message: "nope" } } };
    }
    return { status: 500 };
  };
}

describe("Google Play price payload", () => {
  it("AZ exact, other regions from Google's conversion, availability kept, state dropped", async () => {
    const { repricePurchaseOptions } = await google();
    const out = repricePurchaseOptions(
      PLAY_PRODUCT.purchaseOptions,
      { currencyCode: "AZN", units: "2", nanos: 0 },
      {
        regions: new Map([["TR", { currencyCode: "TRY", units: "40", nanos: 0 }]]),
        usdPrice: { currencyCode: "USD", units: "1", nanos: 180_000_000 },
        eurPrice: { currencyCode: "EUR", units: "1", nanos: 90_000_000 },
      },
    );
    expect(out[0]).not.toHaveProperty("state");
    expect(out[0].buyOption).toEqual({ legacyCompatible: true, multiQuantityEnabled: false });
    expect(out[0].regionalPricingAndAvailabilityConfigs).toEqual([
      { regionCode: "AZ", price: { currencyCode: "AZN", units: "2", nanos: 0 }, availability: "AVAILABLE" },
      { regionCode: "TR", price: { currencyCode: "TRY", units: "40", nanos: 0 }, availability: "NO_LONGER_AVAILABLE" },
    ]);
    expect(out[0].newRegionsConfig).toEqual({
      usdPrice: { currencyCode: "USD", units: "1", nanos: 180_000_000 },
      eurPrice: { currencyCode: "EUR", units: "1", nanos: 90_000_000 },
      availability: "AVAILABLE",
    });
  });

  it("PATCHes purchaseOptions with the regions version and the exact AZN amount", async () => {
    configureGoogle(true);
    stubFetch(googleHandler());
    const { syncGooglePlayPrice } = await google();
    const r = await syncGooglePlayPrice("ai.olympiq.app.sub.math.week", 2, 1.7);
    expect(r).toEqual({
      ok: true,
      productId: "ai.olympiq.app.sub.math.week",
      changed: true,
      from: 3,
      to: 2,
      currency: "AZN",
    });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toContain("/applications/ai.olympiq.app/onetimeproducts/ai.olympiq.app.sub.math.week?");
    expect(patch?.url).toContain("updateMask=purchaseOptions");
    expect(patch?.url).toContain("regionsVersion.version=2025%2F03");
    const body = patch?.body as { purchaseOptions: { regionalPricingAndAvailabilityConfigs: { regionCode: string; price: unknown }[] }[] };
    const az = body.purchaseOptions[0].regionalPricingAndAvailabilityConfigs.find((x) => x.regionCode === "AZ");
    expect(az?.price).toEqual({ currencyCode: "AZN", units: "2", nanos: 0 });
    // The conversion is asked for the USD equivalent of the AZN amount.
    const conv = calls.find((c) => c.url.endsWith("/pricing:convertRegionPrices"));
    expect(conv?.body).toEqual({ price: { currencyCode: "USD", units: "1", nanos: 180_000_000 } });
    // The bearer token comes from the pinned Google token endpoint.
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
  });

  it("writes nothing when AZ is already at the admin amount", async () => {
    configureGoogle();
    stubFetch(googleHandler());
    const { syncGooglePlayPrice } = await google();
    const r = await syncGooglePlayPrice("ai.olympiq.app.sub.math.week", 3, 1.7);
    expect(r).toMatchObject({ ok: true, changed: false, to: 3 });
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("403 is a Play Console permission problem, and is an attempted write", async () => {
    configureGoogle();
    stubFetch(googleHandler({ patchStatus: 403 }));
    const { syncGooglePlayPrice, mapPlayStatus } = await google();
    const r = await syncGooglePlayPrice("ai.olympiq.app.sub.math.week", 2, 1.7);
    expect(r).toMatchObject({ ok: false, problem: "needsPlayPermission", attempted: true });
    expect(mapPlayStatus(404)).toBe("notCreated");
    expect(mapPlayStatus(401)).toBe("keyRejected");
  });

  it("refuses a currency it has no rate for", async () => {
    configureGoogle();
    const eur = JSON.parse(JSON.stringify(PLAY_PRODUCT));
    eur.purchaseOptions[0].regionalPricingAndAvailabilityConfigs[0].price = { currencyCode: "EUR", units: "1", nanos: 0 };
    stubFetch(googleHandler({ product: eur }));
    const { syncGooglePlayPrice } = await google();
    const r = await syncGooglePlayPrice("ai.olympiq.app.sub.math.week", 2, 1.7);
    expect(r).toMatchObject({ ok: false, problem: "currencyUnsupported" });
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("fails closed without a service account, and the assertion is RS256 for the pinned audience", async () => {
    stubFetch(() => ({ status: 200, json: {} }));
    const mod = await google();
    expect(await mod.syncGooglePlayPrice("x", 2, 1.7)).toMatchObject({ ok: false, problem: "notConfigured" });
    expect(calls).toHaveLength(0);
    const jwt = mod.buildServiceAccountAssertion("a@b.iam.gserviceaccount.com", rsaKey as string, 1000);
    const [h, p] = jwt.split(".").slice(0, 2).map((s) => JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()));
    expect(h).toEqual({ alg: "RS256", typ: "JWT" });
    expect(p).toMatchObject({
      iss: "a@b.iam.gserviceaccount.com",
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/androidpublisher",
      iat: 1000,
      exp: 4600,
    });
  });
});

describe("Google Play activation preflight (the android twin of the Apple preflight)", () => {
  const withState = (state: string) => ({
    ...PLAY_PRODUCT,
    purchaseOptions: [{ ...PLAY_PRODUCT.purchaseOptions[0], state }],
  });

  it("passes only an existing product whose buy option is ACTIVE", async () => {
    configureGoogle();
    stubFetch(googleHandler({ product: withState("ACTIVE") }));
    const { preflightPlayProduct } = await google();
    expect(await preflightPlayProduct("ai.olympiq.app.sub.math.week")).toEqual({ ok: true, state: "ACTIVE" });
    expect(calls.every((c) => c.method !== "PATCH")).toBe(true);
  });

  it("refuses a DRAFT or INACTIVE buy option as inactive", async () => {
    configureGoogle();
    for (const state of ["DRAFT", "INACTIVE", "INACTIVE_PUBLISHED"]) {
      stubFetch(googleHandler({ product: withState(state) }));
      const { preflightPlayProduct } = await google();
      expect(await preflightPlayProduct("ai.olympiq.app.sub.math.week")).toMatchObject({
        ok: false,
        problem: "playInactive",
        state,
      });
    }
  });

  it("names a missing product, a missing permission and missing credentials", async () => {
    configureGoogle();
    stubFetch((c) =>
      c.url.startsWith("https://oauth2.googleapis.com/token")
        ? { status: 200, json: { access_token: "t", expires_in: 3600 } }
        : { status: 404, json: {} },
    );
    let mod = await google();
    expect(await mod.preflightPlayProduct("x")).toEqual({ ok: false, problem: "playMissingProduct" });

    stubFetch((c) =>
      c.url.startsWith("https://oauth2.googleapis.com/token")
        ? { status: 200, json: { access_token: "t", expires_in: 3600 } }
        : { status: 403, json: {} },
    );
    mod = await google();
    expect(await mod.preflightPlayProduct("x")).toEqual({ ok: false, problem: "playNoPermission" });

    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    calls = [];
    mod = await google();
    expect(await mod.preflightPlayProduct("x")).toEqual({ ok: false, problem: "playNotConfigured" });
    expect(calls).toHaveLength(0);
  });
});
