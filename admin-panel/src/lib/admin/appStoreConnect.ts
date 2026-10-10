import "server-only";

// ---------------------------------------------------------------------------
// APP STORE CONNECT — readers, and (since 2026-10-10) ONE writer: the price.
//
//   preflightStoreProduct()  — asks about ONE product before it is offered.
//   fetchStoreCatalogue()    — reads the WHOLE app's product list so the admin
//                              screen can mirror Apple's answer next to ours.
//   readAppStorePrices()     — the live AZE price of each product, for the
//                              Subjects screen's in-sync / out-of-sync column.
//   syncAppStorePrice()      — moves ONE product to the AZE price point nearest
//                              to the admin's AZN amount. The only write here.
//
// THE RULE THIS HEADER USED TO STATE, AND WHY IT CHANGED. Until 2026-10-10 this
// module said "NOTHING IN THIS MODULE WRITES TO APPLE", and told the next
// engineer not to add a POST "to save the admin a step". The reasoning was
// sound: an admin screen that APPEARS to change App Store Connect and does not
// is worse than no screen. It was reversed by an explicit OWNER DECISION
// (2026-10-10): "whatever price is set in Admin → Subjects, the mobile apps
// must display that." The production state that prompted it was exactly the
// divergence the old rule tolerated — the admin price was 2 / 7 / 70 AZN while
// iOS still sold USD 1.79 / 5.29 / 52.99, the conversion of the OLD 3 / 9 / 90.
// A read-only module could show that; it could not stop it.
//
// WHAT THE WRITE IS ALLOWED TO DO, AND THE SAFEGUARDS THAT REPLACE THE OLD
// RULE. The old rule's worry ("appears to change, does not") is answered by
// making every write VERIFIED and REPORTED rather than by forbidding it:
//   1. PRICE ONLY. It never creates, renames, submits, removes from sale or
//      changes availability. Products are still created by the owner's local
//      script (mobile-app/scripts/create-iap-products.mjs).
//   2. ONE TERRITORY. It writes a manual price for the BASE territory AZE only
//      and lets Apple equalize every other storefront, exactly as
//      mobile-app/scripts/set-iap-prices.mjs did by hand.
//   3. UNIT CHECKED BEFORE ANY WRITE. customerPrice is a bare number with no
//      currency anywhere in Apple's response. The territory's billing currency
//      is read from Apple and must be USD (what the target was computed in) or
//      nothing is written — the same fail-closed guard the script has.
//   4. PER-PRODUCT PRICE POINTS. A price point id embeds the product id, so the
//      ladder is fetched for the product being priced, never reused.
//   5. NO-OP WHEN ALREADY RIGHT. The current price is read first; a product
//      already on the nearest point is left alone (no write, no audit noise).
//   6. READ BACK. A 2xx is not believed until the stored price is re-read and
//      matches. A mismatch is reported as a failure.
//   7. FAIL CLOSED, NAMED. Missing credentials, a rejected key, a key without
//      the App Manager role (403), a product Apple does not have — each is a
//      distinct problem code the panel turns into a sentence. Nothing here
//      throws into a request and nothing here ever returns "probably fine".
//   8. AUDITED BY THE CALLER (lib/admin/storePriceSync.ts) with product id,
//      old → new price and store, under requireAdmin().
//   9. NEVER BLOCKS THE AZN SAVE. The AZN row is the source of truth and is
//      saved first; a store failure is shown beside it, never rolled back into
//      it (lib/admin/pricing.ts).
//
// WHY THE ACTIVATION PREFLIGHT EXISTS. `iap_products.active` is a switch in OUR
// database. Nothing about it consults Apple, so before this module the admin
// panel would happily put on sale a product id that App Store Connect has never
// heard of. The app then lists a product StoreKit cannot resolve and every tap
// fails — and Apple reviews the buy button, not our intentions. That is a 3.1.1
// rejection with the whole rail already built.
//
// WHAT THE PREFLIGHT CHECKS, AND WHAT IT DELIBERATELY DOES NOT.
//
// It answers one question: does App Store Connect have this exact product id,
// and is it in a state that can still become a sale? It does NOT try to predict
// whether a purchase will succeed, because Apple publishes no state-to-sandbox
// matrix — that was checked against the sandbox testing guide, the staged
// testing guide, the sandbox overview and the IAP status reference, and none of
// them mention product state as a precondition. Any such rule would be our
// inference dressed as a contract.
//
// THE STATE THAT ALMOST FOOLED THIS GUARD. The obvious rule is "refuse anything
// that is not APPROVED". That would block our own submission: App Review buys
// in the SANDBOX (TN2413), and sandbox availability explicitly "doesn't require
// you to submit your In-App Purchases for review" (TN3186), so at review time
// our products sit in WAITING_FOR_REVIEW or IN_REVIEW and would be refused by
// the very guard meant to protect the release.
//
// The mirror-image trap is MISSING_METADATA. It is tempting to treat it as
// "unpurchasable", and that is WRONG: Apple's stated sandbox minimum is only a
// reference name, a product id, a localized name and a price, while submission
// additionally wants a Description — so a product can sit in MISSING_METADATA
// and still buy fine in sandbox. It is refused below anyway, for a different
// and honest reason: a product that cannot be SUBMITTED cannot be approved, so
// selling it is a release mistake even though a sandbox tap would work.
//
// FAIL CLOSED. With no credentials configured there is no check, and an
// unchecked activation is the exact event this module exists to prevent. The
// error names the missing variable so it is one setting away from resolved.
//
// THE KEY'S ROLE. Reads work with any App Store Connect API key role; the price
// write needs App Manager (or Admin). A Developer/Finance key reads fine and
// then answers the write with 403 — reported as `needsAppManager`.
// ---------------------------------------------------------------------------
import crypto from "node:crypto";
import { chooseNearestPricePoint, sameCents } from "@/lib/admin/store-pricing-shared";

