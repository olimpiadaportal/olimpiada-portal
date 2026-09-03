// The invariants that cannot be exercised at runtime without an Apple key, a
// certificate authority and a real purchase — so they are pinned in the SOURCE,
// exactly as `azericard/__tests__/invariants.test.ts` pins its own.
//
// Each one below is a property whose violation would be SILENT: the code would
// still compile, every other test would still pass, and the failure would show
// up as a sandbox purchase granting a year of production access, or a private
// key in a log aggregator.
//
// COMMENTS ARE STRIPPED before every sweep. These files explain at length what
// they deliberately do NOT do — "no subscription-status polling", "grants
// nothing", "never logged" — and a sweep that could not tell a mention from a
// use would force those explanations out. The explanation is the part that stops
// the next reader from wiring a notification body straight to an entitlement.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const REPO = resolve(process.cwd(), "..");
const MODULE_DIR = join(SRC, "lib", "payments", "apple");

/** Modules that hold or read a secret, and must never reach a browser bundle. */
const SERVER_ONLY = ["config.ts", "client.ts", "verifier.ts", "rails.ts"] as const;

/** Modules that decide whether money becomes access, and must stay testable. */
const PURE = ["environment.ts", "expiry.ts", "transaction.ts", "jws.ts", "jwt.ts", "index.ts"] as const;

function read(abs: string): string {
  return readFileSync(abs, "utf8").split("\r\n").join("\n");
}

