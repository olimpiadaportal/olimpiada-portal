// The App Store Connect activation preflight.
//
// WHAT IS BEING PROTECTED. `iap_products.active` is a switch in our own
// database; nothing about it consults Apple. Without this guard the admin panel
// would put on sale a product id App Store Connect has never heard of, and
// every family would get a buy button that fails — which is a 3.1.1 rejection
// with the whole rail already built.
//
// THE TWO MISTAKES THIS FILE PINS, because both are the *plausible* rule:
//
//   1. "Refuse anything that is not APPROVED." That would block our own
//      submission. App Review buys in the SANDBOX (TN2413) and sandbox
//      availability "doesn't require you to submit your In-App Purchases for
//      review" (TN3186), so at review time our products sit in
//      WAITING_FOR_REVIEW / IN_REVIEW. A guard demanding APPROVED refuses them,
//      the reviewer sees no purchase button, and we are rejected for exactly
//      the thing the guard was meant to prevent.
//
//   2. Letting an unrecognised state through. Apple has added states to this
//      resource before; an unknown value must fail closed, not fall through to
//      "allow".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PRODUCT = "ai.olympiq.app.sub.math.month";

// A syntactically valid P-256 key, generated at import time. The signer must
// actually run — a mocked crypto would hide the dsaEncoding mistake that makes
// Apple answer a bare 401.
const { privateKey } = await import("node:crypto").then((c) =>
  c.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }),
);

function configure(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    APP_STORE_CONNECT_ISSUER_ID: "issuer-uuid",
    APP_STORE_CONNECT_KEY_ID: "KEY123",
    APP_STORE_CONNECT_PRIVATE_KEY: privateKey as string,
    APP_STORE_CONNECT_APP_ID: "6798527831",
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

let requests: string[] = [];

function respondWith(state: string | null, productId = PRODUCT) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      requests.push(String(url));
      const data = state === null ? [] : [{ attributes: { productId, state } }];
      return new Response(JSON.stringify({ data }), { status: 200 });
    }),
  );
}

async function subject() {
  vi.resetModules();
  const mod = await import("@/lib/admin/appStoreConnect");
  return mod;
}

beforeEach(() => {
  requests = [];
  configure();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("states that must be ALLOWED", () => {
  // Blocking any of these breaks the submission the guard exists to protect.
  for (const state of [
    "APPROVED",
    "PENDING_BINARY_APPROVAL",
    "IN_REVIEW",
    "WAITING_FOR_REVIEW",
    "READY_TO_SUBMIT",
  ]) {
    it(`allows ${state}`, async () => {
      respondWith(state);
      const { preflightStoreProduct } = await subject();
      expect(await preflightStoreProduct(PRODUCT)).toEqual({ ok: true, state });
    });
  }
});

describe("states that must be REFUSED", () => {
  const cases: [string, string][] = [
    // Cannot be submitted, therefore can never be approved — even though a
    // sandbox tap would work, since Apple's sandbox minimum is only name+price.
    ["MISSING_METADATA", "storeIncomplete"],
    // Hosted-content states. Our products are not hosted-content, so either of
    // these means the product is not shaped the way we believe.
    ["WAITING_FOR_UPLOAD", "storeIncomplete"],
    ["PROCESSING_CONTENT", "storeIncomplete"],
    ["DEVELOPER_ACTION_NEEDED", "storeRejected"],
    ["REJECTED", "storeRejected"],
    ["REMOVED_FROM_SALE", "storeRemoved"],
    ["DEVELOPER_REMOVED_FROM_SALE", "storeRemoved"],
  ];
  for (const [state, problem] of cases) {
    it(`refuses ${state} as ${problem}`, async () => {
      respondWith(state);
      const { preflightStoreProduct } = await subject();
      expect(await preflightStoreProduct(PRODUCT)).toEqual({ ok: false, problem, state });
    });
  }

  it("fails closed on a state Apple has not published yet", async () => {
    respondWith("SOME_FUTURE_STATE");
    const { preflightStoreProduct } = await subject();
    expect(await preflightStoreProduct(PRODUCT)).toEqual({
      ok: false,
      problem: "storeUnknownState",
      state: "SOME_FUTURE_STATE",
    });
  });
});

describe("the cases that are not about state at all", () => {
  it("refuses when Apple has no such product", async () => {
    respondWith(null);
    const { preflightStoreProduct } = await subject();
    expect(await preflightStoreProduct(PRODUCT)).toEqual({
      ok: false,
      problem: "storeMissingProduct",
    });
  });

  it("refuses when the filter returns somebody else's product", async () => {
    // If Apple's filter ever stopped filtering, matching on the response's
    // first row would activate against an unrelated product.
    respondWith("APPROVED", "ai.olympiq.app.sub.physics.year");
    const { preflightStoreProduct } = await subject();
    expect(await preflightStoreProduct(PRODUCT)).toEqual({
      ok: false,
      problem: "storeMissingProduct",
    });
  });

  it("fails CLOSED when nothing is configured", async () => {
    configure({
      APP_STORE_CONNECT_ISSUER_ID: undefined,
      APP_STORE_CONNECT_KEY_ID: undefined,
      APP_STORE_CONNECT_PRIVATE_KEY: undefined,
      APP_STORE_CONNECT_APP_ID: undefined,
    });
    respondWith("APPROVED");
    const { preflightStoreProduct, isAppStoreConnectConfigured } = await subject();

    expect(isAppStoreConnectConfigured()).toBe(false);
    expect(await preflightStoreProduct(PRODUCT)).toEqual({
      ok: false,
      problem: "storeNotConfigured",
    });
    // An unchecked activation is the event this module exists to prevent, so a
    // missing configuration must not reach Apple OR return ok.
    expect(requests).toHaveLength(0);
  });

  it("treats a half-configured integration as unconfigured", async () => {
    configure({ APP_STORE_CONNECT_KEY_ID: undefined });
    const { isAppStoreConnectConfigured } = await subject();
    expect(isAppStoreConnectConfigured()).toBe(false);
  });

  it("rejects a non-numeric app id rather than calling with it", async () => {
    configure({ APP_STORE_CONNECT_APP_ID: "ai.olympiq.app" });
    respondWith("APPROVED");
    const { preflightStoreProduct } = await subject();
    expect(await preflightStoreProduct(PRODUCT)).toEqual({
      ok: false,
      problem: "storeNotConfigured",
    });
  });

  it("refuses, rather than allows, when Apple is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const { preflightStoreProduct } = await subject();
    expect(await preflightStoreProduct(PRODUCT)).toEqual({
      ok: false,
      problem: "storeUnreachable",
    });
  });

  it("refuses on a non-2xx from Apple", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const { preflightStoreProduct } = await subject();
    expect(await preflightStoreProduct(PRODUCT)).toEqual({
      ok: false,
      problem: "storeUnreachable",
    });
  });
});

