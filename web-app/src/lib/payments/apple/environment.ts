// Apple's two server environments — and the reason they are a TYPE here and not
// an `if`.
//
// THE PROBLEM. App Review testers exercise the app against SANDBOX StoreKit,
// but their signed transactions arrive at OUR PRODUCTION SERVER, because that is
// the only server the shipped binary knows. So "which environment is this
// deployment?" is the wrong question: a single production deployment must be
// able to VERIFY a sandbox transaction (otherwise review fails) while being
// structurally incapable of GRANTING production access from one (otherwise
// anyone with a sandbox Apple ID gets a free year).
//
// THE SHAPE OF THE FIX. Both rails are built, always. Everything downstream is
// generic in the environment: a `VerifiedTransaction<"Sandbox">` produces an
// `AppleGrant<"Sandbox">`, and the function that writes a real entitlement takes
// an `AppleGrant<"Production">`. There is no assignment between them and no
// runtime flag that could be flipped — the only way from one to the other is
// `requireProductionGrant()`, which is one greppable name.
//
// Pure by design: no env var, no `server-only`, no I/O. The environment split
// must be unit-testable without a key in the process.

/** The two environments the platform acts on. Xcode/LocalTesting are never real. */
export const APPLE_ENVIRONMENTS = ["Production", "Sandbox"] as const;

/**
 * Spelled exactly as Apple spells it in the signed payload's `environment`
 * field ("Production" / "Sandbox"), so a comparison against the payload needs no
 * normalisation step that could be got wrong in one direction only.
 */
export type AppleEnvironment = (typeof APPLE_ENVIRONMENTS)[number];

export function isAppleEnvironment(value: unknown): value is AppleEnvironment {
  return typeof value === "string" && (APPLE_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * App Store Server API hosts.
 *
 * These are the values Apple's OWN current server libraries use — verified
 * against `apple/app-store-server-library-node` v3.1.0 and the Python library on
 * 2026-08-31. Apple's prose documentation still shows the older
 * `api.storekit.itunes.apple.com` / `api.storekit-sandbox.itunes.apple.com`
 * names; both resolve today, and the short form is the one Apple's shipping code
 * uses. Kept as literal constants rather than an env var ON PURPOSE: a
 * configurable base URL is a way to point the production rail at sandbox, which
 * is precisely the failure the rest of this module exists to make impossible.
 */
export const APP_STORE_SERVER_API_BASE_URL: Record<AppleEnvironment, string> = {
  Production: "https://api.storekit.apple.com",
  Sandbox: "https://api.storekit-sandbox.apple.com",
};

/** The legacy hostnames, for the operator who has to read a firewall rule. Unused. */
export const APP_STORE_SERVER_API_LEGACY_BASE_URL: Record<AppleEnvironment, string> = {
  Production: "https://api.storekit.itunes.apple.com",
  Sandbox: "https://api.storekit-sandbox.itunes.apple.com",
};

/**
 * Where a piece of signed data came from.
 *
 * `notification` and `client` are NOT grantable, and that is enforced in the
 * type system by `toAppleGrant` refusing anything but `requery`. This is the
 * AzeriCard doctrine transplanted: the callback (there) and the App Store Server
 * Notification (here) are both "go and check" pings. A valid signature proves
 * the message is genuine; it does not make the message an authority on what we
 * should do. We re-query Apple and believe only the answer.
 */
export type TransactionSource = "requery" | "notification" | "client";

/**
 * A signed transaction whose signature and certificate chain have been verified
 * on the rail named by `environment`.
 *
 * `environment` is the RAIL's environment, not a copy of the payload's claim.
 * `toAppleGrant` re-checks that the payload agrees; a sandbox JWS handed to the
 * production verifier fails the chain check first, and would fail this second.
 */
export type VerifiedTransaction<E extends AppleEnvironment = AppleEnvironment> = {
  readonly environment: E;
  readonly source: TransactionSource;
  readonly payload: AppleTransactionPayload;
};

/**
 * The fields of Apple's `JWSTransactionDecodedPayload` that this platform reads.
 *
 * DEFINED HERE rather than imported from `@apple/app-store-server-library` so
 * that every pure module — and therefore every test — is free of that
 * dependency. `verifier.ts` is the one place that maps Apple's type onto this
 * one. Everything is optional because everything in Apple's type is optional;
 * `toAppleGrant` is what turns "optional" into "present and sane or rejected".
 */
export type AppleTransactionPayload = {
  transactionId?: string;
  originalTransactionId?: string;
  bundleId?: string;
  productId?: string;
  /** UNIX milliseconds. */
  purchaseDate?: number;
  originalPurchaseDate?: number;
  /**
   * Present for AUTO-RENEWABLE subscriptions only. Our subscription products are
   * NON-RENEWING, so this is absent and the expiry is ours to compute — see
   * `expiry.ts`. Typed so that a future reader can see it was considered.
   */
  expiresDate?: number;
  quantity?: number;
  /** "Non-Renewing Subscription" | "Non-Consumable" | … */
  type?: string;
  /** OUR checkout intent id, round-tripped through StoreKit. */
  appAccountToken?: string;
  inAppOwnershipType?: string;
  signedDate?: number;
  /** Set when Apple refunded or revoked. A grant must never survive this. */
  revocationDate?: number;
  revocationReason?: number;
  environment?: string;
  storefront?: string;
  transactionReason?: string;
  currency?: string;
  /** Milliunits. Recorded for reconciliation; never used to decide access. */
  price?: number;
};

/** Apple's `Type` values, spelled as they appear in the payload. */
export const APPLE_PRODUCT_TYPE = {
  NON_RENEWING_SUBSCRIPTION: "Non-Renewing Subscription",
  NON_CONSUMABLE: "Non-Consumable",
  AUTO_RENEWABLE_SUBSCRIPTION: "Auto-Renewable Subscription",
  CONSUMABLE: "Consumable",
} as const;
