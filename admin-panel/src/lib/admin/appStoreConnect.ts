import "server-only";

// ---------------------------------------------------------------------------
// APP STORE CONNECT — read-only. Two readers, one credential set:
//
//   preflightStoreProduct()  — asks about ONE product before it is offered.
//   fetchStoreCatalogue()    — reads the WHOLE app's product list so the admin
//                              screen can mirror Apple's answer next to ours.
//
// NOTHING IN THIS MODULE WRITES TO APPLE, and nothing anywhere in this
// repository does from a request: products are created by the local script
// mobile-app/scripts/create-iap-products.mjs, run by hand by the owner. Do not
// add a POST/PATCH here to "save the admin a step" — an admin screen that
// appears to change App Store Connect, and does not, is the divergence this
// module exists to expose.
//
// WHY THIS EXISTS. `iap_products.active` is a switch in OUR database. Nothing
// about it consults Apple, so before this module the admin panel would happily
// put on sale a product id that App Store Connect has never heard of. The app
// then lists a product StoreKit cannot resolve and every tap fails — and Apple
// reviews the buy button, not our intentions. That is a 3.1.1 rejection with
// the whole rail already built.
//
// WHAT IT CHECKS, AND WHAT IT DELIBERATELY DOES NOT.
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
// ---------------------------------------------------------------------------
import crypto from "node:crypto";

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