const API_BASE = "https://api.appstoreconnect.apple.com";

/**
 * Every value of Apple's InAppPurchaseState. Twelve, confirmed against both the
 * enum reference and the `filter[state]` allowed values on the endpoint itself.
 *
 * NOTE FOR ANY OPERATOR-FACING TEXT: these are API names and they are NOT what
 * App Store Connect shows a human. MISSING_METADATA and READY_TO_SUBMIT both
 * display as "Prepare for Submission"; PENDING_BINARY_APPROVAL displays as
 * "Accepted"; DEVELOPER_ACTION_NEEDED displays as "Developer Rejected". Apple
 * publishes no mapping table. Echoing a raw state at the owner would send them
 * hunting for a status that does not exist on the screen, so the messages this
 * module returns are i18n keys, never the state string.
 */
const SELLABLE_STATES = new Set([
  // Approved and, subject to territory availability, sellable.
  "APPROVED",
  // The IAP is accepted; only the binary it rode in with is still pending.
  "PENDING_BINARY_APPROVAL",
  // In the review pipeline. Purchasable in sandbox, which is where App Review
  // buys — refusing these would block the submission this guard protects.
  "IN_REVIEW",
  "WAITING_FOR_REVIEW",
  // Metadata complete, not yet added to a submission. Legitimate to activate
  // ahead of the submission itself.
  "READY_TO_SUBMIT",
]);

/**
 * States where a human must act before this product can ever be approved.
 * Refused with a distinct message so the owner knows where to go.
 *
 * WAITING_FOR_UPLOAD and PROCESSING_CONTENT are Apple-hosted-content states,
 * reachable only when `contentHosting` is true. Ours are not hosted-content
 * products, so seeing either is an anomaly rather than a transient — refusing
 * is the correct response to a product that is not shaped the way we think.
 */
const BLOCKED_STATE_REASON: Record<string, IapPreflightProblem> = {
  MISSING_METADATA: "storeIncomplete",
  WAITING_FOR_UPLOAD: "storeIncomplete",
  PROCESSING_CONTENT: "storeIncomplete",
  DEVELOPER_ACTION_NEEDED: "storeRejected",
  REJECTED: "storeRejected",
  REMOVED_FROM_SALE: "storeRemoved",
  DEVELOPER_REMOVED_FROM_SALE: "storeRemoved",
};

export type IapPreflightProblem =
  | "storeNotConfigured"
  | "storeUnreachable"
  | "storeMissingProduct"
  | "storeIncomplete"
  | "storeRejected"
  | "storeRemoved"
  | "storeUnknownState";

export type IapPreflightResult =
  | { readonly ok: true; readonly state: string }
  | { readonly ok: false; readonly problem: IapPreflightProblem; readonly state?: string };

/**
 * What Apple's state means for a product we might offer. The same three-way
 * split the preflight already makes, named so the mirror screen can show it
 * without re-implementing (and eventually contradicting) the rule.
 */
export type StoreStateVerdict = "sellable" | "blocked" | "unknown";

export function storeStateVerdict(state: string): StoreStateVerdict {
  if (SELLABLE_STATES.has(state)) return "sellable";
  if (BLOCKED_STATE_REASON[state]) return "blocked";
  return "unknown";
}

