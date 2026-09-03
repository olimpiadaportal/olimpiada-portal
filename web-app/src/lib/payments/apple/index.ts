// Apple in-app-purchase verification — the module's front door.
//
// THE SHAPE OF A CORRECT CALLER, in the order the steps must happen:
//
//   1. Signed data arrives (a notification POST, or a transaction id the app
//      handed up). Read `railForSignedData(signed)` to learn which rail it
//      CLAIMS to belong to. That claim is untrusted and is used for routing and
//      nothing else.
//   2. Verify on that rail. A verified notification tells you a transaction id.
//      IT TELLS YOU NOTHING ELSE THAT YOU MAY ACT ON.
//   3. RE-QUERY: `rail.api.getTransactionInfo(transactionId)`, then verify the
//      blob that comes back with `source: "requery"`. This is the same posture
//      the AzeriCard callback takes toward the bank — the ping says "something
//      happened", and only our own question gets an answer we believe.
//   4. `toAppleGrant({ transaction, expectedBundleId, expectedKind, interval })`
//      where `expectedKind` and `interval` come from OUR product catalog, never
//      from the payload.
//   5. `requireProductionGrant(grant)` before anything is written that grants
//      access. A sandbox grant may be recorded; it may never be honoured.
//
// EXPORTS ARE SPLIT BY PURITY. Everything re-exported below is pure and
// testable without a key; the server-only pieces (`config`, `client`,
// `verifier`, `rails`) are imported directly by the route handlers that need
// them, so that importing this barrel from a shared module cannot drag a secret
// reader into a client bundle.
export {
  APPLE_ENVIRONMENTS,
  APPLE_PRODUCT_TYPE,
  APP_STORE_SERVER_API_BASE_URL,
  APP_STORE_SERVER_API_LEGACY_BASE_URL,
  isAppleEnvironment,
  type AppleEnvironment,
  type AppleTransactionPayload,
  type TransactionSource,
  type VerifiedTransaction,
} from "./environment";

export {
  APPLE_GRANT_CALENDAR_TIME_ZONE,
  PURCHASE_DATE_MAX_MS,
  PURCHASE_DATE_MIN_MS,
  addCalendarMonthsUtc,
  computeEndsAt,
  isPlausiblePurchaseDateMs,
} from "./expiry";

export {
  isRevoked,
  requireProductionGrant,
  toAppleGrant,
  type AppleGrant,
  type AppleGrantKind,
  type AppleGrantRejection,
  type AppleGrantRequest,
  type AppleGrantResult,
} from "./transaction";

export {
  JWS_ALGORITHM,
  JWS_MAX_BYTES,
  base64UrlDecode,
  base64UrlEncode,
  decodeJwsUnverified,
  leafCertificatePem,
  parseCompactJws,
  verifyJwsAgainstEmbeddedLeaf,
  verifyJwsEs256,
  type CompactJws,
  type JwsHeader,
} from "./jws";

export {
  APP_STORE_JWT_AUDIENCE,
  APP_STORE_JWT_DEFAULT_LIFETIME_SECONDS,
  APP_STORE_JWT_MAX_LIFETIME_SECONDS,
  loadEs256PrivateKey,
  signAppStoreJwt,
  type AppStoreJwtClaims,
  type AppStoreJwtOptions,
} from "./jwt";