/** Source with block and line comments blanked out. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(abs, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

const MODULE_FILES = filesUnder(MODULE_DIR).filter((f) => !f.includes("__tests__"));

describe("secrets stay server-side", () => {
  it("reads APPLE_IAP_* only in config.ts", () => {
    const offenders: string[] = [];
    for (const file of filesUnder(SRC)) {
      if (file.includes("__tests__")) continue;
      if (file === join(MODULE_DIR, "config.ts")) continue;
      if (code(read(file)).includes("APPLE_IAP_")) offenders.push(relative(REPO, file));
    }
    expect(offenders).toEqual([]);
  });

  it("never prefixes an Apple secret with NEXT_PUBLIC_", () => {
    for (const file of MODULE_FILES) {
      expect(code(read(file))).not.toContain("NEXT_PUBLIC_APPLE");
    }
  });

  it("keeps the secret-holding modules server-only", () => {
    for (const name of SERVER_ONLY) {
      expect(read(join(MODULE_DIR, name))).toContain('import "server-only";');
    }
  });

  it("keeps the deciding half free of server-only and of process.env", () => {
    // The rule that decides whether a payment becomes access must be
    // unit-testable without a key in the process — the same split as
    // planBasket.ts / subscriptionCore.ts.
    for (const name of PURE) {
      const src = read(join(MODULE_DIR, name));
      expect(src).not.toContain('import "server-only"');
      expect(code(src)).not.toContain("process.env");
    }
  });

  it("hands the private key to exactly one caller", () => {
    const callers = MODULE_FILES.filter(
      (f) => f !== join(MODULE_DIR, "config.ts") && code(read(f)).includes("getIapPrivateKeyPem"),
    ).map((f) => relative(MODULE_DIR, f));
    expect(callers).toEqual(["client.ts"]);
  });

  it("never logs a key, a token or a certificate", () => {
    for (const file of MODULE_FILES) {
      const src = code(read(file));
      for (const call of src.match(/console\.[a-z]+\([\s\S]{0,240}?\);/g) ?? []) {
        for (const needle of ["Pem", "privateKey", "signingKey", "token", "Token", "Bearer", "signature"]) {
          expect(call).not.toContain(needle);
        }
      }
    }
  });

  it("reports only variable NAMES from the configuration checker", () => {
    const src = code(read(join(MODULE_DIR, "config.ts")));
    // Every problem reported must be a STRING LITERAL beginning with the
    // variable name. An interpolation is how a value gets into a message, so the
    // count of literal pushes has to equal the count of pushes.
    const all = src.match(/problems\.push\(/g) ?? [];
    const literal = src.match(/problems\.push\("APPLE_IAP_[A-Z_]+ [^"]*"\)/g) ?? [];
    expect(all.length).toBeGreaterThan(0);
    expect(literal.length).toBe(all.length);
    expect(src).not.toMatch(/problems\.push\(`/);
  });

  it("reads exactly the six variables it documents, and no environment selector", () => {
    const src = code(read(join(MODULE_DIR, "config.ts")));
    const names = new Set((src.match(/env\("([A-Z_]+)"\)/g) ?? []).map((m) => m.slice(5, -2)));
    expect(names).toEqual(
      new Set([
        "APPLE_IAP_BUNDLE_ID",
        "APPLE_IAP_ISSUER_ID",
        "APPLE_IAP_KEY_ID",
        "APPLE_IAP_APP_APPLE_ID",
        "APPLE_IAP_PRIVATE_KEY",
        "APPLE_IAP_ROOT_CERTIFICATES",
      ]),
    );
  });
});

describe("the certificate chain is not hand-rolled", () => {
  it("imports Apple's library in exactly one file", () => {
    const importers = MODULE_FILES.filter((f) =>
      code(read(f)).includes("@apple/app-store-server-library"),
    ).map((f) => relative(MODULE_DIR, f));
    expect(importers).toEqual(["verifier.ts"]);
  });

  it("never builds trust from the message's own certificate alone", () => {
    // `verifyJwsAgainstEmbeddedLeaf` answers "signed by the attached cert",
    // which an attacker can satisfy with their own cert. It is defence in depth
    // AFTER the chain check, and must never be the only check a caller runs.
    const users = MODULE_FILES.filter(
      (f) => f !== join(MODULE_DIR, "jws.ts") && f !== join(MODULE_DIR, "index.ts"),
    ).filter((f) => code(read(f)).includes("verifyJwsAgainstEmbeddedLeaf"));
    expect(users).toEqual([]);
  });
});

describe("environment separation is structural, not a runtime flag", () => {
  it("hardcodes both base URLs rather than reading one from the environment", () => {
    // Read RAW, not comment-stripped: a URL contains "//" and the stripper would
    // blank the rest of the line. `process.env` is checked on the stripped form
    // by the "deciding half" test above.
    const src = read(join(MODULE_DIR, "environment.ts"));
    expect(src).toContain('Production: "https://api.storekit.apple.com"');
    expect(src).toContain('Sandbox: "https://api.storekit-sandbox.apple.com"');
  });

  it("has no variable that selects an environment for the whole deployment", () => {
    // App Review buys in SANDBOX against our PRODUCTION server. A single
    // deployment-wide environment setting cannot express that, and adding one
    // would mean either failing review or honouring sandbox purchases.
    for (const file of MODULE_FILES) {
      expect(code(read(file))).not.toContain("APPLE_IAP_ENVIRONMENT");
    }
  });

  it("crosses from sandbox to production only in transaction.ts", () => {
    // THERE ARE EXACTLY TWO DOORS, and both are named functions in ONE file:
    //   requireProductionGrant   — a production grant passes through unchanged
    //   sandboxGrantAsProduction — a sandbox grant is namespaced and allowed
    //
    // The second exists because App Review buys in SANDBOX against the
    // PRODUCTION build. Refusing those (which this module did until 2026-09-01)
    // means the reviewer pays, gets nothing, and rejects the app — so "sandbox
    // never grants" was not a safety property, it was the bug.
    //
    // What this test still protects is the thing that always mattered: the
    // crossing must stay a small set of greppable names in one file, never a
    // cast in the writer where it would be invisible in review.
    const casts: string[] = [];
    for (const file of MODULE_FILES) {
      for (const line of code(read(file)).split("\n")) {
        if (line.includes('AppleGrant<"Production">') && line.includes(" as ")) {
          casts.push(`${relative(MODULE_DIR, file)}: ${line.trim()}`);
        }
      }
    }
    expect(casts).toHaveLength(2);
    for (const cast of casts) {
      expect(cast.startsWith("transaction.ts:")).toBe(true);
    }
  });

  it("namespaces a sandbox transaction id so it cannot collide with production", () => {
    // uq_iap_intent_original_txn is global and unique. An unprefixed sandbox id
    // could permanently block the real transaction that shares its digits —
    // that collision, not the existence of sandbox access, was the actual hazard.
    const src = code(read(join(MODULE_DIR, "transaction.ts")));
    expect(src).toContain("SANDBOX_REF_PREFIX");
    expect(src).toMatch(/SANDBOX_REF_PREFIX\s*=\s*"sbx:"/);
    expect(src).toMatch(/\$\{SANDBOX_REF_PREFIX\}\$\{grant\.originalTransactionId\}/);
  });
});

describe("the doctrine: never believe the message, go and ask", () => {
  it("makes a re-query the first condition of any grant", () => {
    const body = code(read(join(MODULE_DIR, "transaction.ts")));
    const grantStart = body.indexOf("export function toAppleGrant");
    expect(grantStart).toBeGreaterThan(-1);
    const firstCheck = body.indexOf('transaction.source !== "requery"', grantStart);
    expect(firstCheck).toBeGreaterThan(-1);
    // Nothing may return `ok: true` before that check.
    expect(body.slice(grantStart, firstCheck)).not.toContain("ok: true");
  });

  it("never polls the auto-renewable subscription-status endpoint", () => {
    // "Get All Subscription Statuses" covers AUTO-RENEWABLE products only. Our
    // subscriptions are NON-RENEWING, so this endpoint would be a source of
    // confident wrong answers.
    for (const file of MODULE_FILES) {
      const src = code(read(file));
      expect(src).not.toContain("/inApps/v1/subscriptions");
      expect(src).not.toContain("getAllSubscriptionStatuses");
    }
  });

  it("calls only the three endpoints a non-renewing product needs", () => {
    const src = code(read(join(MODULE_DIR, "client.ts")));
    const paths = (src.match(/\/inApps\/v[12]\/[a-z/]*/g) ?? []).map((p) => p.replace(/\/$/, ""));
    expect(new Set(paths)).toEqual(
      new Set(["/inApps/v1/transactions", "/inApps/v2/history", "/inApps/v1/notifications/test"]),
    );
  });

  it("drops Apple's errorMessage rather than propagating it", () => {
    // Never return a raw upstream message to a client (project rule).
    const src = code(read(join(MODULE_DIR, "client.ts")));
    expect(src).not.toContain("errorMessage");
  });
});