describe("the request itself", () => {
  it("asks Apple only about this one product, read-only", async () => {
    respondWith("APPROVED");
    const { preflightStoreProduct } = await subject();
    await preflightStoreProduct(PRODUCT);

    expect(requests).toHaveLength(1);
    const [url] = requests;
    expect(url).toContain("/v1/apps/6798527831/inAppPurchasesV2");
    expect(url).toContain(`filter%5BproductId%5D=${encodeURIComponent(PRODUCT)}`);
  });

  it("accepts a PEM whose newlines arrived escaped", async () => {
    // A PEM pasted into an environment variable normally arrives with literal
    // backslash-n. crypto.createPrivateKey rejects that with an opaque parse
    // error, so this is the normal case rather than a defensive edge.
    configure({
      APP_STORE_CONNECT_PRIVATE_KEY: (privateKey as string).split("\n").join("\\n"),
    });
    respondWith("APPROVED");
    const { preflightStoreProduct } = await subject();
    expect(await preflightStoreProduct(PRODUCT)).toEqual({ ok: true, state: "APPROVED" });
  });

  it("reports an unusable key as unconfigured instead of throwing", async () => {
    configure({ APP_STORE_CONNECT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nrubbish\n-----END PRIVATE KEY-----" });
    respondWith("APPROVED");
    const { preflightStoreProduct } = await subject();
    expect(await preflightStoreProduct(PRODUCT)).toEqual({
      ok: false,
      problem: "storeNotConfigured",
    });
  });
});

// ===========================================================================
describe("the whole-catalogue read behind the mirror screen", () => {
  // The admin screen shows our rows beside Apple's, so this reader answers for
  // EVERY product at once. Its failure mode is the opposite of the preflight's:
  // the preflight must not wrongly allow, this must not wrongly report absence.
  // "Apple has never heard of this product" is a 3.1.1-shaped accusation, and a
  // dropped page or a failed request would make it about every row at once.

  /** Pages of inAppPurchasesV2, served in order, with Apple's own `next` link. */
  function respondWithPages(pages: { productId: string; state: string; name?: string }[][]) {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        requests.push(String(url));
        const page = pages[call] ?? [];
        const isLast = call >= pages.length - 1;
        call += 1;
        return new Response(
          JSON.stringify({
            data: page.map((p) => ({
              attributes: { productId: p.productId, state: p.state, name: p.name ?? null },
            })),
            links: isLast
              ? {}
              : { next: "https://api.appstoreconnect.apple.com/v1/apps/6798527831/inAppPurchasesV2?cursor=2" },
          }),
          { status: 200 },
        );
      }),
    );
  }

  it("returns every product with its raw state and reference name", async () => {
    respondWithPages([
      [{ productId: PRODUCT, state: "APPROVED", name: "Math monthly" }],
    ]);
    const { fetchStoreCatalogue } = await subject();
    const result = await fetchStoreCatalogue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products).toEqual([
      { productId: PRODUCT, state: "APPROVED", name: "Math monthly" },
    ]);
    expect(Date.parse(result.fetchedAt)).toBeGreaterThan(0);
  });

  it("follows Apple's cursor instead of stopping at the first page", async () => {
    respondWithPages([
      [{ productId: "ai.olympiq.app.sub.math.week", state: "APPROVED" }],
      [{ productId: "ai.olympiq.app.sub.math.year", state: "APPROVED" }],
    ]);
    const { fetchStoreCatalogue } = await subject();
    const result = await fetchStoreCatalogue();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.products.map((p) => p.productId)).toEqual([
      "ai.olympiq.app.sub.math.week",
      "ai.olympiq.app.sub.math.year",
    ]);
    expect(requests).toHaveLength(2);
  });

  it("never follows a `next` link that points off Apple's host", async () => {
    // The bearer token rides in the header; a redirected cursor would hand the
    // credential to whoever wrote the JSON.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        requests.push(String(url));
        return new Response(
          JSON.stringify({
            data: [{ attributes: { productId: PRODUCT, state: "APPROVED" } }],
            links: { next: "https://evil.example.com/v1/apps/1/inAppPurchasesV2" },
          }),
          { status: 200 },
        );
      }),
    );
    const { fetchStoreCatalogue } = await subject();
    await fetchStoreCatalogue();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("api.appstoreconnect.apple.com");
  });

  it("reports a FAILED read rather than an empty catalogue", async () => {
    // The dangerous shape: `ok: true, products: []` would tell the screen that
    // Apple has none of our products, and every row would read as missing.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const { fetchStoreCatalogue } = await subject();
    const result = await fetchStoreCatalogue();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toBe("storeUnreachable");
  });

  it("drops a half-read catalogue when a later page fails", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return new Response(
            JSON.stringify({
              data: [{ attributes: { productId: PRODUCT, state: "APPROVED" } }],
              links: { next: "https://api.appstoreconnect.apple.com/v1/apps/6798527831/inAppPurchasesV2?cursor=2" },
            }),
            { status: 200 },
          );
        }
        return new Response("nope", { status: 500 });
      }),
    );
    const { fetchStoreCatalogue } = await subject();
    const result = await fetchStoreCatalogue();
    expect(result.ok).toBe(false);
  });

  it("says unconfigured, with a timestamp, when there are no credentials", async () => {
    configure({ APP_STORE_CONNECT_ISSUER_ID: undefined });
    const { fetchStoreCatalogue } = await subject();
    const result = await fetchStoreCatalogue();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toBe("storeNotConfigured");
    // Present on BOTH shapes: a screen that only stamps successes shows the age
    // of the last good read during an outage, which is worse than no stamp.
    expect(Date.parse(result.fetchedAt)).toBeGreaterThan(0);
  });

  it("asks for the app's own products and nothing else", async () => {
    respondWithPages([[{ productId: PRODUCT, state: "APPROVED" }]]);
    const { fetchStoreCatalogue } = await subject();
    await fetchStoreCatalogue();
    expect(requests[0]).toContain("/v1/apps/6798527831/inAppPurchasesV2");
    expect(requests[0]).not.toContain("filter");
  });
});

