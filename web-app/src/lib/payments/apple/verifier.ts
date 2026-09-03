// JWS VERIFICATION of Apple signed data — SERVER ONLY.
//
// THE ONE THING WE DO NOT HAND-ROLL. Apple signs transactions and server
// notifications with a leaf certificate whose chain must be validated up to the
// Apple Root CA, with the App Store signing extension OID checked along the way.
// Chain validation written by hand is the archetypal security code that is
// subtly wrong and catastrophically so — it compiles, it passes the happy-path
// test, and it accepts a certificate an attacker minted. So this file delegates
// the whole of it to Apple's own maintained library and does nothing clever:
//
//     @apple/app-store-server-library  v3.1.0  (MIT, Apple, Node 16+)
//
// THIS IS THE ONLY MODULE IN `payments/apple/` THAT IMPORTS THAT PACKAGE. Every
// other file here — the grant rules, the expiry arithmetic, the JWT, the JWS
// parsing — is free of it and therefore unit-testable with nothing but
// `node:crypto`. Keeping the dependency to one file is also what makes it
// replaceable if Apple ever abandons the library.
//
// WHAT VERIFICATION DOES AND DOES NOT BUY. It proves the message is genuinely
// Apple's. It does NOT make the message an authority on what we should do. A
// verified NOTIFICATION is still a "go and check" ping — the same posture
// `azericard/callback.ts` takes toward the bank's BACKREF post — which is why
// `verifyNotification` tags its result `source: "notification"` and
// `toAppleGrant` refuses to act on it. Only a re-queried transaction is
// grantable.
import "server-only";
import {
  Environment as AppleLibraryEnvironment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { getAppleIapConfig, getAppleRootCertificates } from "./config";
import { decodeJwsUnverified } from "./jws";
import {
  isAppleEnvironment,
  type AppleEnvironment,
  type AppleTransactionPayload,
  type TransactionSource,
  type VerifiedTransaction,
} from "./environment";

const LIBRARY_ENVIRONMENT: Record<AppleEnvironment, AppleLibraryEnvironment> = {
  Production: AppleLibraryEnvironment.PRODUCTION,
  Sandbox: AppleLibraryEnvironment.SANDBOX,
};

/**
 * Online (OCSP) revocation checking, per rail.
 *
 * PRODUCTION: on. A revoked Apple signing certificate is the scenario the check
 * exists for, and production is where money and access are.
 *
 * SANDBOX: off. Nothing sandbox signs can grant anything (see
 * `requireProductionGrant`), so the check protects nothing there — while an OCSP
 * outage during App Review would fail every reviewer purchase and read to Apple
 * as a broken app. Availability is worth more than a revocation check on a rail
 * that cannot grant.
 */
const ONLINE_CHECKS: Record<AppleEnvironment, boolean> = {
  Production: true,
  Sandbox: false,
};

/**
 * Which rail should verify this blob?
 *
 * Reads the UNVERIFIED `environment` claim, and that is safe for exactly one
 * purpose: choosing a verifier. Lying about it does not help an attacker —
 * claiming "Production" sends the blob to the production verifier, where the
 * chain check fails; claiming "Sandbox" gets it verified on a rail whose grants
 * are structurally inert. Nothing else in the platform may read this value.
 */
export function railForSignedData(signed: string): AppleEnvironment | null {
  const decoded = decodeJwsUnverified<{ environment?: unknown; data?: { environment?: unknown } }>(
    signed,
  );
  if (!decoded) return null;
  // A transaction carries `environment` at the top level; a notification carries
  // it inside `data`.
  const claimed = decoded.payload?.environment ?? decoded.payload?.data?.environment;
  return isAppleEnvironment(claimed) ? claimed : null;
}

/**
 * Copy Apple's decoded payload onto OUR shape.
 *
 * Not a cast: the library's enum-typed fields are widened to plain strings so
 * that the pure modules downstream never need the library's types, and so that
 * an unknown future enum member arrives as a string rather than crashing a
 * narrowing. `toAppleGrant` compares those strings against what it expects and
 * refuses anything else.
 */
function toOurPayload(p: JWSTransactionDecodedPayload): AppleTransactionPayload {
  return {
    transactionId: p.transactionId,
    originalTransactionId: p.originalTransactionId,
    bundleId: p.bundleId,
    productId: p.productId,
    purchaseDate: p.purchaseDate,
    originalPurchaseDate: p.originalPurchaseDate,
    expiresDate: p.expiresDate,
    quantity: p.quantity,
    type: p.type === undefined ? undefined : String(p.type),
    appAccountToken: p.appAccountToken,
    inAppOwnershipType: p.inAppOwnershipType === undefined ? undefined : String(p.inAppOwnershipType),
    signedDate: p.signedDate,
    revocationDate: p.revocationDate,
    revocationReason: typeof p.revocationReason === "number" ? p.revocationReason : undefined,
    environment: p.environment === undefined ? undefined : String(p.environment),
    storefront: p.storefront,
    transactionReason: p.transactionReason === undefined ? undefined : String(p.transactionReason),
    currency: p.currency,
    price: p.price,
  };
}

/**
 * A verifier bound to one rail.
 *
 * Built per call rather than cached: `SignedDataVerifier` holds the root
 * certificates and the app identity, both of which come from `config.ts`, and
 * the cost is a certificate parse. Caching it would be a small win and a place
 * for a stale configuration to survive a redeploy.
 */
function buildVerifier(environment: AppleEnvironment): SignedDataVerifier | null {
  const config = getAppleIapConfig();
  const roots = getAppleRootCertificates();
  if (!config || !roots) return null;
  try {
    return new SignedDataVerifier(
      roots,
      ONLINE_CHECKS[environment],
      LIBRARY_ENVIRONMENT[environment],
      config.bundleId,
      config.appAppleId,
    );
  } catch {
    return null;
  }
}

/**
 * The verification half of one rail.
 *
 * Every method returns null on any failure. A malformed blob, an untrusted
 * chain, a wrong bundle id and a wrong environment are all "not verified" and
 * the caller must treat them identically — a distinction here would be an
 * oracle, and the library's `VerificationException` carries chain detail that
 * has no business in a log line, let alone a response.
 */
export function createAppleVerifier<E extends AppleEnvironment>(environment: E) {
  return {
    environment,

    /**
     * Verify a signed transaction blob.
     *
     * `source` is required and unforgiving on purpose. Pass `"requery"` ONLY for
     * a blob that came back from `client.getTransactionInfo`. Anything lifted
     * out of a notification body or handed up by the app is `"notification"` or
     * `"client"`, and `toAppleGrant` will refuse it however valid the signature.
     */
    async verifyTransaction(
      signedTransactionInfo: string,
      source: TransactionSource,
    ): Promise<VerifiedTransaction<E> | null> {
      const verifier = buildVerifier(environment);
      if (!verifier) return null;
      let decoded: JWSTransactionDecodedPayload;
      try {
        decoded = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
      } catch {
        return null;
      }
      return { environment, source, payload: toOurPayload(decoded) };
    },

    /**
     * Verify a server notification body.
     *
     * Returns the decoded notification so the route can read `notificationType`
     * (REFUND / REVOKE is the only one that matters for a non-renewing product)
     * and the transaction id inside it. THE ROUTE MUST THEN RE-QUERY. Nothing in
     * the returned object may become access on its own.
     */
    async verifyNotification(
      signedPayload: string,
    ): Promise<ResponseBodyV2DecodedPayload | null> {
      const verifier = buildVerifier(environment);
      if (!verifier) return null;
      try {
        return await verifier.verifyAndDecodeNotification(signedPayload);
      } catch {
        return null;
      }
    },
  };
}

export type AppleVerifier<E extends AppleEnvironment> = ReturnType<typeof createAppleVerifier<E>>;