describe("this layer grants nothing by itself", () => {
  // grantEntitlement.ts IS the writer — the single place a verified Apple
  // transaction becomes access, shared by redeem, restore and the notification
  // consumer so all three agree. It necessarily reaches the database, so it is
  // the one file this sweep cannot cover.
  //
  // The invariant keeps its teeth precisely because the exception is named: what
  // is being asserted is that VERIFICATION and WRITING stay separate, so a
  // future "convenience" that lets a decoder quietly grant something has exactly
  // one file it could hide in, and that file's name is written here.
  const WRITER = "grantEntitlement.ts";

  it("names an exception that actually exists", () => {
    // If the writer is renamed and this string is not, the sweep below would
    // silently start covering nothing new while appearing to still allow one
    // exception. Fail loudly instead.
    expect(MODULE_FILES.some((f) => f.endsWith(WRITER))).toBe(true);
  });

  it("touches no database and writes no entitlement, outside the writer", () => {
    const swept = MODULE_FILES.filter((f) => !f.endsWith(WRITER));
    expect(swept.length).toBeGreaterThan(0);
    for (const file of swept) {
      const src = code(read(file));
      for (const needle of ["supabase", "getAdminClient", "entitlements", "service_role"]) {
        expect(src).not.toContain(needle);
      }
    }
  });
});