// ===========================================================================
describe("the operator-facing state labels", () => {
  // These are the pairings App Store Connect itself shows. Echoing Apple's API
  // name at an admin sends them looking for a status that is not on any screen.
  it("maps both 'Prepare for Submission' states to one label", async () => {
    const { storeStateLabelKey } = await subject();
    expect(storeStateLabelKey("MISSING_METADATA")).toBe("iap.store.state.prepare");
    expect(storeStateLabelKey("READY_TO_SUBMIT")).toBe("iap.store.state.prepare");
  });

  it("uses the console's wording for the states that are renamed there", async () => {
    const { storeStateLabelKey } = await subject();
    expect(storeStateLabelKey("PENDING_BINARY_APPROVAL")).toBe("iap.store.state.accepted");
    expect(storeStateLabelKey("DEVELOPER_ACTION_NEEDED")).toBe(
      "iap.store.state.developerRejected",
    );
  });

  it("falls back to a label, never to the raw code", async () => {
    const { storeStateLabelKey } = await subject();
    expect(storeStateLabelKey("SOMETHING_APPLE_ADDED")).toBe("iap.store.state.unknown");
  });

  it("verdicts agree with what the preflight would allow", async () => {
    const { storeStateVerdict } = await subject();
    expect(storeStateVerdict("APPROVED")).toBe("sellable");
    expect(storeStateVerdict("WAITING_FOR_REVIEW")).toBe("sellable");
    expect(storeStateVerdict("REJECTED")).toBe("blocked");
    expect(storeStateVerdict("MISSING_METADATA")).toBe("blocked");
    expect(storeStateVerdict("SOMETHING_APPLE_ADDED")).toBe("unknown");
  });
});
