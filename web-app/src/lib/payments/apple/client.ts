// Talking to the App Store Server API — SERVER ONLY.
//
// THIS IS THE "GO AND CHECK" CALL. It is to Apple what the AzeriCard TRTYPE 90
// status query is to the bank: a request WE initiate, to a host WE named, about
// a transaction id WE are asking after. Nothing in the platform may treat an
// Apple purchase as real on weaker evidence than an answer from here — not a
// StoreKit receipt handed up by the app, and not the body of a signed server
// notification.
//
// WHAT IS DELIBERATELY NOT HERE
//   * NO SUBSCRIPTION-STATUS POLLING. "Get All Subscription Statuses" covers
//     AUTO-RENEWABLE products only. Our subscriptions are NON-RENEWING by owner
//     decision (2026-08-31, because Apple allows one active subscription per
//     group per Apple ID and this product is per child), so that endpoint would
//     return nothing useful and its absence is the point rather than an omission.
//     A non-renewing subscription is a one-shot transaction; the expiry is
//     computed in `expiry.ts`.
//   * No renewal, grace-period or billing-retry handling. Those events do not
//     exist for this product type. REFUND / REVOKE does, and is handled by the
//     notification route through `isRevoked`.
//   * No entitlement, no access, no database. This layer records facts about
//     transactions; granting is somebody else's function and takes an
//     `AppleGrant<"Production">`.
//
// WHY A SMALL CLIENT RATHER THAN THE ONE IN APPLE'S LIBRARY. Apple's library is
// used for the part that must not be hand-rolled — certificate-chain validation,
// in `verifier.ts`. Its API client is a thin fetch wrapper over three endpoints
// we need, and adopting it would put the signing key in a SECOND place that
// holds it. One key holder (`config.ts`) and one call site is worth more here
// than the wrapper. Swapping it in later is a change to this file alone.
import "server-only";
import { getAppleIapConfig, getIapPrivateKeyPem } from "./config";
import { signAppStoreJwt } from "./jwt";
import { APP_STORE_SERVER_API_BASE_URL, type AppleEnvironment } from "./environment";

const REQUEST_TIMEOUT_MS = 15_000;
/** Apple's largest response here is a history page of ~20 signed transactions. */
const RESPONSE_MAX_BYTES = 1024 * 1024;

/**
 * Failure modes the caller can act on. `apiError` is Apple's numeric errorCode
 * when there was one; Apple's `errorMessage` is deliberately DROPPED and never
 * propagated, because a message from an upstream system is exactly the kind of
 * internal detail that ends up in a user-facing response.
 */
export type AppStoreApiFailure = {
  readonly ok: false;
  readonly error: "not_configured" | "sign_failed" | "network" | "http_error" | "malformed_response";
  readonly status: number | null;
  readonly apiError: number | null;
};

export type AppStoreApiSuccess<T> = { readonly ok: true; readonly data: T };
export type AppStoreApiResult<T> = AppStoreApiSuccess<T> | AppStoreApiFailure;

/**
 * A signed blob that has NOT been verified yet, tagged with the rail it came
 * from. The tag is what forces the caller to verify on the matching rail: a
 * `Sandbox` envelope cannot be handed to the production verifier without an
 * explicit cast that a reviewer would see.
 */
export type SignedTransactionEnvelope<E extends AppleEnvironment> = {
  readonly environment: E;
  readonly signedTransactionInfo: string;
};

export type SignedTransactionPage<E extends AppleEnvironment> = {
  readonly environment: E;
  readonly revision: string | null;
  readonly hasMore: boolean;
  readonly signedTransactions: readonly string[];
};

export type TestNotificationHandle<E extends AppleEnvironment> = {
  readonly environment: E;
  readonly testNotificationToken: string;
};

/** Filters for Get Transaction History. Mirrors Apple's query parameters. */
export type TransactionHistoryQuery = {
  readonly revision?: string | null;
  readonly startDate?: number;
  readonly endDate?: number;
  readonly productIds?: readonly string[];
  readonly productTypes?: readonly ("AUTO_RENEWABLE" | "NON_RENEWABLE" | "CONSUMABLE" | "NON_CONSUMABLE")[];
  readonly sort?: "ASCENDING" | "DESCENDING";
  readonly inAppOwnershipType?: "FAMILY_SHARED" | "PURCHASED";
  readonly revoked?: boolean;
};

function failure(
  error: AppStoreApiFailure["error"],
  status: number | null = null,
  apiError: number | null = null,
): AppStoreApiFailure {
  return { ok: false, error, status, apiError };
}

/**
 * One authenticated GET/POST against a rail.
 *
 * The bearer token is minted per call (five-minute life) and exists only as a
 * local. It is never logged, never returned and never attached to an error.
 */
