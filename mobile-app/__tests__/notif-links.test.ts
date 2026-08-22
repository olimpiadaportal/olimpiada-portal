// Notification bodies must never open an external URL from inside the app.
//
// WHY THIS TEST EXISTS. `RichBody` renders ADMIN-SUPPLIED notification text, and
// it renders on the STUDENT notification screen. Until 2026-08-22 it called
// `Linking.openURL(url)` for any `https://` link the admin wrote, with no
// allowlist. That is two separate problems at once:
//
//   * Apple 3.1.1(a) — an administrator could push
//     `[Abunə ol](https://olympiq.ai/services)` AFTER review and steer users to a
//     non-IAP purchase page the reviewer never saw. Dynamic steering is the
//     violation whether or not money moves. Recorded as finding I5 in
//     docs/STORE_PAYMENTS_COMPLIANCE.md §7.1 — one of the two remaining iOS
//     blockers.
//   * child safety — an ungated tap-through to an arbitrary website, from a
//     screen a MINOR reads.
//
// These assertions read the SOURCE rather than rendering the component, because
// the property that matters is structural ("this module cannot open a URL"), not
// the behaviour of one branch. A source assertion also survives a rewrite of the
// component internals.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(__dirname, "..", "src", "lib", "notifMarkdown.tsx"),
  "utf8",
);

/**
 * Strip WHOLE-LINE `//` comments only.
 *
 * Not a general `//` strip: this file contains the regex literal
 * `/^https?:\/\//i`, whose closing delimiter sits right after an escaped slash
 * and therefore looks like the start of a comment. A greedy stripper eats the
 * rest of that line — silently removing the very code these tests inspect.
 */
function stripLineComments(text: string): string {
  return text.replace(/^[ \t]*\/\/[^\n]*$/gm, " ");
}

const CODE = stripLineComments(SRC);

describe("notification bodies cannot open external URLs", () => {
  it("does not import Linking at all", () => {
    // The strongest form of the guarantee: the module has no way to open a URL.
    // A future edit has to add the import back, which is visible in review —
    // unlike a condition somebody quietly inverts.
    expect(CODE).not.toMatch(
      /import\s*\{[^}]*\bLinking\b[^}]*\}\s*from\s*["']react-native["']/,
    );
    expect(CODE).not.toContain("Linking.openURL");
  });

  it("makes only root-relative paths tappable", () => {
    expect(CODE).toContain("isInAppPath(s.url)");
    expect(CODE).toContain("isSafeRelativeUrl(url)");
  });

  it("still PARSES external links, so the label text renders", () => {
    // The fix removes the TAP, not the words. An admin sentence that happens to
    // contain a link must still read correctly; dropping the label would make
    // notifications nonsensical rather than safe.
    expect(CODE).toContain("isAllowedLinkUrl");
  });
});

describe("isInAppPath", () => {
  // Re-implemented here rather than imported: importing the .tsx drags in React
  // Native, AppText and the theme provider for a one-line predicate. The suite
  // above pins that the real call site uses this exact name.
  const isInAppPath = (url: string): boolean =>
    url[0] === "/" && url[1] !== "/" && !url.includes("\\");

  it("accepts a root-relative path", () => {
    expect(isInAppPath("/child/olympiads")).toBe(true);
    expect(isInAppPath("/subscription")).toBe(true);
  });

  it.each([
    ["https://olympiq.ai/services"],
    ["http://example.com"],
    ["HTTPS://OLYMPIQ.AI/services"],
    ["//evil.example/steal"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
    ["mailto:someone@example.com"],
    [""],
  ])("rejects %p", (url) => {
    expect(isInAppPath(url)).toBe(false);
  });
});
