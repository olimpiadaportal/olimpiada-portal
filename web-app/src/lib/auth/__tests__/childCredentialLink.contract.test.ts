// THE SECURITY CONTRACT OF THE CREDENTIAL LINK FLOW, PINNED IN ITS SOURCE.
//
// This flow lets an adult prove they may reach a child by typing that CHILD's
// own credentials - the 8-digit id and the password their parent set. Four of
// the decisions that make it safe are invisible at runtime: each one is a thing
// the module deliberately does NOT do, or an ORDER it keeps, and every one of
// them would survive its own removal. The endpoint would still link children,
// every other test would still pass, and the damage would show up somewhere
// else entirely - in the parent's session cookies, or in a real child's login
// lockout.
//
//   1. IT MUST NOT GO THROUGH childLoginService. That module signs the child in
//      on the SSR client, which writes httpOnly session cookies: the PARENT
//      would be silently logged in AS THE CHILD, on their own device, from a
//      parent-facing screen. It is the single worst outcome available here and
//      it is one import away.
//
//   2. THE VERIFYING CLIENT MUST NOT PERSIST ITS SESSION. Same failure by a
//      different route - a persisted session is a child session living on in
//      the process that a parent is talking to.
//
//   3. THE THROTTLE MUST BE READ BEFORE THE PASSWORD IS TRIED. A ceiling
//      consulted after the guess has already been made is not a ceiling; it is
//      a log.
//
//   4. IT MUST NEVER WRITE TO THE CHILD'S OWN LOGIN LEDGER. Eight deliberate
//      wrong guesses from this screen would otherwise lock a real minor out of
//      their own app for fifteen minutes - deniably, by any adult who can open
//      the link page. That is a harassment tool, not a rate limit.
//
// SOURCE ASSERTIONS ON PURPOSE. Exercising this module means an Apple-free
// equivalent of a real Supabase project: an admin client, an anon client, a
// child auth user with a known password and a live lockout ledger. None of that
// exists in a unit test, and a mocked version would pin the mock. What it CAN
// do is read the file - and every property above is a presence, an absence or
// an ordering in the text.
//
// COMMENTS ARE STRIPPED BEFORE EVERY SWEEP. The module explains at length what
// it refuses to do, naming `childLoginService.childLogin()` and
// `record_child_login_attempt` in the prose. A sweep that could not tell a
// mention from a use would force exactly those explanations out of the file,
// and the explanation is the part that stops the next reader from reinstating
// the call.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";

const MODULE = "src/lib/auth/childCredentialLink.ts";
const ACTIONS = "src/lib/auth/childLinkActions.ts";

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8").split("\r\n").join("\n");
}

/** Source with block and line comments blanked out. */
function code(rel: string): string {
  return source(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

describe("childCredentialLink: what it must never do", () => {
  it("never reaches the child login service, and never the cookie client", () => {
    const text = code(MODULE);
    // The module by name, the function it exports, and the SSR client it uses -
    // all three, because any one of them arriving here has the same effect.
    expect(text).not.toMatch(/childLoginService/);
    expect(text).not.toMatch(/childLogin\s*\(/);
    expect(text).not.toMatch(/@\/lib\/supabase\/server/);
    expect(text).not.toMatch(/createServerClient/);
    expect(text).not.toMatch(/cookies\s*\(/);
  });

  it("verifies on a throwaway client that keeps nothing", () => {
    const text = code(MODULE);
    // The bare client comes from the plain SDK, not from any helper of ours
    // that might attach cookies today or tomorrow.
    expect(text).toMatch(/createClient\s*\(/);
    expect(text).toMatch(/from "@supabase\/supabase-js"/);
    expect(text).toMatch(/persistSession:\s*false/);
    expect(text).toMatch(/autoRefreshToken:\s*false/);
    expect(text).toMatch(/detectSessionInUrl:\s*false/);
    // persistSession only keeps it out of THIS process; signOut ends the
    // refresh token at Supabase, so a session nobody asked for does not outlive
    // the call.
    expect(text).toMatch(/auth\.signOut\s*\(/);
    expect(text).toMatch(/finally\s*\{/);
  });

  it("checks both ceilings before it tries the password", () => {
    const text = code(MODULE);
    const ours = text.indexOf("is_parent_link_verify_locked");
    const childs = text.indexOf("is_child_login_locked");
    const attempt = text.indexOf("signInWithPassword");

    expect(ours).toBeGreaterThan(-1);
    expect(childs).toBeGreaterThan(-1);
    expect(attempt).toBeGreaterThan(-1);
    expect(attempt).toBeGreaterThan(ours);
    expect(attempt).toBeGreaterThan(childs);
  });

  it("records the attempt in OUR ledger and never in the child's", () => {
    const text = code(MODULE);
    // Ours is written on every attempt, success or failure.
    expect(text).toMatch(/record_parent_link_verify_attempt/);
    expect(text).toMatch(/p_success:\s*verified/);
    // The child's is READ (the lockout above) and never written. Writing it
    // would let an adult lock a child out; a SUCCESS written there would also
    // clear a real failure streak mid-attack.
    expect(text).not.toMatch(/record_child_login_attempt/);
  });

  it("is server-only and shape-checks its input before any privileged call", () => {
    const text = code(MODULE);
    expect(text).toMatch(/import "server-only"/);
    const guard = text.indexOf("CHILD_ID_RE.test");
    const admin = text.indexOf("getAdminClient()");
    expect(guard).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(guard);
  });
});

describe("childCredentialLink: what it tells the caller", () => {
  it("never hands a Postgres or Supabase message to the client", () => {
    const text = code(MODULE);
    // Every failure goes through fail(), which returns an i18n KEY. A raw
    // message leaks schema, constraint names and row contents to a browser.
    expect(text).not.toMatch(/error\.message/);
    expect(text).not.toMatch(/\.message\b/);
    expect(text).toMatch(/function fail\(/);
  });

  it("keeps ONE answer for a wrong id and a wrong password", () => {
    const text = code(MODULE);
    // An endpoint that distinguishes them turns a 10^8 id space into an
    // enumerable directory of real minors. There is no friendlier key for the
    // "no such child" half, and there must not be one.
    expect(text).toMatch(/invalid:\s*"link\.err\.credentialsInvalid"/);
    expect(text).not.toMatch(/notFound|noSuchChild|unknownChild|wrongPassword/i);
  });

  it("returns only keys that exist in all three languages", () => {
    const keys = new Set<string>();
    for (const m of code(MODULE).matchAll(/"(link\.err\.[A-Za-z]+)"/g)) keys.add(m[1]);
    // The sweep is worthless if it found nothing.
    expect(keys.size).toBeGreaterThanOrEqual(5);
    for (const key of keys) {
      for (const locale of ["az", "en", "ru"] as const) {
        expect(messages[locale][key], `${key} missing in ${locale}`).toBeTruthy();
      }
    }
  });
});

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
    expect(seen).toContain("childLinkByCredentialsAction");
    expect(seen).toContain("childAccessAdultsAction");
  });

  it("gives the link flow its own rate-limit bucket, not the child login one", () => {
    const text = code(ACTIONS);
    // Sharing "childlogin" would make an adult's typos burn a real child's
    // login budget from the same household IP.
    expect(text).toMatch(/rateLimitAllow\("childcredlink"/);
    expect(text).not.toMatch(/rateLimitAllow\("childlogin"/);
  });
});
