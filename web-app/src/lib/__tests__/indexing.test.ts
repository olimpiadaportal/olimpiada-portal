// Which deployments search engines may index (src/lib/indexing.ts) and the
// middleware wiring that serves the directive.
//
// WHY THESE TESTS EXIST. `staging.olympiq.ai` serves a byte-identical copy of
// the public marketing site. Until 2026-08-21 it carried no `noindex` and no
// `robots.txt`, so a crawler that found it would index a second copy of every
// public page and let it compete with olympiq.ai for the same queries. The
// dangerous direction of a mistake here is ASYMMETRIC — a production site that
// is accidentally noindex'd is visible the same day in a search console, while
// an indexed staging site is discovered weeks later and takes weeks more to
// clear — so the allowlist below is pinned by name, and every "is this
// production?" case that is not an exact match is asserted false.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOINDEX_HEADER_VALUE,
  PRODUCTION_HOSTS,
  ROBOTS_TAG_HEADER,
  isProductionHost,
  normalizeHost,
  robotsTagFor,
} from "@/lib/indexing";

describe("normalizeHost", () => {
  it("lowercases", () => {
    expect(normalizeHost("OlympIQ.AI")).toBe("olympiq.ai");
  });

  it("strips a trailing port", () => {
    expect(normalizeHost("olympiq.ai:443")).toBe("olympiq.ai");
    expect(normalizeHost("localhost:3000")).toBe("localhost");
  });

  it("strips the fully-qualified trailing dot", () => {
    expect(normalizeHost("olympiq.ai.")).toBe("olympiq.ai");
    expect(normalizeHost("olympiq.ai.:443")).toBe("olympiq.ai");
  });

  it("does not mistake an IPv6 literal's colons for a port", () => {
    // Only a SINGLE colon can separate a port from a registered name. Reading
    // the LAST colon of `::1` as a port separator turns the whole host into
    // ":" — wrong, even though both spellings fail the allowlist.
    expect(normalizeHost("::1")).toBe("::1");
    expect(normalizeHost("fe80::1")).toBe("fe80::1");
    expect(normalizeHost("[::1]:3000")).toBe("[::1]");
    expect(isProductionHost("::1")).toBe(false);
    expect(isProductionHost("[::1]:3000")).toBe(false);
  });

  it("returns empty for absent or blank input", () => {
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost(undefined)).toBe("");
    expect(normalizeHost("   ")).toBe("");
  });
});

describe("isProductionHost", () => {
  it("accepts exactly the two production hosts", () => {
    expect(isProductionHost("olympiq.ai")).toBe(true);
    expect(isProductionHost("www.olympiq.ai")).toBe(true);
    expect(PRODUCTION_HOSTS).toEqual(["olympiq.ai", "www.olympiq.ai"]);
  });

  it("rejects staging — the host this whole module exists for", () => {
    expect(isProductionHost("staging.olympiq.ai")).toBe(false);
  });

  it("rejects vercel aliases and preview deployments", () => {
    expect(isProductionHost("olympiq-staging-pi.vercel.app")).toBe(false);
    expect(isProductionHost("olimpiada-portal.vercel.app")).toBe(false);
    expect(isProductionHost("olympiq-git-staging-olimpiadaportal.vercel.app")).toBe(false);
  });

  it("rejects local development", () => {
    expect(isProductionHost("localhost:3000")).toBe(false);
    expect(isProductionHost("127.0.0.1:3000")).toBe(false);
  });

  it("rejects a missing host header rather than assuming production", () => {
    expect(isProductionHost(null)).toBe(false);
    expect(isProductionHost("")).toBe(false);
  });

  it("is not fooled by a host that merely CONTAINS a production host", () => {
    // Substring matching here would make olympiq.ai.evil.example indexable as
    // production, and would also let any *.olympiq.ai subdomain through — which
    // is exactly the staging case.
    expect(isProductionHost("olympiq.ai.evil.example")).toBe(false);
    expect(isProductionHost("notolympiq.ai")).toBe(false);
    expect(isProductionHost("evil.example/olympiq.ai")).toBe(false);
  });
});

describe("robotsTagFor", () => {
  it("emits nothing on production, so page metadata stays authoritative", () => {
    expect(robotsTagFor("olympiq.ai")).toBeNull();
    expect(robotsTagFor("www.olympiq.ai")).toBeNull();
  });

  it("emits noindex everywhere else", () => {
    expect(robotsTagFor("staging.olympiq.ai")).toBe(NOINDEX_HEADER_VALUE);
    expect(robotsTagFor("olympiq-staging-pi.vercel.app")).toBe(NOINDEX_HEADER_VALUE);
    expect(robotsTagFor(null)).toBe(NOINDEX_HEADER_VALUE);
  });

  it("directs a crawler to drop the page AND any cached copy of it", () => {
    // `noindex` alone leaves a cached copy servable from a search result after
    // the deployment is gone; `nofollow` stops link equity leaving a throwaway
    // host. Pinned as text because the value is the entire contract with the
    // crawler.
    expect(NOINDEX_HEADER_VALUE).toBe("noindex, nofollow, noarchive");
  });
});

describe("middleware wiring", () => {
  const middleware = readFileSync(
    resolve(__dirname, "../../middleware.ts"),
    "utf8",
  );

  it("sets the robots header on the response updateSession returns", () => {
    // The header must be applied to the SAME response object the auth
    // middleware hands back — building a fresh NextResponse here would drop the
    // refreshed session cookies updateSession just set.
    expect(middleware).toMatch(/const response = await updateSession\(request\)/);
    expect(middleware).toMatch(/response\.headers\.set\(ROBOTS_TAG_HEADER, robots\)/);
  });

  it("reads the host from the request header, never from an env var", () => {
    // VERCEL_ENV reads "production" on the staging project, and a stale
    // NEXT_PUBLIC_SITE_URL on the real site would deindex it. Only the host the
    // request arrived on knows which deployment answered.
    expect(middleware).toMatch(/robotsTagFor\(request\.headers\.get\("host"\)\)/);
    expect(middleware).not.toMatch(/VERCEL_ENV|NEXT_PUBLIC_SITE_URL|NODE_ENV/);
  });

  it("sets the header only when there is one to set", () => {
    // robotsTagFor returns null on production; writing that through would put a
    // literal "null" in the header.
    expect(middleware).toMatch(/if \(robots\) response\.headers\.set/);
  });
});
