// THE SECURITY CONTRACT OF THE EXISTING-CHILD LINK FLOW, PINNED IN ITS SOURCE.
//
// THIS FILE REPLACES childCredentialLink.contract.test.ts, WHICH WAS RETIRED
// WITH THE FLOW IT GUARDED (owner, 2026-09-17 — migration 181). That file pinned
// four invisible decisions of the "link by the CHILD's own password" route: that
// it never went through childLoginService, that its verifying client persisted
// nothing, that both throttles were read before the password was tried, and that
// it never wrote to the child's own login ledger. All four were about handling a
// child's password safely. The owner removed the route instead, which is the
// stronger version of every one of them — an invite code is a ONE-TIME, EXPIRING
// secret the CREATING parent generates deliberately, while a child's password is
// a STANDING secret the child also knows and cannot revoke.
//
// So this file does not re-assert those four. It pins what is left, plus the one
// thing the deletion itself created: a shape that would look perfectly ordinary
// if someone reintroduced it.
//
// SOURCE ASSERTIONS ON PURPOSE. These are "use server" modules over a live
// Supabase project; a mocked version would pin the mock. What a test CAN do is
// read the file — and authorize-first is an ORDERING, and a removed route is an
// ABSENCE. Comments are stripped before every sweep, because the modules explain
// at length what they no longer do, and an explanation that could fail the test
// it explains is an explanation that gets deleted.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ACTIONS = "src/lib/auth/childLinkActions.ts";
const ADULTS = "src/lib/auth/childAccessAdults.ts";
const ROUTE = "src/app/api/mobile/v1/children/link/route.ts";

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8").split("\r\n").join("\n");
}

/** Source with block and line comments blanked out. */
function code(rel: string): string {
  return source(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

describe("childLinkActions: authorize first", () => {
  it("opens every exported action with requireParent, before reading input", () => {
    const text = code(ACTIONS);
    const re = /export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;
    const seen: string[] = [];
    for (const m of text.matchAll(re)) {
      const [, name, body] = m;
      seen.push(name);
      const first = body.split("\n").map((l) => l.trim()).filter(Boolean)[0];
      expect(first, `${name} must authorize first`).toMatch(/await requireParent\(\)/);
    }
    // Exactly the survivors. A fourth export is not automatically wrong, but it
    // IS the shape the removed route had, so it has to be added here on purpose.
    expect(seen.sort()).toEqual([
      "childAccessAdultsAction",
      "childLinkMutationAction",
      "childLinkStateAction",
    ]);
  });

  it("has no credential route left to authorize", () => {
    const text = code(ACTIONS);
    expect(text).not.toMatch(/childLinkByCredentialsAction/);
    expect(text).not.toMatch(/linkChildByCredentials/);
    // The throttle bucket went with it. A limiter with no caller is one a future
    // round wires to something it was never reasoned about.
    expect(text).not.toMatch(/rateLimitAllow/);
    expect(text).not.toMatch(/childcredlink/);
    // And never the child-login bucket, which was always the wrong one to share:
    // an adult's typos would burn a real child's login budget from one household IP.
    expect(text).not.toMatch(/rateLimitAllow\("childlogin"/);
  });

  it("deleted the credential module rather than leaving it importable", () => {
    // A working link-by-password function sitting in the tree is one import from
    // being live again, and its file name advertises the flow that was removed.
    expect(existsSync(resolve(process.cwd(), "src/lib/auth/childCredentialLink.ts"))).toBe(false);
    // What survived it — the "who has access" list — moved to a module named for
    // what it actually does, and the panel reads it from there.
    expect(existsSync(resolve(process.cwd(), ADULTS))).toBe(true);
    expect(code(ACTIONS)).toContain('from "@/lib/auth/childAccessAdults"');
  });
});

describe("childAccessAdults: the surviving read", () => {
  it("is server-only and shape-checks both ids before the privileged call", () => {
    const text = code(ADULTS);
    expect(text).toMatch(/import "server-only"/);
    const guard = text.indexOf("isUuid(");
    const admin = text.indexOf("getAdminClient()");
    expect(guard).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(guard);
  });

  it("never hands a Postgres or Supabase message to the client", () => {
    const text = code(ADULTS);
    // An empty list on failure, never a raw message: this one leaks the adults
    // around a minor if it ever starts explaining itself.
    expect(text).not.toMatch(/error\.message/);
    expect(text).not.toMatch(/\.message\b/);
    expect(text).toMatch(/if \(error \|\| !data/);
  });

  it("never verifies a credential of its own", () => {
    const text = code(ADULTS);
    expect(text).not.toMatch(/signInWithPassword/);
    expect(text).not.toMatch(/childLoginService/);
    expect(text).not.toMatch(/createClient\s*\(/);
  });
});

describe("the mobile BFF answers an old bundle cleanly", () => {
  it("refuses a credentials POST explicitly, and authorizes before it", () => {
    // THE DEPLOY WINDOW IS REAL: the web app deploys on push, the mobile fix is
    // an OTA update that applies on a user's NEXT LAUNCH. In between, a parent
    // on yesterday's bundle taps a password form this route no longer serves.
    // An explicit 400 with an i18n key is the answer; an unhandled action is a
    // 500 on somebody's phone.
    const text = code(ROUTE);
    expect(text).toMatch(/if \(action === "credentials"\)[\s\S]{0,120}errorResponse\("link\.err\./);
    const auth = text.indexOf("resolveBearerParent(request)");
    const body = text.indexOf("readJsonBody(request)");
    const branch = text.indexOf('action === "credentials"');
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(body);
    expect(body).toBeLessThan(branch);
    // The refusal must not be a 401: the mobile client reads any 401 on a Bearer
    // call as an expired session and would sign the parent out over it.
    expect(text).not.toMatch(/action === "credentials"\)[\s\S]{0,120}401/);
    // And the verification is gone, not merely unreachable.
    expect(text).not.toMatch(/linkChildByCredentials/);
    expect(text).not.toMatch(/signInWithPassword/);
  });
});
