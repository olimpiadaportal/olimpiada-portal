// Talking to the Google Play Developer API (Android Publisher v3) — SERVER ONLY.
//
// THIS IS THE "GO AND CHECK" CALL, the twin of apple/client.ts: a request WE
// initiate, to a host WE name, authenticated as OUR service account, about a
// purchase token the app or a notification only told us about. Nothing in the
// platform treats a Play purchase as real on weaker evidence than an answer
// from here.
//
// FOUR ENDPOINTS, the ones a one-time consumable product needs:
//   purchases.products.get          what Google knows about this purchase
//   purchases.products.consume      settle it (consumption IS acknowledgement,
//                                   and lets the same subject be bought again
//                                   next cycle)
//   purchases.products.acknowledge  the fallback when consume fails, so a
//                                   purchase we already delivered is not
//                                   auto-refunded by Google after three days
//   purchases.voidedpurchases.list  refunds and chargebacks, for the sweep
//
// Google's error bodies are DROPPED: only the HTTP status leaves this module,
// because an upstream message is exactly the kind of detail that ends up in a
// client response. The access token and the purchase token are never logged.
import "server-only";
import { getGooglePlayConfig } from "./config";
import {
  getAndroidPublisherAccessToken,
  invalidateAndroidPublisherAccessToken,
} from "./oauth";
import { PLAY_PRODUCT_ID_RE, PURCHASE_TOKEN_RE, type ProductPurchase } from "./purchase";

export const ANDROID_PUBLISHER_BASE_URL =
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

const REQUEST_TIMEOUT_MS = 15_000;
const RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

export type PlayApiFailure = {
  readonly ok: false;
  readonly error: "not_configured" | "malformed_request" | "auth_failed" | "network" | "http_error" | "malformed_response";
  readonly status: number | null;
};
export type PlayApiResult<T> = { readonly ok: true; readonly data: T } | PlayApiFailure;

export type VoidedPurchase = {
  readonly purchaseToken: string | null;
  readonly orderId: string | null;
  readonly voidedTimeMillis: number | null;
  /** 0 user, 1 developer, 2 Google. */
  readonly voidedSource: number | null;
  readonly voidedReason: number | null;
};

export type VoidedPurchasePage = {
  readonly voidedPurchases: readonly VoidedPurchase[];
  readonly nextPageToken: string | null;
};

function failure(error: PlayApiFailure["error"], status: number | null = null): PlayApiFailure {
  return { ok: false, error, status };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function request(
  method: "GET" | "POST",
  pathAndQuery: string,
  body?: Record<string, unknown>,
): Promise<PlayApiResult<unknown>> {
  const config = getGooglePlayConfig();
  if (!config) return failure("not_configured");
  const token = await getAndroidPublisherAccessToken();
  if (!token) return failure("auth_failed");

  let response: Response;
  try {
    response = await fetch(
      `${ANDROID_PUBLISHER_BASE_URL}/${encodeURIComponent(config.packageName)}${pathAndQuery}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      },
    );
  } catch {
    return failure("network");
  }

  let text = "";
  try {
    text = (await response.text()).slice(0, RESPONSE_MAX_BYTES);
  } catch {
    return failure("network");
  }

  if (!response.ok) {
    // A token we believed valid was refused — mint a fresh one next time.
    if (response.status === 401) invalidateAndroidPublisherAccessToken();
    return failure("http_error", response.status);
  }
  if (text.trim() === "") return { ok: true, data: {} };
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return failure("malformed_response", response.status);
  }
}

function purchasePath(productId: string, purchaseToken: string): string | null {
  if (!PLAY_PRODUCT_ID_RE.test(productId) || !PURCHASE_TOKEN_RE.test(purchaseToken)) return null;
  return `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
}

/**
 * purchases.products.get — THE AUTHORITATIVE STEP. Everything the platform
 * believes about a Play purchase starts with the resource this returns.
 */
export async function getProductPurchase(
  productId: string,
  purchaseToken: string,
): Promise<PlayApiResult<ProductPurchase>> {
  const path = purchasePath(productId, purchaseToken);
  if (!path) return failure("malformed_request");
  const result = await request("GET", path);
  if (!result.ok) return result;
  if (!isRecord(result.data)) return failure("malformed_response");
  return { ok: true, data: result.data as ProductPurchase };
}

/** purchases.products.consume — settles the purchase on Google's side. */
export async function consumeProductPurchase(
  productId: string,
  purchaseToken: string,
): Promise<PlayApiResult<null>> {
  const path = purchasePath(productId, purchaseToken);
  if (!path) return failure("malformed_request");
  const result = await request("POST", `${path}:consume`);
  return result.ok ? { ok: true, data: null } : result;
}

/** purchases.products.acknowledge — stops Google's three-day auto-refund. */
export async function acknowledgeProductPurchase(
  productId: string,
  purchaseToken: string,
): Promise<PlayApiResult<null>> {
  const path = purchasePath(productId, purchaseToken);
  if (!path) return failure("malformed_request");
  const result = await request("POST", `${path}:acknowledge`, {});
  return result.ok ? { ok: true, data: null } : result;
}

function asIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\d{1,16}$/.test(v)) return Number(v);
  return null;
}

/**
 * purchases.voidedpurchases.list — refunds, chargebacks and revocations.
 *
 * `type=0` (one-time products only: this platform sells no Play
 * subscriptions). No startTime: Google's default window is the last 30 days,
 * which is also the furthest back it will answer.
 */
export async function listVoidedPurchases(
  pageToken: string | null,
  maxResults = 1000,
): Promise<PlayApiResult<VoidedPurchasePage>> {
  const params = new URLSearchParams({ type: "0", maxResults: String(maxResults) });
  if (pageToken) {
    if (!/^[A-Za-z0-9._=-]{1,2000}$/.test(pageToken)) return failure("malformed_request");
    params.set("token", pageToken);
  }
  const result = await request("GET", `/purchases/voidedpurchases?${params.toString()}`);
  if (!result.ok) return result;
  if (!isRecord(result.data)) return failure("malformed_response");
  const raw = result.data.voidedPurchases;
  const list = Array.isArray(raw) ? raw : [];
  const voidedPurchases: VoidedPurchase[] = list.filter(isRecord).map((v) => ({
    purchaseToken: typeof v.purchaseToken === "string" ? v.purchaseToken : null,
    orderId: typeof v.orderId === "string" ? v.orderId : null,
    voidedTimeMillis: asIntOrNull(v.voidedTimeMillis),
    voidedSource: asIntOrNull(v.voidedSource),
    voidedReason: asIntOrNull(v.voidedReason),
  }));
  const pagination = isRecord(result.data.tokenPagination) ? result.data.tokenPagination : null;
  const next = pagination && typeof pagination.nextPageToken === "string" ? pagination.nextPageToken : null;
  return { ok: true, data: { voidedPurchases, nextPageToken: next } };
}
