// WHICH PAGES PAY FOR THE BROWSER SDK.
//
// The Sentry browser SDK is +161.7 KB minified (+45%) on top of this site's
// JavaScript. It is loaded through a dynamic import, and the split is MARKETING
// vs EVERYTHING ELSE — so this predicate is the thing standing between an
// anonymous visitor on an Azerbaijani mobile connection and a third of a
// megabyte of diagnostics for a page that has nothing to diagnose.
//
// THE AUTH FUNNEL IS ON THE INSTRUMENTED SIDE, and that is a correction of the
// first cut. `/login` and `/register` are public pages, but a browser-only
// failure there — a hydration crash, a thrown submit handler — never reaches
// the Server Action, so the server SDK sees nothing, and the parent who could
// not create an account closes the tab rather than filing a bug. It is the most
// expensive place on the site to be blind.
//
// It is also one `startsWith` away from being wrong in a way nobody would
// notice: a naive prefix match turns `/olympiads` (parent, authenticated) into a
// match for `/olympiad-packages` (public catalogue), and the landing-page saving
// quietly disappears for every visitor who browses the packages.
import { describe, expect, it } from "vitest";

import {
  AUTHENTICATED_PREFIXES,
  AUTH_FUNNEL_PREFIXES,
  INSTRUMENTED_PREFIXES,
  shouldLoadBrowserSentry,
} from "@/lib/observability/browserSentry";

describe("the browser SDK loads where a failure costs a customer", () => {
  it("loads on the parent area, the student area and checkout", () => {
    for (const path of [
      "/dashboard",
      "/children",
      "/children/9e1f/edit",
      "/analytics",
      "/subscription",
      "/olympiads",
      "/leaderboard",
      "/notifications",
      "/profile",
      "/help",
      "/child",
      "/child/test/42",
      "/checkout",
      "/checkout/result",
    ]) {
      expect(shouldLoadBrowserSentry(path), path).toBe(true);
    }
  });

  it("loads on the login and register funnel, which is public but expensive", () => {
    // A marketing page that breaks costs a pageview. A registration that breaks
    // costs a customer, and leaves no server-side trace when it breaks in the
    // browser — the Server Action was never reached.
    for (const path of [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/auth/callback",
      "/auth/confirm",
      "/auth/confirmed",
    ]) {
      expect(shouldLoadBrowserSentry(path), path).toBe(true);
    }
  });

  it("does not load on a purely marketing page", () => {
    for (const path of [
      "/",
      "/about",
      "/contact",
      "/faq",
      "/news",
      "/news/some-article",
      "/privacy",
      "/services",
      "/subjects",
      "/terms",
      "/olympiad-packages",
    ]) {
      expect(shouldLoadBrowserSentry(path), path).toBe(false);
    }
  });

  it("matches on segment boundaries, so /olympiad-packages stays public", () => {
    // The whole saving depends on this one character. `/olympiads` is the
    // parent's purchased packages; `/olympiad-packages` is the public catalogue
    // a logged-out visitor browses.
    expect(shouldLoadBrowserSentry("/olympiads")).toBe(true);
    expect(shouldLoadBrowserSentry("/olympiad-packages")).toBe(false);
    expect(shouldLoadBrowserSentry("/children")).toBe(true);
    expect(shouldLoadBrowserSentry("/childrens-privacy")).toBe(false);
  });

  it("keeps every prefix rooted, so nothing matches by accident mid-path", () => {
    for (const prefix of INSTRUMENTED_PREFIXES) {
      expect(prefix.startsWith("/")).toBe(true);
      expect(prefix.endsWith("/")).toBe(false);
    }
  });

  it("builds the predicate from BOTH lists, so neither can be forgotten", () => {
    // The two lists exist to document two different reasons for instrumenting a
    // page. If `shouldLoadBrowserSentry` were ever rewired back to one of them,
    // the other half of the site goes dark without a single test failing
    // anywhere else.
    for (const prefix of [...AUTHENTICATED_PREFIXES, ...AUTH_FUNNEL_PREFIXES]) {
      expect(shouldLoadBrowserSentry(prefix), prefix).toBe(true);
      expect(INSTRUMENTED_PREFIXES).toContain(prefix);
    }
  });
});
