// Pins the vercel.app → brand-domain redirect (lib/canonicalHost.ts).
//
// The two directions of failure are not equally bad. Redirecting too LITTLE
// leaves a parent looking at a vercel.app address — cosmetic. Redirecting too
// MUCH breaks things silently: a redirected mobile BFF call loses its
// Authorization header, a redirected payment callback never reaches us. So most
// of these cases are about what must be LEFT ALONE.
import { describe, expect, it } from "vitest";
import { canonicalRedirect, type CanonicalInput } from "@/lib/canonicalHost";

const base: CanonicalInput = {
  host: "olimpiada-portal-5zga.vercel.app",
  pathname: "/forgot-password",
  search: "",
  method: "GET",
  vercelEnv: "production",
  siteUrl: "https://olympiq.ai",
};
const go = (over: Partial<CanonicalInput>) => canonicalRedirect({ ...base, ...over });

describe("redirects a person on the production vercel.app alias", () => {
  it("to the same path on the brand domain", () => {
    expect(go({})).toBe("https://olympiq.ai/forgot-password");
  });
  it("keeping the query string", () => {
    expect(go({ pathname: "/login", search: "?tab=student" })).toBe("https://olympiq.ai/login?tab=student");
  });
  it("for HEAD as well as GET, and with a port or uppercase host", () => {
    expect(go({ method: "HEAD" })).toBe("https://olympiq.ai/forgot-password");
    expect(go({ host: "OLIMPIADA-PORTAL-5ZGA.VERCEL.APP:443" })).toBe("https://olympiq.ai/forgot-password");
  });
  it("from the home page", () => {
    expect(go({ pathname: "/" })).toBe("https://olympiq.ai/");
  });
});

describe("leaves alone", () => {
  it("the mobile BFF and every other API route", () => {
    expect(go({ pathname: "/api/mobile/v1/me" })).toBeNull();
    expect(go({ pathname: "/api/payments/azericard/callback" })).toBeNull();
    expect(go({ pathname: "/api" })).toBeNull();
  });
  it("email links already in inboxes", () => {
    expect(go({ pathname: "/auth/confirm", search: "?token_hash=x&type=recovery" })).toBeNull();
    expect(go({ pathname: "/auth/callback" })).toBeNull();
  });
  it("anything that is not GET or HEAD", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) expect(go({ method })).toBeNull();
  });
  it("preview and local deployments", () => {
    expect(go({ vercelEnv: "preview" })).toBeNull();
    expect(go({ vercelEnv: undefined })).toBeNull();
  });
  it("the brand domain itself, and hosts that are not vercel.app", () => {
    expect(go({ host: "olympiq.ai" })).toBeNull();
    expect(go({ host: "staging.olympiq.ai" })).toBeNull();
    expect(go({ host: "localhost:3000" })).toBeNull();
  });
  it("lookalike hosts that only CONTAIN vercel.app", () => {
    expect(go({ host: "vercel.app.attacker.com" })).toBeNull();
  });
});

describe("only ever targets a real https brand origin", () => {
  it("does nothing when the site URL is missing or malformed", () => {
    expect(go({ siteUrl: undefined })).toBeNull();
    expect(go({ siteUrl: "" })).toBeNull();
    expect(go({ siteUrl: "not a url" })).toBeNull();
  });
  it("refuses http, localhost and vercel.app targets — no downgrade, no loop", () => {
    expect(go({ siteUrl: "http://olympiq.ai" })).toBeNull();
    expect(go({ siteUrl: "https://localhost" })).toBeNull();
    expect(go({ siteUrl: "https://olimpiada-portal-5zga.vercel.app" })).toBeNull();
    expect(go({ siteUrl: "https://another.vercel.app" })).toBeNull();
  });
  it("follows the deployment's own site URL, so staging's alias leads to staging", () => {
    expect(go({ host: "olympiq-staging.vercel.app", siteUrl: "https://staging.olympiq.ai" })).toBe(
      "https://staging.olympiq.ai/forgot-password",
    );
  });
  it("drops any path on the configured site URL", () => {
    expect(go({ siteUrl: "https://olympiq.ai/some/path/" })).toBe("https://olympiq.ai/forgot-password");
  });
});