async function request(
  environment: AppleEnvironment,
  method: "GET" | "POST",
  path: string,
): Promise<AppStoreApiResult<unknown>> {
  const config = getAppleIapConfig();
  const privateKeyPem = getIapPrivateKeyPem();
  if (!config || !privateKeyPem) return failure("not_configured");

  let token: string;
  try {
    token = signAppStoreJwt(privateKeyPem, {
      issuerId: config.issuerId,
      keyId: config.keyId,
      bundleId: config.bundleId,
    });
  } catch {
    // The thrown Error is content-free by construction; dropped anyway.
    return failure("sign_failed");
  }

  let response: Response;
  try {
    response = await fetch(`${APP_STORE_SERVER_API_BASE_URL[environment]}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      // A redirect is not an answer to the question we asked.
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return failure("network");
  }

  let text: string;
  try {
    text = (await response.text()).slice(0, RESPONSE_MAX_BYTES);
  } catch {
    return failure("network");
  }

  let body: unknown = undefined;
  if (text.trim() !== "") {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = undefined;
    }
  }

  if (!response.ok) {
    const apiError =
      typeof body === "object" && body !== null && typeof (body as { errorCode?: unknown }).errorCode === "number"
        ? ((body as { errorCode: number }).errorCode)
        : null;
    return failure("http_error", response.status, apiError);
  }

  return { ok: true, data: body };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Apple transaction ids are numeric strings; bound them before they reach a URL.
 * Same 100-character bound as `transaction.ts`, which matches the database's own
 * constraint — the three places must not disagree about what an id may be.
 */
const TRANSACTION_ID_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * The three endpoints a NON-RENEWING product actually needs, bound to one rail.
 *
 * `environment` is a type parameter, not a field to compare at each call site:
 * everything this returns carries it, so a sandbox answer cannot be mistaken for
 * a production one further down without a visible cast.
 */
export function createAppStoreApi<E extends AppleEnvironment>(environment: E) {
  return {
    environment,

    /**
     * Get Transaction Info — `GET /inApps/v1/transactions/{transactionId}`.
     *
     * THE AUTHORITATIVE STEP. Everything the platform believes about an Apple
     * purchase starts with the signed blob this returns, verified on this rail.
     */
    async getTransactionInfo(
      transactionId: string,
    ): Promise<AppStoreApiResult<SignedTransactionEnvelope<E>>> {
      if (!TRANSACTION_ID_RE.test(transactionId)) return failure("malformed_response");
      const result = await request(
        environment,
        "GET",
        `/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
      );
      if (!result.ok) return result;
      const signed = isRecord(result.data) ? result.data.signedTransactionInfo : undefined;
      if (typeof signed !== "string" || signed === "") return failure("malformed_response");
      return { ok: true, data: { environment, signedTransactionInfo: signed } };
    },

    /**
     * Get Transaction History — `GET /inApps/v2/history/{transactionId}`.
     *
     * v2 explicitly: v1 is deprecated and orders its pages differently. Used for
     * reconciliation and support ("what did this family actually buy"), never as
     * the trigger for a grant.
     */
    async getTransactionHistory(
      anyTransactionId: string,
      query: TransactionHistoryQuery = {},
    ): Promise<AppStoreApiResult<SignedTransactionPage<E>>> {
      if (!TRANSACTION_ID_RE.test(anyTransactionId)) return failure("malformed_response");

      const params = new URLSearchParams();
      if (query.revision) params.set("revision", query.revision);
      if (query.startDate !== undefined) params.set("startDate", String(query.startDate));
      if (query.endDate !== undefined) params.set("endDate", String(query.endDate));
      // Apple takes repeated keys for these two rather than a comma list.
      for (const id of query.productIds ?? []) params.append("productId", id);
      for (const t of query.productTypes ?? []) params.append("productType", t);
      if (query.sort) params.set("sort", query.sort);
      if (query.inAppOwnershipType) params.set("inAppOwnershipType", query.inAppOwnershipType);
      if (query.revoked !== undefined) params.set("revoked", String(query.revoked));

      const qs = params.toString();
      const result = await request(
        environment,
        "GET",
        `/inApps/v2/history/${encodeURIComponent(anyTransactionId)}${qs ? `?${qs}` : ""}`,
      );
      if (!result.ok) return result;
      if (!isRecord(result.data)) return failure("malformed_response");

      const raw = result.data.signedTransactions;
      if (!Array.isArray(raw)) return failure("malformed_response");
      const signedTransactions = raw.filter((t): t is string => typeof t === "string" && t !== "");

      return {
        ok: true,
        data: {
          environment,
          revision: typeof result.data.revision === "string" ? result.data.revision : null,
          hasMore: result.data.hasMore === true,
          signedTransactions,
        },
      };
    },

    /**
     * Request a Test Notification — `POST /inApps/v1/notifications/test`.
     *
     * The only way to prove the notification URL is reachable and that our
     * verifier accepts a real Apple signature, WITHOUT a purchase. Operationally
     * this is what gets run after deploying the notification route and after any
     * change to the root-certificate configuration.
     */
    async requestTestNotification(): Promise<AppStoreApiResult<TestNotificationHandle<E>>> {
      const result = await request(environment, "POST", "/inApps/v1/notifications/test");
      if (!result.ok) return result;
      const token = isRecord(result.data) ? result.data.testNotificationToken : undefined;
      if (typeof token !== "string" || token === "") return failure("malformed_response");
      return { ok: true, data: { environment, testNotificationToken: token } };
    },
  };
}

export type AppStoreApi<E extends AppleEnvironment> = ReturnType<typeof createAppStoreApi<E>>;
