// AzeriCard / ABB configuration — SERVER ONLY.
//
// The `server-only` import makes the build FAIL if this module is ever pulled
// into client code. Everything it reads is a server secret or a value that
// would tell an attacker how to shape a forged message, so none of it may reach
// a browser bundle and none of it is ever returned to a client.
//
// NOTHING HERE IS EVER LOGGED OR RETURNED. `describeConfigProblems()` reports
// only the NAME of a variable that is missing or malformed, never its value,
// never a fragment of a key, and never a decoded PEM. Key material leaves this
// module only through `gateway.ts`, which passes it straight into `node:crypto`
// and drops it.
import "server-only";
import {
  decodeKeyMaterial,
  rsaModulusBits,
  MIN_RSA_MODULUS_BITS,
} from "./signing";
import { isValidCountry, isValidCurrency, isValidTerminal } from "./format";

export type AzericardConfig = {
  /** Bank-assigned 8-digit merchant terminal id. */
  terminal: string;
  /** e-Commerce gateway endpoint — auth, completion, reversal and status all POST here. */
  gatewayUrl: string;
  /** Card-storage endpoint. Present for completeness; the token flow is NOT built (see below). */
  tokenUrl: string | null;
  /** Our public site URL, sent as MERCH_URL and covered by the auth MAC. */
  merchantUrl: string;
  /** Merchant name as the cardholder should recognise it. */
  merchantName: string;
  /** Absolute URL the gateway POSTs the result to (BACKREF). */
  backrefUrl: string;
  currency: string;
  country: string;
  /** Merchant UTC offset (MERCH_GMT). Null = omit the field; see the note below. */
  merchGmt: string | null;
  /**
   * Whether the TRTYPE 90 MAC includes TRAN_TRTYPE. Defaults to FALSE, which is
   * the spec's own worked example (§8.3). See MAC_FIELDS_STATUS in mac.ts for
   * why the specification supports two readings and why this is a switch rather
   * than a decision baked into the code.
   */
  statusMacIncludesTranTrtype: boolean;
};

/** Read a server env var, trimmed; empty string becomes null. */
function env(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v === "" ? null : v;
}

/**
 * The site origin the gateway will post back to. Falls back to the same
 * NEXT_PUBLIC_SITE_URL the auth-email links already use, so a correctly
 * configured deployment needs no extra variable; the explicit override exists
 * for local testing through a tunnel, where the public hostname is not the app's
 * own origin.
 */
export const CALLBACK_PATH = "/api/payments/azericard/callback";

function backrefUrl(): string | null {
  const explicit = env("AZERICARD_BACKREF_URL");
  if (explicit) return httpsUrlOrNull(explicit);
  const site = env("NEXT_PUBLIC_SITE_URL");
  if (!site) return null;
  return httpsUrlOrNull(site.replace(/\/+$/, "") + CALLBACK_PATH);
}

/**
 * Validate as an absolute https URL and return it EXACTLY AS WRITTEN.
 *
 * Not `new URL(value).toString()`, deliberately: that normalises a bare origin
 * into a trailing-slash form ("https://olympiq.ai" → "https://olympiq.ai/").
 * MERCH_URL is covered by the authorisation MAC and may also be matched against
 * the value registered with the bank, so the one string that must reach both
 * the signature and the wire is the one the operator configured.
 *
 * https only: the gateway posts a payment result across the public internet, and
 * plain http would put it on the wire in clear text and make the redirect target
 * trivially interceptable.
 */
