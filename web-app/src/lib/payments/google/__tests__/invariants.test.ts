// The Google Play rail's invariants, pinned in the SOURCE — the shape the Apple
// and AzeriCard invariant suites use. Each would fail SILENTLY if broken: the
// code would compile and every behavioural test would still pass.
//
// Comments are stripped before every sweep, so the files may explain at length
// what they deliberately do not do.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const LIB = join(SRC, "lib", "payments", "google");
const ENDPOINTS = [
  join(SRC, "app", "api", "payments", "google"),
  join(SRC, "app", "api", "mobile", "v1", "iap", "google"),
];

function read(abs: string): string {
  return readFileSync(abs, "utf8").split("\r\n").join("\n");
}
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

const RAIL_FILES = [LIB, ...ENDPOINTS]
  .flatMap((d) => filesUnder(d))
  .filter((f) => !f.includes("__tests__"));

describe("secrets stay server-side", () => {
  it("reads the service-account key only in config.ts", () => {
    const offenders = filesUnder(SRC)
      .filter((f) => !f.includes("__tests__") && f !== join(LIB, "config.ts"))
      .filter((f) => code(read(f)).includes("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it("never exposes a Google Play variable to a client bundle", () => {
    for (const f of filesUnder(SRC).filter((x) => !x.includes("__tests__"))) {
      expect(code(read(f))).not.toContain("NEXT_PUBLIC_GOOGLE_PLAY");
    }
  });

  it("keeps every module that holds a key, a token or the database server-only", () => {
    for (const name of ["config.ts", "oauth.ts", "client.ts", "jwks.ts", "grantEntitlement.ts"]) {
      expect(read(join(LIB, name))).toContain('import "server-only";');
    }
  });

  it("hands the private key to exactly one caller", () => {
    const callers = filesUnder(LIB)
      .filter((f) => !f.includes("__tests__") && f !== join(LIB, "config.ts"))
      .filter((f) => code(read(f)).includes("getServiceAccountPrivateKeyPem"))
      .map((f) => relative(LIB, f));
    expect(callers).toEqual(["oauth.ts"]);
  });

  it("never logs a key, an access token or a purchase token", () => {
    for (const file of RAIL_FILES) {
      const src = code(read(file));
      for (const call of src.match(/console\.[a-z]+\([\s\S]{0,240}?\);/g) ?? []) {
        for (const needle of ["Pem", "privateKey", "accessToken", "assertion", "Bearer", "rawBody", "${raw}"]) {
          expect(call, `${relative(SRC, file)}: ${call}`).not.toContain(needle);
        }
        // A purchase token may appear in a log line ONLY through redactToken().
        // Prose inside string literals ("token endpoint unreachable") is not a
        // value; only identifiers and interpolations are checked.
        const bare = call
          .replace(/redactToken\([^)]*\)/g, "")
          .replace(/"[^"\n]*"/g, '""')
          .replace(/`([^`]*)`/g, (_m, inner: string) => (inner.match(/\$\{[^}]*\}/g) ?? []).join(" "));
        expect(bare, `${relative(SRC, file)}: ${call}`).not.toMatch(/purchaseToken|\btoken\b/);
      }
      expect(src).not.toContain("console.log");
    }
  });
});

describe("the doctrine: a token is a question, Google's answer is the authority", () => {
  it("makes the re-query the first condition of any grant", () => {
    const body = code(read(join(LIB, "purchase.ts")));
    const start = body.indexOf("export function toGoogleGrant");
    const first = body.indexOf('purchase.source !== "requery"', start);
    expect(start).toBeGreaterThan(-1);
    expect(first).toBeGreaterThan(-1);
    expect(body.slice(start, first)).not.toContain("ok: true");
  });

  it("constructs a requery-tagged purchase in exactly one place", () => {
    const makers = RAIL_FILES.filter((f) => /source:\s*"requery"\s*,/.test(code(read(f)))).map((f) =>
      relative(SRC, f),
    );
    expect(makers).toEqual([join("lib", "payments", "google", "grantEntitlement.ts")]);
  });

  it("grants only through the shared writer", () => {
    const writers = RAIL_FILES.filter((f) => code(read(f)).includes("entitlement_grant")).map((f) =>
      relative(SRC, f),
    );
    expect(writers).toEqual([join("lib", "payments", "google", "grantEntitlement.ts")]);
  });

  it("spells the source exactly as public.entitlement_source does", () => {
    expect(code(read(join(LIB, "grantEntitlement.ts")))).toContain('"google_play"');
  });

  it("pins the Google hosts rather than reading them from anywhere", () => {
    expect(read(join(LIB, "jwt.ts"))).toContain('"https://oauth2.googleapis.com/token"');
    expect(read(join(LIB, "client.ts"))).toContain(
      '"https://androidpublisher.googleapis.com/androidpublisher/v3/applications"',
    );
    expect(read(join(LIB, "jwks.ts"))).toContain('"https://www.googleapis.com/oauth2/v3/certs"');
    expect(code(read(join(LIB, "oauth.ts")))).not.toContain("token_uri");
  });

  it("never consumes before the grant RPC in the writer", () => {
    const src = code(read(join(LIB, "grantEntitlement.ts")));
    const fn = src.slice(src.indexOf("export async function grantGoogleEntitlement"));
    const grantAt = fn.indexOf('"entitlement_grant"');
    const settleAt = fn.indexOf("settleOnGoogle(");
    expect(grantAt).toBeGreaterThan(-1);
    expect(settleAt).toBeGreaterThan(grantAt);
  });
});
