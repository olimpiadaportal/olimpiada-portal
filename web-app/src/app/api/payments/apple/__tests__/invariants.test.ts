// The invariants of the three Apple-facing endpoints, pinned in the SOURCE —
// the shape `lib/payments/apple/__tests__/invariants.test.ts` and
// `payments/azericard/__tests__/invariants.test.ts` already use.
//
// Each property below would fail SILENTLY if it were broken: the code would
// compile, every other test would still pass, and the damage would appear as a
// signed payload in a log aggregator, an open reconciliation endpoint on a
// deployment that forgot a variable, or a sandbox grant with a production key.
//
// COMMENTS ARE STRIPPED before every sweep. These files explain at length what
// they deliberately do NOT do — "never log a signed payload", "grants nothing",
// "the second lock" — and a sweep that could not tell a mention from a use would
// force those explanations out. The explanation is the part that stops the next
// reader from wiring a notification body straight to an entitlement.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const ENDPOINT_DIR = join(SRC, "app", "api", "payments", "apple");
const LIB_DIR = join(ENDPOINT_DIR, "_lib");

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
    else if (/\.ts$/.test(entry.name)) out.push(abs);
  }
  return out;
}

const ALL_FILES = filesUnder(ENDPOINT_DIR).filter((f) => !f.includes("__tests__"));

/** The deciding halves: no secret, no client, no database handle. */
const PURE_CORES = ["notificationCore.ts", "reconcileCore.ts", "classify.ts", "externalRef.ts"];

describe("nothing sensitive is ever logged", () => {
  it("never logs a signed payload, a JWS or a key", () => {
    // A signed notification body is a bearer credential for a purchase, and a
    // log aggregator is not where one belongs.
    for (const file of ALL_FILES) {
      const src = code(read(file));
      for (const forbidden of [
        "console.log",
        "console.info(signedPayload",
        "console.error(signedPayload",
        "${signedPayload",
        "${rawBody",
        "${raw}",
        "PrivateKey",
        "privateKey",
      ]) {
        expect(src).not.toContain(forbidden);
      }
    }
  });

  it("never puts an outcome, a reason or an id in a notification response body", () => {
    // Apple ignores the body; anyone else POSTing here must learn nothing about
    // whether their guess was interesting.
    const src = code(read(join(LIB_DIR, "notificationRoute.ts")));
    expect(src).not.toContain("result.outcome");
    expect(src).toContain("answer(result.status)");
  });
});

describe("the deciding halves stay testable without a key", () => {
  it("imports no secret, no client and no database handle", () => {
    for (const name of PURE_CORES) {
      const src = code(read(join(LIB_DIR, name)));
      // `import type` lines are erased at compile time and carry no runtime
      // dependency, so they are stripped before the check — a type from a
      // server-only module is not a use of that module.
      const runtime = src.replace(/import\s+type[\s\S]*?;/g, " ");
      for (const forbidden of ['"server-only"', "process.env", "getAdminClient", "fetch("]) {
        expect(runtime).not.toContain(forbidden);
      }
    }
  });

  it("keeps every module that reaches a secret or the database server-only", () => {
    for (const name of ["store.ts", "wire.ts", "notificationRoute.ts"]) {
      expect(read(join(LIB_DIR, name))).toContain('import "server-only";');
    }
  });
});

describe("the reconciliation door", () => {
  const src = code(read(join(ENDPOINT_DIR, "reconcile", "route.ts")));

  it("compares its secrets in constant time", () => {
    expect(src).toContain("timingSafeEqual");
    // A plain `===` on a secret would be a timing oracle. The only equality
    // comparisons in this file are length checks and the empty-string guards.
    expect(src).not.toContain("=== RECONCILE_KEY");
    expect(src).not.toContain("=== CRON_SECRET");
  });

  it("is CLOSED when its secret is unset", () => {
    // The dangerous failure is "unconfigured therefore open".
    expect(src).toContain("if (!RECONCILE_KEY || !provided) return false;");
    expect(src).toContain("if (!CRON_SECRET || !authorization) return false;");
  });

  it("reads nothing else from the request", () => {
    // No order, no transaction id, no batch size — there is no parameter a
    // caller can steer this sweep with.
    expect(src).not.toContain("searchParams");
    expect(src).not.toContain("request.json");
    expect(src).not.toContain("request.text");
  });
});

describe("the sandbox rail cannot grant", () => {
  it("has its own route, so the verifier's environment is never a runtime choice", () => {
    // Apple's SignedDataVerifier takes the environment in its CONSTRUCTOR.
    const production = code(read(join(ENDPOINT_DIR, "notifications", "route.ts")));
    const sandbox = code(read(join(ENDPOINT_DIR, "notifications", "sandbox", "route.ts")));
    expect(production).toContain("productionRail()");
    expect(production).not.toContain("sandboxRail");
    expect(sandbox).toContain("sandboxRail()");
    expect(sandbox).not.toContain("productionRail");
  });

  it("gates the sandbox route on a flag that is unset in production", () => {
    const sandbox = code(read(join(ENDPOINT_DIR, "notifications", "sandbox", "route.ts")));
    expect(sandbox).toContain("sandboxGrantsEnabled()");
    // …and the production route does NOT consult it: its grants are on
    // unconditionally, which is the whole point of that rail.
    const production = code(read(join(ENDPOINT_DIR, "notifications", "route.ts")));
    expect(production).not.toContain("sandboxGrantsEnabled");
  });

  it("never casts its way past requireProductionGrant", () => {
    // The single door out of "sandbox" lives inside the shared writer. Nothing
    // in these endpoints may manufacture a production grant.
    for (const file of ALL_FILES) {
      const src = code(read(file));
      expect(src).not.toContain('as AppleGrant<"Production">');
      expect(src).not.toContain("as unknown as AppleGrant");
    }
  });
});

describe("the write path is imported, never reimplemented", () => {
  it("calls grantAppleEntitlement and nothing else that writes an entitlement", () => {
    // A rule enforced in two places is a rule that will be enforced in one.
    const wire = code(read(join(LIB_DIR, "wire.ts")));
    expect(wire).toContain("grantAppleEntitlement");

    for (const file of ALL_FILES) {
      const src = code(read(file));
      // entitlement_grant is the RPC the shared writer owns. These endpoints
      // revoke directly (entitlement_revoke keys on the same pair and is the
      // fail-safe direction) and never grant directly.
      expect(src).not.toContain("entitlement_grant");
    }
  });

  it("keeps the revoke source spelled exactly as public.entitlement_source spells it", () => {
    const store = code(read(join(LIB_DIR, "store.ts")));
    expect(store).toContain('"apple_iap"');
    expect(store).toContain("entitlement_revoke");
  });
});

describe("Android stays purchase-silent", () => {
  it("has no platform fallback anywhere in the rail", () => {
    // iap_products.platform is the structural guard — no google_play rows exist,
    // so there is nothing to sell on Android. Never invent one.
    for (const file of ALL_FILES) {
      const src = code(read(file));
      expect(src).not.toContain("android");
      expect(src).not.toContain("google_play");
    }
  });
});