function httpsUrlOrNull(value: string): string | null {
  const trimmed = value.trim();
  try {
    if (new URL(trimmed).protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

// Memoized because the checks below PARSE BOTH RSA KEYS, and the callback route
// is a public endpoint: re-deriving the configuration on every POST would hand
// an unauthenticated caller two key parses per request as a CPU lever. The
// process environment does not change at runtime, so one evaluation is also the
// only correct number. (The decoded PEMs are not cached here — see the getters.)
let cachedProblems: string[] | null = null;
let cachedConfig: { value: AzericardConfig | null } | null = null;

/**
 * Names of the variables that are missing or malformed. NEVER their values.
 * An empty array means the configuration is usable.
 */
export function describeConfigProblems(): string[] {
  if (cachedProblems) return [...cachedProblems];
  const problems = computeConfigProblems();
  cachedProblems = problems;
  return [...problems];
}

function computeConfigProblems(): string[] {
  const problems: string[] = [];

  const terminal = env("AZERICARD_TERMINAL");
  if (!terminal) problems.push("AZERICARD_TERMINAL missing");
  else if (!isValidTerminal(terminal)) problems.push("AZERICARD_TERMINAL malformed");

  const gateway = env("AZERICARD_GATEWAY_URL");
  if (!gateway) problems.push("AZERICARD_GATEWAY_URL missing");
  else if (!httpsUrlOrNull(gateway)) problems.push("AZERICARD_GATEWAY_URL malformed");

  const merchantUrl = env("AZERICARD_MERCHANT_URL");
  if (!merchantUrl) problems.push("AZERICARD_MERCHANT_URL missing");
  else if (!httpsUrlOrNull(merchantUrl)) problems.push("AZERICARD_MERCHANT_URL malformed");

  if (!env("AZERICARD_MERCHANT_NAME")) problems.push("AZERICARD_MERCHANT_NAME missing");

  const currency = env("AZERICARD_CURRENCY");
  if (!currency) problems.push("AZERICARD_CURRENCY missing");
  else if (!isValidCurrency(currency)) problems.push("AZERICARD_CURRENCY malformed");

  const country = env("AZERICARD_COUNTRY");
  if (!country) problems.push("AZERICARD_COUNTRY missing");
  else if (!isValidCountry(country)) problems.push("AZERICARD_COUNTRY malformed");

  if (!backrefUrl()) {
    problems.push("AZERICARD_BACKREF_URL (or NEXT_PUBLIC_SITE_URL) missing or not https");
  }

  const priv = env("AZERICARD_PRIVATE_KEY_B64");
  if (!priv) problems.push("AZERICARD_PRIVATE_KEY_B64 missing");
  else {
    const pem = decodeKeyMaterial(priv);
    if (!pem) problems.push("AZERICARD_PRIVATE_KEY_B64 is not a base64-encoded PEM");
    else {
      const bits = rsaModulusBits(pem, "private");
      if (bits === null) problems.push("AZERICARD_PRIVATE_KEY_B64 is not an RSA private key");
      else if (bits < MIN_RSA_MODULUS_BITS) {
        problems.push(`AZERICARD_PRIVATE_KEY_B64 is ${bits}-bit; the gateway requires ${MIN_RSA_MODULUS_BITS}`);
      }
    }
  }

  const pub = env("AZERICARD_MPI_PUBLIC_KEY_B64");
  if (!pub) problems.push("AZERICARD_MPI_PUBLIC_KEY_B64 missing");
  else {
    const pem = decodeKeyMaterial(pub);
    if (!pem) problems.push("AZERICARD_MPI_PUBLIC_KEY_B64 is not a base64-encoded PEM");
    else {
      const bits = rsaModulusBits(pem, "public");
      if (bits === null) problems.push("AZERICARD_MPI_PUBLIC_KEY_B64 is not an RSA public key");
      else if (bits < MIN_RSA_MODULUS_BITS) {
        problems.push(`AZERICARD_MPI_PUBLIC_KEY_B64 is ${bits}-bit; the gateway requires ${MIN_RSA_MODULUS_BITS}`);
      }
    }
  }

  return problems;
}

/** Usable configuration, or null. Callers report "not configured", never why. */
export function getAzericardConfig(): AzericardConfig | null {
  if (!cachedConfig) cachedConfig = { value: computeConfig() };
  return cachedConfig.value;
}

function computeConfig(): AzericardConfig | null {
  if (describeConfigProblems().length > 0) return null;
  const gatewayUrl = httpsUrlOrNull(env("AZERICARD_GATEWAY_URL") as string);
  const merchantUrl = httpsUrlOrNull(env("AZERICARD_MERCHANT_URL") as string);
  const backref = backrefUrl();
  if (!gatewayUrl || !merchantUrl || !backref) return null;

  const tokenUrlRaw = env("AZERICARD_TOKEN_URL");

  return {
    terminal: env("AZERICARD_TERMINAL") as string,
    gatewayUrl,
    // NOT USED. Card-on-file / recurring (TOKEN_ACTION=REGISTER, MERCH_TRAN_STATE,
    // TOKEN, EXT_NET_REF) exists in the protocol but the bank has NOT approved it
    // for this merchant, and a dormant token path is exactly the kind of unused
    // money surface that should not exist. The value is carried so the seam is
    // obvious when approval arrives; nothing reads it today.
    tokenUrl: tokenUrlRaw ? httpsUrlOrNull(tokenUrlRaw) : null,
    merchantUrl,
    merchantName: env("AZERICARD_MERCHANT_NAME") as string,
    backrefUrl: backref,
    currency: env("AZERICARD_CURRENCY") as string,
    country: env("AZERICARD_COUNTRY") as string,
    // MERCH_GMT is CONDITIONAL in the spec: send it only when the merchant
    // system's time zone differs from the gateway server's. Our TIMESTAMP is
    // generated in GMT(0) exactly as required, and the deployment runs in UTC,
    // so the default is to OMIT the field rather than assert a zone we are not
    // in. Set AZERICARD_MERCH_GMT (e.g. "+4") only if the bank asks for it.
    merchGmt: env("AZERICARD_MERCH_GMT"),
    statusMacIncludesTranTrtype:
      (env("AZERICARD_STATUS_MAC_INCLUDES_TRAN_TRTYPE") ?? "").toLowerCase() === "true",
  };
}

/**
 * Our private key, decoded. Returns null rather than throwing so no call site
 * can accidentally surface a stack trace containing it.
 */
export function getPrivateKeyPem(): string | null {
  const raw = env("AZERICARD_PRIVATE_KEY_B64");
  return raw ? decodeKeyMaterial(raw) : null;
}

/** The gateway's public key (AZERICARDpublic.pem), decoded. */
export function getMpiPublicKeyPem(): string | null {
  const raw = env("AZERICARD_MPI_PUBLIC_KEY_B64");
  return raw ? decodeKeyMaterial(raw) : null;
}

/**
 * The shared secret guarding the owner-only test-initiation route. Server-only,
 * never NEXT_PUBLIC_. An UNSET token closes the route completely — it is never
 * "open when unconfigured", the same fail-closed rule the notifications
 * processor uses.
 */
export function getTestToken(): string | null {
  return env("AZERICARD_TEST_TOKEN");
}