/**
 * API state → the i18n key whose text matches WHAT APP STORE CONNECT SHOWS.
 *
 * This is the mapping the header warns about, written down once. An admin
 * reading "MISSING_METADATA" on our screen would go looking for that status in
 * App Store Connect and never find it — the console calls it "Prepare for
 * Submission", the same label it gives READY_TO_SUBMIT. Same for
 * PENDING_BINARY_APPROVAL ("Accepted") and DEVELOPER_ACTION_NEEDED
 * ("Developer Rejected"). Apple publishes no mapping table; these pairings come
 * from the console itself, so treat a change here as a fact to re-verify rather
 * than a wording preference.
 */
const STATE_LABEL_KEY: Record<string, string> = {
  MISSING_METADATA: "iap.store.state.prepare",
  READY_TO_SUBMIT: "iap.store.state.prepare",
  WAITING_FOR_REVIEW: "iap.store.state.waitingReview",
  IN_REVIEW: "iap.store.state.inReview",
  PENDING_BINARY_APPROVAL: "iap.store.state.accepted",
  APPROVED: "iap.store.state.approved",
  DEVELOPER_ACTION_NEEDED: "iap.store.state.developerRejected",
  REJECTED: "iap.store.state.rejected",
  REMOVED_FROM_SALE: "iap.store.state.removed",
  DEVELOPER_REMOVED_FROM_SALE: "iap.store.state.removed",
  WAITING_FOR_UPLOAD: "iap.store.state.contentPending",
  PROCESSING_CONTENT: "iap.store.state.contentPending",
};

/** Falls back to the "we do not recognise this" label, never to the raw code. */
export function storeStateLabelKey(state: string): string {
  return STATE_LABEL_KEY[state] ?? "iap.store.state.unknown";
}

/** One product as App Store Connect currently reports it. */
export type StoreProductSnapshot = {
  productId: string;
  /** Apple's raw InAppPurchaseState. For logs and verdicts, never for a human. */
  state: string;
  /** Apple's reference name — the fastest way to spot a mis-mapped product id. */
  name: string | null;
};

/**
 * `fetchedAt` is present on BOTH shapes on purpose: a screen that says "last
 * checked 12:04" and quietly means "last SUCCESSFUL check, some time before the
 * outage" is worse than one that admits the last attempt failed.
 */
export type StoreCatalogue =
  | { readonly ok: true; readonly products: StoreProductSnapshot[]; readonly fetchedAt: string }
  | {
      readonly ok: false;
      readonly problem: "storeNotConfigured" | "storeUnreachable";
      readonly fetchedAt: string;
    };

type AscConfig = {
  issuerId: string;
  keyId: string;
  privateKeyPem: string;
  appId: string;
};

/**
 * Reads the four values from the environment. Returns null when ANY is absent —
 * a half-configured integration is the same as none.
 *
 * The private key is the PEM CONTENTS, not a path: this runs on Vercel, which
 * has no filesystem to put a .p8 in. A PEM pasted into an environment variable
 * commonly arrives with literal backslash-n rather than real newlines, and
 * `crypto.createPrivateKey` rejects that with an opaque parse error — so the
 * substitution below is not defensive clutter, it is the normal case.
 */
function readConfig(): AscConfig | null {
  const issuerId = (process.env.APP_STORE_CONNECT_ISSUER_ID ?? "").trim();
  const keyId = (process.env.APP_STORE_CONNECT_KEY_ID ?? "").trim();
  const rawKey = (process.env.APP_STORE_CONNECT_PRIVATE_KEY ?? "").trim();
  const appId = (process.env.APP_STORE_CONNECT_APP_ID ?? "").trim();
  if (!issuerId || !keyId || !rawKey || !/^\d+$/.test(appId)) return null;
  return {
    issuerId,
    keyId,
    appId,
    privateKeyPem: rawKey.includes("\\n") ? rawKey.split("\\n").join("\n") : rawKey,
  };
}

