// Account-recovery pages must not carry the marketing navigation.
//
// WHY THIS TEST EXISTS. The mobile apps are purchase-silent BY ARCHITECTURE
// (docs/STORE_PAYMENTS_COMPLIANCE.md §4) so that an App Store reviewer never
// meets a non-IAP purchase path. The login screen's "forgot password" button
// opens THIS SITE in the system browser — and with the full public header, the
// reviewer lands one tap from "Qiymətlər" and real AZN prices. That is finding
// I8 in §7.1, and it undoes the app's whole compliance posture in a single hop.
//
// `maySeePurchaseUi()` does not cover it: that suppresses /services for a
// signed-in CHILD, and a reviewer is anonymous, so the pricing link renders.
//
// The three routes below are never navigated to — they are arrived at from a
// reset email, a confirmation link, or the app. Stripping the nav costs nothing
// and closes the hop.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LAYOUT = readFileSync(
  join(resolve(process.cwd(), "src"), "app", "(public)", "layout.tsx"),
  "utf8",
);

/** Source with comments blanked — they name the very things they forbid. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
}

const CODE = code(LAYOUT);

describe("the public layout strips chrome on account-recovery pages", () => {
  it("covers every route the app or an email can land a user on", () => {
    for (const route of ["/forgot-password", "/reset-password", "/verify-email"]) {
      expect(CODE, route).toContain(`"${route}"`);
    }
  });

  it("derives the page from the request path, not from a client hint", () => {
    // The pathname arrives via the middleware header. A client-supplied value
    // would let a crafted request restore the nav — the middleware `set`s (never
    // appends) this header for exactly that reason.
    expect(CODE).toContain("PATHNAME_HEADER");
    expect(CODE).toMatch(/const bareChrome =/);
  });

  it("hides the nav links, the login/register CTA and the footer columns", () => {
    // All three are steering surfaces. The brand link, theme toggle and language
    // picker deliberately stay: they are not steering, and the page still has to
    // work in three languages.
    expect(CODE).toMatch(/bareChrome \? null : \(\s*<PublicNavLinks/);
    expect(CODE).toMatch(/bareChrome \? null : \(\s*<div className="site-cta">/);
    expect(CODE).toMatch(/bareChrome\s*\?\s*null\s*:\s*footerCols\.map/);
  });

  it("matches the exact path, so a lookalike route cannot inherit the strip", () => {
    // `startsWith("/forgot-password")` alone would also match
    // "/forgot-password-marketing"; the comparison is equality or a real segment.
    expect(CODE).toMatch(/pathname === p \|\| pathname\.startsWith\(`\$\{p\}\/`\)/);
  });
});
