// News bodies must render as PLAIN, NON-TAPPABLE text inside the binary.
//
// The web app linkifies bare URLs in news bodies (web-app/src/lib/cmsLinkify.ts)
// because a dead URL on the website is a real defect. Mobile reads the SAME
// news_translations.body column and must NOT do the same thing.
//
// WHY, precisely. A news body is an ADMIN-CONTROLLED STRING. CLAUDE.md's store
// rules and docs/STORE_PAYMENTS_COMPLIANCE.md forbid a store build opening an
// external https link from notification content or any admin-controlled string:
// that is Apple 3.1.1(a) dynamic steering — content delivered AFTER review that
// steers a user off-platform. Azerbaijan gets no anti-steering relief, and the
// penalty is developer-account termination, not rejection.
//
// It is also a child-safety matter: the news body renders on student screens,
// so a tappable admin URL is an ungated link-out shown to a minor.
//
// This test is STRUCTURAL on purpose. It does not check rendered output — it
// checks that the mobile prose renderer never imports a linkifier, a Linking
// module, or gains a linkify prop. Re-enabling a tap then requires adding an
// import, which shows up in a diff and in this failure. The same technique
// guards notifMarkdown.tsx.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MOBILE_SRC = resolve(__dirname, "..", "src");
const WEB_SRC = resolve(__dirname, "..", "..", "web-app", "src");

function read(...parts: string[]): string {
  return readFileSync(join(...parts), "utf8").split("\r\n").join("\n");
}

describe("the mobile prose renderer cannot open a link", () => {
  const prose = read(MOBILE_SRC, "components", "CmsProse.tsx");

  it("imports no linkifier", () => {
    expect(prose).not.toMatch(/cmsLinkify/);
    expect(prose).not.toMatch(/linkify/i);
  });

  it("imports no Linking module", () => {
    // Linking.openURL is the only way to leave the app; it must not be reachable
    // from a component that renders admin-authored prose.
    expect(prose).not.toMatch(/\bLinking\b/);
    expect(prose).not.toMatch(/openURL/);
  });

  it("registers no press handler", () => {
    expect(prose).not.toMatch(/onPress/);
    expect(prose).not.toMatch(/Pressable/);
    expect(prose).not.toMatch(/TouchableOpacity/);
  });

  it("has no cmsLinkify module on the mobile side at all", () => {
    let exists = true;
    try {
      read(MOBILE_SRC, "lib", "cmsLinkify.ts");
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});

describe("the web twin deliberately DOES link, and says so", () => {
  // If someone "unifies" the two renderers, this fails and explains why they
  // must stay apart.
  const webLinkify = read(WEB_SRC, "lib", "cmsLinkify.ts");

  it("exists and is marked web-only", () => {
    expect(webLinkify).toMatch(/WEB ONLY/);
    expect(webLinkify).toMatch(/store build/i);
  });

  it("names the mobile counterpart so the divergence is discoverable", () => {
    expect(webLinkify).toMatch(/notifMarkdown/);
  });

  it("produces no HTML", () => {
    // The whole safety argument rests on this: data out, never markup.
    expect(webLinkify).not.toMatch(/dangerouslySetInnerHTML/);
    expect(webLinkify).not.toMatch(/innerHTML/);
  });
});

describe("the news article screen does not linkify either", () => {
  const article = read(MOBILE_SRC, "features", "news", "ArticleView.tsx");

  it("passes no linkify prop to the body renderer", () => {
    expect(article).not.toMatch(/linkify/i);
  });
});