/** True when the preflight can run at all. Lets callers explain themselves. */
export function isAppStoreConnectConfigured(): boolean {
  return readConfig() !== null;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * ES256 JWT for the App Store Connect API.
 *
 * `dsaEncoding: "ieee-p1363"` is load-bearing and easy to lose. Node's default
 * is DER, which Apple rejects with a bare 401 and no body — indistinguishable
 * from a wrong key id, and the reason a working integration looks like a
 * credentials problem. This mirrors the signer in
 * mobile-app/scripts/create-iap-products.mjs, which authenticated against the
 * live API on 2026-09-01.
 */
function mintToken(config: AscConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const payload = {
    iss: config.issuerId,
    iat: now,
    exp: now + 300,
    aud: "appstoreconnect-v1",
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: crypto.createPrivateKey(config.privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64Url(signature)}`;
}

/** One page of an inAppPurchasesV2 listing. */
type AscPage = {
  data?: { attributes?: { productId?: string; state?: string; name?: string } }[];
  links?: { next?: string };
};

/**
 * One authenticated GET. Returns null for every failure an operator can do
 * nothing about mid-request — connection refused, a non-2xx (a 401 from a wrong
 * key id looks exactly like one from a DER signature), a body that is not JSON.
 * The caller turns that into `storeUnreachable`, which is a REFUSAL: this
 * module never answers "probably fine".
 */
/**
 * Apple is a THIRD PARTY ON A RENDER PATH, so it gets a deadline.
 *
 * This call used to happen only inside `setIapProductActive` — an explicit
 * operator action, where waiting is understood. Since the /iap screen became a
 * read-only mirror it runs on every render of that page, so an Apple outage or a
 * black-holed connection would hang the admin's request until the platform's own
 * timeout fired. Ten seconds is long enough for a slow-but-working response and
 * short enough that a stuck one still renders the page with an honest
 * "unreachable" instead of a spinner. The abort lands in the catch below and
 * becomes `storeUnreachable`, exactly like every other failure here.
 */
const ASC_TIMEOUT_MS = 10_000;

async function getJson(url: string, token: string): Promise<AscPage | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(ASC_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    console.error("[admin] app store connect http", response.status);
    return null;
  }
  try {
    return (await response.json()) as AscPage;
  } catch {
    return null;
  }
}

/** Apple caps this endpoint at 200 per page; the loop below is bounded anyway. */
const CATALOGUE_PAGE_SIZE = 200;
const CATALOGUE_MAX_PAGES = 10;

/**
 * Every in-app purchase App Store Connect holds for this app.
 *
 * WHY THE WHOLE LIST AND NOT ONE LOOKUP PER ROW. The mirror screen has to show
 * BOTH directions of disagreement, and the second one is invisible to a
 * per-row check: a product that exists at Apple with no row in `iap_products`
 * is a purchase the server cannot map to an entitlement — the family is charged
 * and gets nothing. Twenty-one row-by-row requests would also be twenty-one
 * chances to hit Apple's rate limit on one page load.
 *
 * Paginated because `limit` maxes out at 200 and the catalogue only grows. The
 * page cap is a safety rail, not an expectation: 2000 products is far past
 * anything this product will sell, and an unbounded loop driven by a remote
 * response is not something to leave in a request path.
 */
export async function fetchStoreCatalogue(): Promise<StoreCatalogue> {
  // Stamped BEFORE the request: this is when the screen's picture of Apple was
  // taken, and a slow call must not make the answer look fresher than it is.
  const fetchedAt = new Date().toISOString();

  const config = readConfig();
  if (!config) return { ok: false, problem: "storeNotConfigured", fetchedAt };

  let token: string;
  try {
    token = mintToken(config);
  } catch (error) {
    console.error(
      "[admin] app store connect key unusable",
      error instanceof Error ? error.name : "unknown",
    );
    return { ok: false, problem: "storeNotConfigured", fetchedAt };
  }

  const products: StoreProductSnapshot[] = [];
  let url: string | null =
    `${API_BASE}/v1/apps/${encodeURIComponent(config.appId)}/inAppPurchasesV2` +
    `?fields%5BinAppPurchases%5D=productId,state,name&limit=${CATALOGUE_PAGE_SIZE}`;

  for (let page = 0; page < CATALOGUE_MAX_PAGES && url; page += 1) {
    const payload = await getJson(url, token);
    // A partial catalogue must never be presented as the catalogue: a row would
    // read "Apple has never heard of this" purely because page two failed.
    if (!payload) return { ok: false, problem: "storeUnreachable", fetchedAt };

    for (const row of payload.data ?? []) {
      const productId = String(row?.attributes?.productId ?? "");
      if (!productId) continue;
      products.push({
        productId,
        state: String(row?.attributes?.state ?? ""),
        name: row?.attributes?.name ?? null,
      });
    }

    // Follow Apple's own cursor, and only Apple's: the bearer token travels in
    // the header, so a `next` pointing anywhere else would hand our credential
    // to another host.
    const next = payload.links?.next;
    url = typeof next === "string" && next.startsWith(`${API_BASE}/`) ? next : null;
  }

  return { ok: true, products, fetchedAt };
}

/**
 * Does App Store Connect have this product id, in a state that can still sell?
 *
 * Read-only: one filtered GET. Never creates, never modifies, never submits.
 */
export async function preflightStoreProduct(
  productId: string,
): Promise<IapPreflightResult> {
  const config = readConfig();
  if (!config) return { ok: false, problem: "storeNotConfigured" };

  let token: string;
  try {
    token = mintToken(config);
  } catch (error) {
    // An unparseable PEM lands here. Log the shape, never the key.
    console.error(
      "[admin] app store connect key unusable",
      error instanceof Error ? error.name : "unknown",
    );
    return { ok: false, problem: "storeNotConfigured" };
  }

  const url =
    `${API_BASE}/v1/apps/${encodeURIComponent(config.appId)}/inAppPurchasesV2` +
    `?filter%5BproductId%5D=${encodeURIComponent(productId)}` +
    `&fields%5BinAppPurchases%5D=productId,state,name&limit=200`;

  const payload = await getJson(url, token);
  if (!payload) return { ok: false, problem: "storeUnreachable" };

  // Apple's filter is authoritative, but match the id ourselves too: a filter
  // that silently stopped filtering would otherwise approve the first product
  // in the account.
  const match = (payload.data ?? []).find(
    (row) => row?.attributes?.productId === productId,
  );
  if (!match) return { ok: false, problem: "storeMissingProduct" };

  const state = String(match.attributes?.state ?? "");
  if (SELLABLE_STATES.has(state)) return { ok: true, state };

  const known = BLOCKED_STATE_REASON[state];
  if (known) return { ok: false, problem: known, state };

  // Apple has added states to this resource before. An unrecognised value must
  // never fall through to "allow" — the whole point of the guard is that we do
  // not sell something we cannot account for.
  return { ok: false, problem: "storeUnknownState", state };
}

// ===========================================================================
// PRICE SYNC (owner decision 2026-10-10 — see the header for the safeguards)
// ===========================================================================

/** Apple bills this storefront in USD; it is the base territory for every price. */
export const APPLE_BASE_TERRITORY = "AZE";
/** What every target price is computed in. Checked against Apple before a write. */
export const APPLE_EXPECTED_CURRENCY = "USD";

/**
 * Why a price read or write did not happen. Each is an i18n key suffix
 * (`subj.store.err.<problem>`) — never Apple's raw message.
 */
export type ApplePriceProblem =
  | "notConfigured"
  | "keyRejected"
  | "needsAppManager"
  | "notCreated"
  | "unreachable"
  | "rateLimited"
  | "rejected"
  | "currencyMismatch"
  | "noPricePoint"
  | "verifyFailed";

export type ApplePricePoint = { id: string; customerPrice: string };

export type AppleSyncResult =
  | {
      readonly ok: true;
      readonly productId: string;
      /** false = already on the nearest point; nothing was written. */
      readonly changed: boolean;
      readonly from: string | null;
      readonly to: string;
      readonly currency: string;
    }
  | {
      readonly ok: false;
      readonly productId: string;
      readonly problem: ApplePriceProblem;
      readonly from?: string | null;
      readonly to?: string;
      /** true = the write itself was sent (and failed or did not verify). */
      readonly attempted?: boolean;
    };

type AscCall =
  | { ok: true; json: unknown }
  | { ok: false; problem: ApplePriceProblem; status: number | null };

/**
 * Apple HTTP status → the problem the panel names.
 *
 * 403 is the one that matters most: an API key created with the Developer or
 * Finance role authenticates, READS every product, and is then refused on the
 * price POST. That is a role to change in App Store Connect, not an outage, so
 * it must not read as "Apple is down".
 */
export function mapAscStatus(status: number): ApplePriceProblem {
  if (status === 401) return "keyRejected";
  if (status === 403) return "needsAppManager";
  if (status === 404) return "notCreated";
  if (status === 429) return "rateLimited";
  if (status === 409 || status === 422 || status === 400) return "rejected";
  return "unreachable";
}

async function ascCall(
  method: "GET" | "POST",
  url: string,
  token: string,
  body?: unknown,
): Promise<AscCall> {
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
      signal: AbortSignal.timeout(ASC_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, problem: "unreachable", status: null };
  }
  if (!response.ok) {
    // Status only. Apple's error body can echo request details, and the mapped
    // problem is what an operator acts on.
    console.error("[admin] app store connect", method, response.status);
    return { ok: false, problem: mapAscStatus(response.status), status: response.status };
  }
  if (response.status === 204) return { ok: true, json: null };
  try {
    return { ok: true, json: await response.json() };
  } catch {
    return { ok: false, problem: "unreachable", status: response.status };
  }
}

type JsonApiRow = {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string; type?: string } | null }>;
};
type JsonApiPage = { data?: JsonApiRow[]; included?: JsonApiRow[]; links?: { next?: string } };

/** Follow Apple's own cursor only — the bearer token must never leave Apple's host. */
function nextUrl(page: JsonApiPage): string | null {
  const next = page.links?.next;
  return typeof next === "string" && next.startsWith(`${API_BASE}/`) ? next : null;
}

function tokenOrProblem():
  | { ok: true; token: string; config: AscConfig }
  | { ok: false; problem: ApplePriceProblem } {
  const config = readConfig();
  if (!config) return { ok: false, problem: "notConfigured" };
  try {
    return { ok: true, token: mintToken(config), config };
  } catch (error) {
    console.error(
      "[admin] app store connect key unusable",
      error instanceof Error ? error.name : "unknown",
    );
    return { ok: false, problem: "notConfigured" };
  }
}

/** productId → Apple's own resource id (needed by every price endpoint). */
async function listAscProductIds(
  token: string,
  appId: string,
): Promise<{ ok: true; ids: Map<string, string> } | { ok: false; problem: ApplePriceProblem }> {
  const ids = new Map<string, string>();
  let url: string | null =
    `${API_BASE}/v1/apps/${encodeURIComponent(appId)}/inAppPurchasesV2` +
    `?fields%5BinAppPurchases%5D=productId&limit=${CATALOGUE_PAGE_SIZE}`;
  for (let page = 0; page < CATALOGUE_MAX_PAGES && url; page += 1) {
    const res = await ascCall("GET", url, token);
    if (!res.ok) return { ok: false, problem: res.problem };
    const body = (res.json ?? {}) as JsonApiPage;
    for (const row of body.data ?? []) {
      const productId = String(row?.attributes?.productId ?? "");
      if (productId && row.id) ids.set(productId, String(row.id));
    }
    url = nextUrl(body);
  }
  return { ok: true, ids };
}

/**
 * One product's Apple id, matched exactly: a filter that silently stopped
 * filtering must not hand back the first product in the account.
 */
async function findAscProductId(
  token: string,
  appId: string,
  productId: string,
): Promise<{ ok: true; ascId: string } | { ok: false; problem: ApplePriceProblem }> {
  const url =
    `${API_BASE}/v1/apps/${encodeURIComponent(appId)}/inAppPurchasesV2` +
    `?filter%5BproductId%5D=${encodeURIComponent(productId)}` +
    `&fields%5BinAppPurchases%5D=productId&limit=200`;
  const res = await ascCall("GET", url, token);
  if (!res.ok) return { ok: false, problem: res.problem };
  const row = ((res.json ?? {}) as JsonApiPage).data?.find(
    (r) => r?.attributes?.productId === productId,
  );
  if (!row?.id) return { ok: false, problem: "notCreated" };
  return { ok: true, ascId: String(row.id) };
}

/**
 * Cached for the life of the server instance: a territory's billing currency
 * changes on Apple's timescale (years), and re-reading a 175-row list before
 * every price write buys nothing. Only a SUCCESSFUL read is cached.
 */
let territoryCurrencyCache: { territory: string; currency: string } | null = null;

async function territoryCurrency(
  token: string,
  territory: string,
): Promise<{ ok: true; currency: string } | { ok: false; problem: ApplePriceProblem }> {
  if (territoryCurrencyCache?.territory === territory) {
    return { ok: true, currency: territoryCurrencyCache.currency };
  }
  // The whole list, matched here: filter[id] is not documented for this
  // resource (set-iap-prices.mjs learned that the hard way).
  let url: string | null = `${API_BASE}/v1/territories?limit=200`;
  for (let page = 0; page < 5 && url; page += 1) {
    const res = await ascCall("GET", url, token);
    if (!res.ok) return { ok: false, problem: res.problem };
    const body = (res.json ?? {}) as JsonApiPage;
    const row = (body.data ?? []).find((r) => r.id === territory);
    if (row) {
      const currency = String(row.attributes?.currency ?? "");
      if (!currency) return { ok: false, problem: "currencyMismatch" };
      territoryCurrencyCache = { territory, currency };
      return { ok: true, currency };
    }
    url = nextUrl(body);
  }
  return { ok: false, problem: "currencyMismatch" };
}

/**
 * The AZE price ladder for ONE product. Per product by necessity: a price point
 * id embeds the in-app purchase id, so a point fetched for another product is
 * not valid for a write. The VALUES are the same ladder for every product.
 */
export async function listAzePricePoints(
  token: string,
  ascId: string,
): Promise<{ ok: true; points: ApplePricePoint[] } | { ok: false; problem: ApplePriceProblem }> {
  const points: ApplePricePoint[] = [];
  let url: string | null =
    `${API_BASE}/v2/inAppPurchases/${encodeURIComponent(ascId)}/pricePoints` +
    `?filter%5Bterritory%5D=${APPLE_BASE_TERRITORY}` +
    `&fields%5BinAppPurchasePricePoints%5D=customerPrice&limit=8000`;
  for (let page = 0; page < 5 && url; page += 1) {
    const res = await ascCall("GET", url, token);
    if (!res.ok) return { ok: false, problem: res.problem };
    const body = (res.json ?? {}) as JsonApiPage;
    for (const row of body.data ?? []) {
      const customerPrice = String(row.attributes?.customerPrice ?? "");
      if (row.id && customerPrice) points.push({ id: String(row.id), customerPrice });
    }
    url = nextUrl(body);
  }
  return { ok: true, points };
}

/**
 * A price point id is base64 of a small JSON object naming its territory
 * (`{"s":"<iap id>","t":"AZE","p":"10012"}`). Decoding it is a CROSS-CHECK,
 * not a dependency: an id that does not decode is accepted, one that decodes to
 * a different territory is not.
 */
function pointTerritory(pointId: string): string | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(pointId.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as { t?: unknown };
    return typeof decoded.t === "string" ? decoded.t : null;
  } catch {
    return null;
  }
}

/**
 * The CURRENT base-territory price as Apple stores it, or null when no manual
 * price is set. Only the base territory carries a manual price in this
 * catalogue (everything else is equalized); a scheduled future change is
 * skipped by its startDate.
 */
export async function readCurrentAzePrice(
  token: string,
  ascId: string,
): Promise<{ ok: true; price: string | null } | { ok: false; problem: ApplePriceProblem }> {
  const res = await ascCall(
    "GET",
    `${API_BASE}/v1/inAppPurchasePriceSchedules/${encodeURIComponent(ascId)}/manualPrices` +
      `?include=inAppPurchasePricePoint&limit=200`,
    token,
  );
  if (!res.ok) {
    // A product that has never been priced has no schedule yet.
    if (res.problem === "notCreated") return { ok: true, price: null };
    return { ok: false, problem: res.problem };
  }
  const body = (res.json ?? {}) as JsonApiPage;
  const pointPrice = new Map<string, string>();
  for (const inc of body.included ?? []) {
    if (inc.type === "inAppPurchasePricePoints" && inc.id) {
      pointPrice.set(String(inc.id), String(inc.attributes?.customerPrice ?? ""));
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const row of body.data ?? []) {
    const start = row.attributes?.startDate;
    const end = row.attributes?.endDate;
    if (typeof start === "string" && start > today) continue;
    if (typeof end === "string" && end <= today) continue;
    const ref = row.relationships?.inAppPurchasePricePoint?.data?.id;
    if (!ref) continue;
    const territory = pointTerritory(String(ref));
    if (territory && territory !== APPLE_BASE_TERRITORY) continue;
    const price = pointPrice.get(String(ref));
    if (price) return { ok: true, price };
  }
  return { ok: true, price: null };
}

/**
 * The POST body. POST is the ONLY writer on this resource (no PATCH, no
 * DELETE): the schedule is always sent complete — base territory + one manual
 * price, effective immediately (startDate null) — and Apple equalizes the rest.
 */
export function buildApplePriceScheduleBody(ascId: string, pricePointId: string) {
  const placeholder = "${price1}";
  return {
    data: {
      type: "inAppPurchasePriceSchedules",
      relationships: {
        inAppPurchase: { data: { type: "inAppPurchases", id: ascId } },
        baseTerritory: { data: { type: "territories", id: APPLE_BASE_TERRITORY } },
        manualPrices: { data: [{ type: "inAppPurchasePrices", id: placeholder }] },
      },
    },
    included: [
      {
        type: "inAppPurchasePrices",
        id: placeholder,
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

/**
 * Move ONE product to the AZE price point nearest `targetUsd`.
 *
 * Order: credentials → product id → territory currency (must be USD) → ladder
 * → nearest point → current price (already there ⇒ no write) → POST → read
 * back. Every step that cannot be positively confirmed stops the write.
 */
export async function syncAppStorePrice(
  productId: string,
  targetUsd: number,
): Promise<AppleSyncResult> {
  const auth = tokenOrProblem();
  if (!auth.ok) return { ok: false, productId, problem: auth.problem };
  const { token, config } = auth;

  const found = await findAscProductId(token, config.appId, productId);
  if (!found.ok) return { ok: false, productId, problem: found.problem };

  const currency = await territoryCurrency(token, APPLE_BASE_TERRITORY);
  if (!currency.ok) return { ok: false, productId, problem: currency.problem };
  if (currency.currency !== APPLE_EXPECTED_CURRENCY) {
    // The target is a USD amount. Writing it into a storefront billed in
    // anything else would be exact in the wrong unit.
    return { ok: false, productId, problem: "currencyMismatch" };
  }

  const ladder = await listAzePricePoints(token, found.ascId);
  if (!ladder.ok) return { ok: false, productId, problem: ladder.problem };
  const point = chooseNearestPricePoint(ladder.points, targetUsd);
  if (!point) return { ok: false, productId, problem: "noPricePoint" };

  const current = await readCurrentAzePrice(token, found.ascId);
  if (!current.ok) {
    return { ok: false, productId, problem: current.problem, to: point.customerPrice };
  }
  const from = current.price;

  if (from !== null && sameCents(from, point.customerPrice)) {
    return {
      ok: true,
      productId,
      changed: false,
      from,
      to: point.customerPrice,
      currency: currency.currency,
    };
  }

  const write = await ascCall(
    "POST",
    `${API_BASE}/v1/inAppPurchasePriceSchedules`,
    token,
    buildApplePriceScheduleBody(found.ascId, point.id),
  );
  if (!write.ok) {
    return { ok: false, productId, problem: write.problem, from, to: point.customerPrice, attempted: true };
  }

  // "Apple returned 2xx" is not "the price is set".
  const readBack = await readCurrentAzePrice(token, found.ascId);
  if (
    !readBack.ok ||
    readBack.price === null ||
    !sameCents(readBack.price, point.customerPrice)
  ) {
    return {
      ok: false,
      productId,
      problem: "verifyFailed",
      from,
      to: point.customerPrice,
      attempted: true,
    };
  }
  return {
    ok: true,
    productId,
    changed: true,
    from,
    to: readBack.price,
    currency: currency.currency,
  };
}

export type AppleLivePrices =
  | {
      readonly ok: true;
      /** productId → live base-territory price (null = none set). Absent = Apple has no such product. */
      readonly prices: Map<string, string | null>;
      /** The AZE ladder VALUES (shared by every product), for the nearest-point test. */
      readonly ladder: ApplePricePoint[];
      readonly currency: string;
    }
  | { readonly ok: false; readonly problem: ApplePriceProblem };

/** Bounded-concurrency map — Apple rate-limits bursts. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Live AZE prices for a set of product ids. READ-ONLY.
 *
 * One catalogue read for the Apple ids, ONE ladder read (display needs only
 * the values, which every product shares), and one schedule read per product
 * with at most four in flight.
 */
export async function readAppStorePrices(
  productIds: readonly string[],
): Promise<AppleLivePrices> {
  const auth = tokenOrProblem();
  if (!auth.ok) return { ok: false, problem: auth.problem };
  const { token, config } = auth;

  const catalogue = await listAscProductIds(token, config.appId);
  if (!catalogue.ok) return { ok: false, problem: catalogue.problem };
  const currency = await territoryCurrency(token, APPLE_BASE_TERRITORY);
  if (!currency.ok) return { ok: false, problem: currency.problem };

  const present = productIds.filter((p) => catalogue.ids.has(p));
  let ladder: ApplePricePoint[] = [];
  if (present.length > 0) {
    const lad = await listAzePricePoints(token, catalogue.ids.get(present[0]) as string);
    if (!lad.ok) return { ok: false, problem: lad.problem };
    ladder = lad.points;
  }

  const reads = await mapLimit(present, 4, async (productId) => ({
    productId,
    r: await readCurrentAzePrice(token, catalogue.ids.get(productId) as string),
  }));
  const prices = new Map<string, string | null>();
  for (const { productId, r } of reads) {
    // A failed read is a whole-store problem, never a missing row: an absent
    // product id means "Apple does not have it", and an unreadable schedule
    // must not be reported as that.
    if (!r.ok) return { ok: false, problem: r.problem };
    prices.set(productId, r.price);
  }
  return { ok: true, prices, ladder, currency: currency.currency };
}
